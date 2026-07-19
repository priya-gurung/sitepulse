import { formatFullNumber } from "@/lib/format";

interface RankedRow {
  key: string;
  label: string;
  value: number;
}

export function RankedList({
  title,
  rows,
  emptyLabel,
  valueLabel,
}: {
  title: string;
  rows: RankedRow[];
  emptyLabel: string;
  valueLabel: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{valueLabel}</span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-0.5">
          {rows.slice(0, 8).map((row) => (
            <li key={row.key} className="relative overflow-hidden rounded-md">
              <div
                className="absolute inset-y-0 left-0 bg-pulse-dim/50"
                style={{ width: `${(row.value / max) * 100}%` }}
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between gap-3 px-2.5 py-2 text-sm">
                <span className="truncate text-ink" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 font-mono text-xs font-medium text-ink">
                  {formatFullNumber(row.value)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
