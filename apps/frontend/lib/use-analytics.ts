"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import { rangeToDates } from "./format";
import type {
  DateRangeKey,
  GeoRow,
  OverviewMetrics,
  PageviewBucket,
  TopPage,
  TopReferrer,
} from "./types";

interface AnalyticsData {
  overview: OverviewMetrics | null;
  pageviews: PageviewBucket[];
  topPages: TopPage[];
  referrers: TopReferrer[];
  geo: GeoRow[];
  loading: boolean;
  error: string | null;
}

export function useAnalytics(siteId: string | undefined, range: DateRangeKey): AnalyticsData {
  const [state, setState] = useState<AnalyticsData>({
    overview: null,
    pageviews: [],
    topPages: [],
    referrers: [],
    geo: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));
      const { from, to, granularity } = rangeToDates(range);

      try {
        const [overviewRes, pageviewsRes, topPagesRes, referrersRes, geoRes] = await Promise.all([
          apiRequest<{ data: OverviewMetrics[] }>("/analytics/overview", {
            query: { siteId, from, to },
          }),
          apiRequest<{ data: PageviewBucket[] }>("/analytics/pageviews", {
            query: { siteId, from, to, granularity },
          }),
          apiRequest<{ data: TopPage[] }>("/analytics/top-pages", {
            query: { siteId, from, to },
          }),
          apiRequest<{ data: TopReferrer[] }>("/analytics/referrers", {
            query: { siteId, from, to },
          }),
          apiRequest<{ data: GeoRow[] }>("/analytics/geo", {
            query: { siteId, from, to },
          }),
        ]);

        if (cancelled) return;

        setState({
          overview: overviewRes.data[0] ?? { pageviews: 0, unique_visitors: 0, sessions: 0 },
          pageviews: pageviewsRes.data,
          topPages: topPagesRes.data,
          referrers: referrersRes.data,
          geo: geoRes.data,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load analytics",
        }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [siteId, range]);

  return state;
}
