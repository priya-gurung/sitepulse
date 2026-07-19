import clsx from "clsx";
import { formatCompactNumber } from "@/lib/format";

export function StatCard({
  label,
  value,
  accent = false,
  loading = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-border bg-surface p-5",
        accent && "border-pulse/30 bg-pulse-dim/20"
      )}
    >
      <p className="text-sm font-medium text-muted">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-20 animate-pulse rounded bg-border/70" />
      ) : (
        <p className="mt-1 font-mono text-3xl font-medium tabular-nums text-ink">
          {formatCompactNumber(value)}
        </p>
      )}
    </div>
  );
}
