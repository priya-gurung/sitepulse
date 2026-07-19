"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAnalytics } from "@/lib/use-analytics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { StatCard } from "@/components/StatCard";
import { PageviewsChart } from "@/components/PageviewsChart";
import { RankedList } from "@/components/RankedList";
import { GeoList } from "@/components/GeoList";
import { EmptyState } from "@/components/EmptyState";
import { AskAI } from "@/components/AskAI";
import { displayPath, displayReferrer, rangeToDates } from "@/lib/format";
import type { DateRangeKey } from "@/lib/types";

export default function SiteOverviewPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [range, setRange] = useState<DateRangeKey>("7d");
  const { overview, pageviews, topPages, referrers, geo, loading, error } = useAnalytics(
    siteId,
    range
  );
  const { from, to, granularity } = rangeToDates(range);

  const hasAnyData = (overview?.pageviews ?? 0) > 0 || pageviews.length > 0;

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Traffic across all pages on this site."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <div className="px-8 py-6">
        <div className="mb-6">
          <AskAI siteId={siteId} from={from} to={to} />
        </div>

        {error ? (
          <EmptyState
            title="Couldn't load analytics"
            description={error}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Unique visitors" value={overview?.unique_visitors ?? 0} loading={loading} accent />
              <StatCard label="Pageviews" value={overview?.pageviews ?? 0} loading={loading} />
              <StatCard label="Sessions" value={overview?.sessions ?? 0} loading={loading} />
            </div>

            <div className="mt-6 rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display text-sm font-semibold text-ink">Pageviews over time</h3>
              {!loading && !hasAnyData ? (
                <div className="py-10">
                  <EmptyState
                    title="No traffic yet"
                    description="Add the tracking snippet to your site and this chart will start filling in as visitors arrive."
                  />
                </div>
              ) : loading ? (
                <div className="mt-4 h-[280px] animate-pulse rounded-lg bg-border/40" />
              ) : (
                <div className="mt-2">
                  <PageviewsChart data={pageviews} granularity={granularity} />
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <RankedList
                title="Top pages"
                valueLabel="Views"
                emptyLabel="No pageviews in this range."
                rows={topPages.map((p) => ({ key: p.url, label: displayPath(p.url), value: p.views }))}
              />
              <RankedList
                title="Top referrers"
                valueLabel="Visits"
                emptyLabel="No referral traffic in this range."
                rows={referrers.map((r) => ({
                  key: r.referrer,
                  label: displayReferrer(r.referrer),
                  value: r.visits,
                }))}
              />
              <GeoList rows={geo} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
