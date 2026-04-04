import { useState, useEffect, useCallback } from "react";
import type { Pin, CreatePinPayload } from "../types";
import { fetchPins, createPin as apiCreatePin } from "../api/pins";

export function usePins() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPins();
      setPins(data);
      setError(null);
    } catch (err) {
      setError("Не удалось загрузить пины");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
