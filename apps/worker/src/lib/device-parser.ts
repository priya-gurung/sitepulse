import { UAParser } from "ua-parser-js";

export interface ParsedDevice {
  deviceType: "mobile" | "tablet" | "desktop";
  browser: string | null;
  os: string | null;
}

/**
 * Full user-agent parsing is comparatively expensive, which is exactly
 * why it happens here in the worker (async, horizontally scalable) and
 * NOT in the ingestion server's request handler.
 */
export function parseDevice(userAgent: string): ParsedDevice {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const deviceType: ParsedDevice["deviceType"] =
    result.device.type === "mobile"
      ? "mobile"
      : result.device.type === "tablet"
      ? "tablet"
      : "desktop";

  return {
    deviceType,
    browser: result.browser.name ?? null,
    os: result.os.name ?? null,
  };
}
