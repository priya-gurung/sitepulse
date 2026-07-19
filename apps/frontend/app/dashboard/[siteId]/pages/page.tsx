"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAnalytics } from "@/lib/use-analytics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { EmptyState } from "@/components/EmptyState";
import { displayPath, formatFullNumber } from "@/lib/format";
import type { DateRangeKey } from "@/lib/types";

export default function PagesReportPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [range, setRange] = useState<DateRangeKey>("7d");
  const { topPages, loading } = useAnalytics(siteId, range);

  return (
    <div>
      <PageHeader
        title="Pages"
        subtitle="Every page ranked by views in the selected range."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <div className="px-8 py-6">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {loading ? (
            <div className="p-5">
              <div className="h-64 animate-pulse rounded-lg bg-border/40" />
            </div>
          ) : topPages.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No page views yet"
                description="Once visitors arrive, their most-viewed pages will show up here ranked by traffic."
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Page</th>
                  <th className="px-5 py-3 text-right">Views</th>
                  <th className="px-5 py-3 text-right">Unique visitors</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((page) => (
                  <tr key={page.url} className="border-b border-border last:border-0 hover:bg-paper/60">
                    <td className="px-5 py-3 font-medium text-ink">{displayPath(page.url)}</td>
                    <td className="px-5 py-3 text-right font-mono text-ink">
                      {formatFullNumber(page.views)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-muted">
                      {formatFullNumber(page.unique_visitors)}
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
