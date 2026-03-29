import { useState, useEffect, useRef } from "react";

interface Result {
  lat: string;
  lon: string;
  display_name: string;
}

interface LocationSearchProps {
  onSelect: (lat: number, lng: number, name: string) => void;
  onCancel: () => void;
}

function parseCoords(input: string): { lat: number; lng: number } | null {
  const match = input.trim().match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return { lat, lng };
  }
  return null;
}

export function LocationSearch({ onSelect, onCancel }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    // Coordinate shortcut — no API call needed
    const coords = parseCoords(trimmed);
    if (coords) {
      setResults([{
        lat: String(coords.lat),
        lon: String(coords.lng),
        display_name: `${coords.lat}, ${coords.lng}`,
      }]);
      setOpen(true);
      return;
    }

    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=6&accept-language=ru,en`;
        const res = await fetch(url, {
          signal: abortRef.current.signal,
          headers: { "Accept-Language": "ru,en" },
        });
        const data: Result[] = await res.json();
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        // aborted — ignore
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(r: Result) {
    onSelect(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className="location-search">
      <div className="location-search-bar">
        <svg className="location-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Город, страна или координаты (55.75, 37.61)..."
          className="location-search-input"
          autoComplete="off"
        />
        {loading && <span className="location-search-spinner" />}
        <button className="location-search-cancel" onClick={onCancel} title="Отмена (Esc)">✕</button>
      </div>

      {open && results.length > 0 && (
        <ul className="location-search-results">
          {results.map((r, i) => (
            <li key={i} onClick={() => handleSelect(r)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              <span>{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="location-search-hint">— или кликни прямо на карту —</p>
    </div>
  );
}
