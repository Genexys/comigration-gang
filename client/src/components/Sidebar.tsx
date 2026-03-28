import type { Pin } from "../types";

interface SidebarProps {
  pins: Pin[];
}

export function Sidebar({ pins }: SidebarProps) {
  const cityCounts: Record<string, number> = {};
  pins.forEach((p) => {
    cityCounts[p.city] = (cityCounts[p.city] || 0) + 1;
  });

  const sorted = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxCount = sorted[0]?.[1] || 1;

  return (
    <div className="sidebar">
      <h3>Топ города</h3>
      {sorted.map(([city, count], i) => {
        const pct = Math.round((count / maxCount) * 100);
        return (
          <div className="city-row" key={city}>
            <span className={`rank${i === 0 ? " top" : ""}`}>{i + 1}</span>
            <span className="name">{city}</span>
            <span className="bar-wrap">
              <span className="bar" style={{ width: `${pct}%` }} />
            </span>
            <span className="cnt">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
