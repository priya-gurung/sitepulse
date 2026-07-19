import { trace, SpanStatusCode } from "@opentelemetry/api";
import { aiAgentDuration } from "./metrics";

/**
 * Client for the FastAPI microservice exposing the LangGraph agent's
 * `/ask` endpoint.
 *
 * Used ONLY by the dashboard server — same read/write boundary discipline
 * as `tinybird.ts` and `kafka.ts`. Ingestion and the worker have no
 * business calling an LLM agent; only authenticated, authorized dashboard
 * requests reach this.
 */

function getAiServiceUrl(): string {
  const url = process.env.AI_SERVICE_URL;
  if (!url) throw new Error("AI_SERVICE_URL is not configured");
  return url.replace(/\/$/, "");
}

interface AskAgentParams {
  siteId: string;
  question: string;
  startDate: string; // ISO8601
  endDate: string; // ISO8601
}

export interface AskAgentResponse {
  answer: string;
  [key: string]: unknown;
}

const REQUEST_TIMEOUT_MS = 45_000; // LangGraph agents can take a while — tool calls, retries, etc.

/**
 * Calls the FastAPI agent's POST /ask endpoint, translating our internal
 * camelCase params into the AskRequest shape it expects:
 *   { site_id, question, date_range: { start_date, end_date } }
 */
export async function askAgent(params: AskAgentParams): Promise<AskAgentResponse> {
  const tracer = trace.getTracer("sitepulse-ai-agent");

  return tracer.startActiveSpan("ai_agent.ask", async (span) => {
    const start = performance.now();
    span.setAttribute("sitepulse.site_id", params.siteId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      console.log("[Dashboard Node Env Check] Key length:", process.env.INTERNAL_AI_API_KEY?.length);
      console.log("[Dashboard Node Env Check] Target URL:", process.env.AI_SERVICE_URL);
      const res = await fetch(`${getAiServiceUrl()}/ask`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(process.env.INTERNAL_AI_API_KEY
            ? { "X-Internal-Api-Key": process.env.INTERNAL_AI_API_KEY }
            : {}),
         },
        body: JSON.stringify({
          site_id: params.siteId,
          question: params.question,
          date_range: {
            start_date: params.startDate,
            end_date: params.endDate,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`AI agent request failed (${res.status}): ${body}`);
      }

      const data = (await res.json()) as AskAgentResponse;
      span.setStatus({ code: SpanStatusCode.OK });
      return data;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const error = isAbort ? new Error("AI agent request timed out") : (err as Error);
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      clearTimeout(timeout);
      aiAgentDuration.record(performance.now() - start);
      span.end();
    }
  });
}
