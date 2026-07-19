import type { DateRangeKey, Granularity } from "./types";

export function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    n
  );
}

export function formatFullNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function rangeToDates(range: DateRangeKey): { from: string; to: string; granularity: Granularity } {
  const to = new Date();
  const from = new Date(to);
  let granularity: Granularity = "day";

  switch (range) {
    case "24h":
      from.setHours(from.getHours() - 24);
      granularity = "hour";
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      granularity = "day";
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      granularity = "day";
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      granularity = "week";
      break;
  }

  return { from: from.toISOString(), to: to.toISOString(), granularity };
}

export function formatBucketLabel(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  if (granularity === "hour") {
    return d.toLocaleTimeString("en-US", { hour: "numeric" });
  }
  if (granularity === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Shortens a full URL down to its path for compact table display. */
export function displayPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

export function displayReferrer(referrer: string): string {
  try {
    const u = new URL(referrer);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return referrer;
  }
}

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/i.test(code)) return "🌐";
  const upper = code.toUpperCase();
  const codePoints = [...upper].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function countryName(code: string): string {
  try {
    return REGION_NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
