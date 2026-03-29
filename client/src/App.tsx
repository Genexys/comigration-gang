import { useState, useCallback, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MapView } from "./components/Map";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { AddPinModal } from "./components/AddPinModal";
import { usePins } from "./hooks/usePins";
import "./App.css";

const Admin = lazy(() => import("./pages/Admin"));
const Privacy = lazy(() => import("./pages/Privacy"));

function MapPage() {
  const { pins, loading, addPin } = usePins();
  const [placingMode, setPlacingMode] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);

  const handleStartPlacing = useCallback(() => {
    setPlacingMode(true);
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setPendingCoords({ lat, lng });
    setPlacingMode(false);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setPendingCoords(null);
  }, []);

  const handleSubmit = useCallback(
    async (nickname: string, comment: string, turnstileToken: string | null) => {
      if (!pendingCoords) return;
      // Close modal immediately — before optimistic update fires —
      // so the fresh nickname doesn't flash as "already exists"
      const coords = pendingCoords;
      setModalOpen(false);
      setPendingCoords(null);
      try {
        await addPin({
          nickname,
          city: `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}`,
          lat: coords.lat,
          lng: coords.lng,
          comment,
          turnstileToken: turnstileToken ?? undefined,
        });
      } catch (err) {
        console.error("Failed to add pin:", err);
      }
    },
    [pendingCoords, addPin]
  );

  return (
    <>
      <Header totalCount={pins.length} />
      <Sidebar pins={pins} />

      <button
        className="add-btn"
        onClick={handleStartPlacing}
        style={{ display: placingMode || modalOpen ? "none" : "flex" }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Я тут!
      </button>

      {placingMode && <div className="place-hint active">Кликни на карту, чтобы поставить пин ↓</div>}

      <AddPinModal
        open={modalOpen}
        onClose={handleModalClose}
        onSubmit={handleSubmit}
        existingNicknames={pins.map(p => p.nickname)}
      />

      {loading ? (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", zIndex: 9999 }}>
          <span style={{ fontFamily: "Unbounded, sans-serif", color: "var(--text-dim)" }}>Загрузка...</span>
        </div>
      ) : (
        <MapView pins={pins} placingMode={placingMode} onMapClick={handleMapClick} />
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<div style={{ background: "var(--bg)", minHeight: "100vh" }} />}>
              <Admin />
            </Suspense>
          }
        />
        <Route
          path="/privacy"
          element={
            <Suspense fallback={<div style={{ background: "var(--bg)", minHeight: "100vh" }} />}>
              <Privacy />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
