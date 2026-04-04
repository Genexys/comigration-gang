import { useState, useEffect, useCallback, useRef } from "react";
import type { Pin, CreatePinPayload } from "../types";
import { fetchPins, createPin as apiCreatePin } from "../api/pins";

export function usePins() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPins();
      setPins(data);
      setError(null);
    } catch {
      setError("Не удалось загрузить пины");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // SSE: real-time new pins from other users
  useEffect(() => {
    const es = new EventSource("/api/pins/stream");
    sseRef.current = es;

    es.addEventListener("new-pin", (e) => {
      try {
        const pin: Pin = JSON.parse(e.data);
        setPins((prev) => {
          // Skip if we already have this pin (our own optimistic insert)
          if (prev.some((p) => p._id === pin._id)) return prev;
          return [pin, ...prev];
        });
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener("error", () => {
      // EventSource auto-reconnects, no action needed
    });

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, []);

  const addPin = useCallback(
    async (payload: CreatePinPayload) => {
      // Optimistic update
      const tempPin: Pin = {
        _id: "temp-" + Date.now(),
        ...payload,
        createdAt: new Date().toISOString(),
      };
      setPins((prev) => [tempPin, ...prev]);

      try {
        const created = await apiCreatePin(payload);
        setPins((prev) => prev.map((p) => (p._id === tempPin._id ? created : p)));
        return created;
      } catch (err) {
        // Rollback
        setPins((prev) => prev.filter((p) => p._id !== tempPin._id));
        throw err;
      }
    },
    []
  );

  return { pins, loading, error, addPin, reload: load };
}
