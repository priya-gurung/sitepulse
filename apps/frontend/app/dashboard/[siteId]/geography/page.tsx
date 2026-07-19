"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAnalytics } from "@/lib/use-analytics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { EmptyState } from "@/components/EmptyState";
import { countryFlag, countryName, formatFullNumber } from "@/lib/format";
import type { DateRangeKey } from "@/lib/types";

export default function GeographyReportPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [range, setRange] = useState<DateRangeKey>("7d");
  const { geo, loading } = useAnalytics(siteId, range);

  return (
    <div>
      <PageHeader
        title="Geography"
        subtitle="Where your visitors are connecting from."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <div className="px-8 py-6">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {loading ? (
            <div className="p-5">
              <div className="h-64 animate-pulse rounded-lg bg-border/40" />
            </div>
          ) : geo.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No geographic data yet"
                description="Country-level visitor data appears here once traffic starts coming in through a CDN or proxy that reports geo headers."
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Country</th>
                  <th className="px-5 py-3 text-right">Unique visitors</th>
                  <th className="px-5 py-3 text-right">Events</th>
                </tr>
              </thead>
              <tbody>
                {geo.map((row) => (
                  <tr key={row.country} className="border-b border-border last:border-0 hover:bg-paper/60">
                    <td className="px-5 py-3 font-medium text-ink">
                      <span className="mr-2" aria-hidden="true">
                        {countryFlag(row.country)}
                      </span>
                      {countryName(row.country)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-ink">
                      {formatFullNumber(row.unique_visitors)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-muted">
                      {formatFullNumber(row.events)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
