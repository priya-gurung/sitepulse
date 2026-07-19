"use client";

import clsx from "clsx";
import type { DateRangeKey } from "@/lib/types";

const PRESETS: { key: DateRangeKey; label: string }[] = [
  { key: "24h", label: "24 hours" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeKey;
  onChange: (v: DateRangeKey) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          onClick={() => onChange(preset.key)}
          className={clsx(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === preset.key ? "bg-ink text-white" : "text-muted hover:text-ink"
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
