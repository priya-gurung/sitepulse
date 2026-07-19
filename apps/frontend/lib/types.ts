export interface User {
  id: string;
  email: string;
  name?: string | null;
}

export interface Site {
  id: string;
  name: string;
  domain: string;
  publicKey: string;
  isActive: boolean;
  createdAt?: string;
}

export type Granularity = "hour" | "day" | "week" | "month";

export interface OverviewMetrics {
  pageviews: number;
  unique_visitors: number;
  sessions: number;
}

export interface PageviewBucket {
  bucket: string;
  pageviews: number;
  unique_visitors: number;
}

export interface TopPage {
  url: string;
  views: number;
  unique_visitors: number;
}

export interface TopReferrer {
  referrer: string;
  visits: number;
  unique_visitors: number;
}

export interface GeoRow {
  country: string;
  unique_visitors: number;
  events: number;
}

export interface AskResponse {
  answer: string;
  [key: string]: unknown;
}

export type DateRangeKey = "24h" | "7d" | "30d" | "90d";
