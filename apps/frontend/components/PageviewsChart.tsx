"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PageviewBucket } from "@/lib/types";
import type { Granularity } from "@/lib/types";
import { formatBucketLabel, formatFullNumber } from "@/lib/format";

function CustomTooltip({
  active,
  payload,
  label,
  granularity,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
  granularity: Granularity;
}) {
  if (!active || !payload?.length || !label) return null;
  const pageviews = payload.find((p) => p.dataKey === "pageviews")?.value ?? 0;
  const visitors = payload.find((p) => p.dataKey === "unique_visitors")?.value ?? 0;

  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-xs shadow-[0_8px_24px_rgba(16,21,26,0.1)]">
      <p className="font-medium text-ink">{formatBucketLabel(label, granularity)}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-pulse" />
        <span className="text-muted">Pageviews</span>
        <span className="ml-auto font-mono font-medium text-ink">{formatFullNumber(pageviews)}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-ink/30" />
        <span className="text-muted">Visitors</span>
        <span className="ml-auto font-mono font-medium text-ink">{formatFullNumber(visitors)}</span>
      </div>
    </div>
  );
}

export function PageviewsChart({
  data,
  granularity,
}: {
  data: PageviewBucket[];
  granularity: Granularity;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00B8A0" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#00B8A0" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#E1E6E3" />
        <XAxis
          dataKey="bucket"
          tickFormatter={(v) => formatBucketLabel(v, granularity)}
          tick={{ fill: "#63706C", fontSize: 12 }}
          axisLine={{ stroke: "#E1E6E3" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#63706C", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip granularity={granularity} />} />
        <Area
          type="monotone"
          dataKey="pageviews"
          stroke="#00B8A0"
          strokeWidth={2.5}
          fill="url(#pulseFill)"
        />
        <Area
          type="monotone"
          dataKey="unique_visitors"
          stroke="#10151A"
          strokeOpacity={0.35}
          strokeWidth={1.5}
          fill="transparent"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
