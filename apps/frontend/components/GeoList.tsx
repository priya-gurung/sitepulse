import { countryFlag, countryName, formatFullNumber } from "@/lib/format";
import type { GeoRow } from "@/lib/types";

export function GeoList({ rows }: { rows: GeoRow[] }) {
  const max = Math.max(...rows.map((r) => r.unique_visitors), 1);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="font-display text-sm font-semibold text-ink">Visitors by country</h3>

      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">No geographic data yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-0.5">
          {rows.slice(0, 10).map((row) => (
            <li key={row.country} className="relative overflow-hidden rounded-md">
              <div
                className="absolute inset-y-0 left-0 bg-pulse-dim/50"
                style={{ width: `${(row.unique_visitors / max) * 100}%` }}
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between gap-3 px-2.5 py-2 text-sm">
                <span className="flex items-center gap-2 truncate text-ink">
                  <span aria-hidden="true">{countryFlag(row.country)}</span>
                  {countryName(row.country)}
                </span>
                <span className="shrink-0 font-mono text-xs font-medium text-ink">
                  {formatFullNumber(row.unique_visitors)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
