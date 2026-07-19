"use client";

import { type FormEvent, useRef } from "react";
import { AlertCircle, AlertTriangle, Sparkles, X } from "lucide-react";
import { useAskAI } from "@/lib/use-ask-ai";
import { Button } from "./Button";

interface AskAIProps {
  siteId: string;
  from: string;
  to: string;
}

/**
 * Sends { siteId, question, from, to } to POST /ask on the dashboard
 * server (via the existing /api/backend rewrite + JWT-attaching
 * apiRequest client). The dashboard server authenticates the JWT,
 * confirms the user owns `siteId`, and only then forwards the question
 * to the FastAPI LangGraph agent — this component never talks to that
 * service directly. See lib/use-ask-ai.ts for the request lifecycle and
 * backend error-code handling (401/403/429/502).
 */
export function AskAI({ siteId, from, to }: AskAIProps) {
  const { question, setQuestion, answer, status, error, errorSeverity, ask, clear } = useAskAI({
    siteId,
    from,
    to,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoading = status === "loading";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    ask(question);
  }

  function handleClear() {
    clear();
    inputRef.current?.focus();
  }

  return (
    <div className="rounded-xl border border-pulse/20 bg-surface p-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 shrink-0 text-pulse-deep" aria-hidden="true" />

        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask AI for insights, suggestions, trends..."
            disabled={isLoading}
            aria-label="Ask AI about this site's analytics"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted/70 focus:outline-none disabled:opacity-60 pr-6"
          />
          {question.length > 0 && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear question"
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted transition-colors hover:bg-paper hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button type="submit" loading={isLoading} disabled={!question.trim()} className="shrink-0">
          Ask
        </Button>
      </form>

      {/* Inline loading skeleton — shown while waiting on the agent */}
      {isLoading && (
        <div className="mt-4 flex flex-col gap-2" aria-live="polite" aria-busy="true">
          <div className="h-3 w-11/12 animate-pulse rounded bg-border/60" />
          <div className="h-3 w-8/12 animate-pulse rounded bg-border/60" />
          <div className="h-3 w-9/12 animate-pulse rounded bg-border/60" />
        </div>
      )}

      {/* Error / notice states — amber for recoverable (403, 429), coral for hard failures */}
      {error && !isLoading && (
        <div
          role="alert"
          className={
            errorSeverity === "warning"
              ? "mt-4 flex items-start gap-2 rounded-lg bg-signal-amber/10 p-3 text-sm text-signal-amber"
              : "mt-4 flex items-start gap-2 rounded-lg bg-signal-coral/10 p-3 text-sm text-signal-coral"
          }
        >
          {errorSeverity === "warning" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{error}</span>
        </div>
      )}

      {/* Answer */}
      {answer && !isLoading && (
        <div className="mt-4 animate-fadeUp rounded-lg bg-pulse-dim/25 p-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-pulse-deep">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            AI insight
          </div>
          <p className="text-sm leading-relaxed text-ink">{answer}</p>
        </div>
      )}
    </div>
  );
}
