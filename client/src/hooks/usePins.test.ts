import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePins } from "./usePins";

// Мокаем API модуль
vi.mock("../api/pins", () => ({
  fetchPins: vi.fn(),
  createPin: vi.fn(),
}));

import { fetchPins, createPin } from "../api/pins";

const mockFetchPins = vi.mocked(fetchPins);
const mockCreatePin = vi.mocked(createPin);

const samplePin = {
  _id: "abc123",
  nickname: "Тестер",
  city: "Москва",
  lat: 55.75,
  lng: 37.61,
  comment: "",
  createdAt: "2025-01-01T00:00:00Z",
};

describe("usePins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPins.mockResolvedValue([samplePin]);
  });

  it("загружает пины при маунте", async () => {
    const { result } = renderHook(() => usePins());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pins).toHaveLength(1);
    expect(result.current.pins[0].nickname).toBe("Тестер");
  });

  it("оптимистично добавляет пин до ответа сервера", async () => {
    mockCreatePin.mockResolvedValue({ ...samplePin, _id: "new-id", nickname: "Новый" });
    const { result } = renderHook(() => usePins());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addPin({
        nickname: "Новый",
        city: "Питер",
        lat: 59.9,
        lng: 30.3,
        comment: "",
      });
    });

    // До ответа сервера — пин уже есть (оптимистично)
    expect(result.current.pins.some((p) => p.nickname === "Новый")).toBe(true);
  });

  it("заменяет temp-пин реальным после ответа сервера", async () => {
    const createdPin = { ...samplePin, _id: "real-id", nickname: "Новый" };
    mockCreatePin.mockResolvedValue(createdPin);
    const { result } = renderHook(() => usePins());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addPin({
        nickname: "Новый",
        city: "Питер",
        lat: 59.9,
        lng: 30.3,
        comment: "",
      });
    });

    // temp-пин заменён реальным
    expect(result.current.pins.find((p) => p._id.startsWith("temp-"))).toBeUndefined();
    expect(result.current.pins.find((p) => p._id === "real-id")).toBeDefined();
  });

  it("откатывает оптимистичный пин при ошибке сервера", async () => {
    mockCreatePin.mockRejectedValue(new Error("Server error"));
    const { result } = renderHook(() => usePins());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const initialCount = result.current.pins.length;

    await act(async () => {
      try {
        await result.current.addPin({
          nickname: "Неудачник",
          city: "Нигде",
          lat: 0,
          lng: 0,
          comment: "",
        });
      } catch {
        // ожидаемая ошибка
      }
    });

    // Пин откатился
    expect(result.current.pins).toHaveLength(initialCount);
    expect(result.current.pins.some((p) => p.nickname === "Неудачник")).toBe(false);
  });

  it("устанавливает error при ошибке загрузки", async () => {
    mockFetchPins.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => usePins());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Network error");
  });
});
