import type { Pin, CreatePinPayload } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function fetchPins(): Promise<Pin[]> {
  const res = await fetch(`${API_BASE}/api/pins`);
  if (!res.ok) throw new Error("Failed to fetch pins");
  return res.json();
}

export async function createPin(payload: CreatePinPayload): Promise<Pin> {
  const res = await fetch(`${API_BASE}/api/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to create pin");
  }
  return res.json();
}
