"use client";

import { useCallback, useState } from "react";
import { apiRequest, ApiError } from "./api";
import { useAuth } from "./auth-context";
import type { AskResponse } from "./types";

export type AskAIStatus = "idle" | "loading" | "success" | "error";
export type AskAISeverity = "warning" | "error" | null;

interface UseAskAIParams {
  siteId: string;
  from: string;
  to: string;
}

interface UseAskAIResult {
  question: string;
  setQuestion: (value: string) => void;
  answer: string | null;
  status: AskAIStatus;
  error: string | null;
  errorSeverity: AskAISeverity;
  ask: (question: string) => Promise<void>;
  clear: () => void;
}

/**
 * Drives POST /ask against the dashboard server: attaches siteId/from/to
 * from the caller (the page owns the date-range/site context — this hook
 * doesn't guess at it), and maps the backend's specific error codes onto
 * user-facing behavior:
 *
 *   401 missing_token / invalid_or_expired_token -> sign the user out
 *   403 forbidden                                -> "you don't own this site"
 *   429 rate_limited                             -> surface backend `detail`
 *   502 ai_service_unavailable                   -> "AI service is down"
 *   anything else                                -> generic fallback
 */
export function useAskAI({ siteId, from, to }: UseAskAIParams): UseAskAIResult {
  const { logout } = useAuth();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [status, setStatus] = useState<AskAIStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorSeverity, setErrorSeverity] = useState<AskAISeverity>(null);

  const ask = useCallback(
    async (rawQuestion: string) => {
      const trimmed = rawQuestion.trim();
      if (!trimmed) return;

      setStatus("loading");
      setError(null);
      setErrorSeverity(null);
      setAnswer(null);

      try {
        const data = await apiRequest<AskResponse>("/ask", {
          method: "POST",
          body: { siteId, question: trimmed, from, to },
        });
        setAnswer(data.answer);
        setStatus("success");
      } catch (err) {
        if (!(err instanceof ApiError)) {
          setError("Couldn't get an answer. Try again.");
          setErrorSeverity("error");
          setStatus("error");
          return;
        }

        switch (err.status) {
          case 401:
            // missing_token or invalid_or_expired_token — session is no
            // longer valid, so route through the normal logout flow
            // rather than leaving the user stuck on a broken screen.
            setError("Your session has expired. Signing you out…");
            setErrorSeverity("error");
            setStatus("error");
            logout();
            return;
          case 403:
            setError("You don't have access to this site's data.");
            setErrorSeverity("warning");
            break;
          case 429:
            setError(err.detail || "You're asking a bit fast — wait a moment and try again.");
            setErrorSeverity("warning");
            break;
          case 502:
            setError("The AI service is temporarily unavailable. Try again shortly.");
            setErrorSeverity("error");
            break;
          default:
            setError("Couldn't get an answer. Try again.");
            setErrorSeverity("error");
        }
        setStatus("error");
      }
    },
    [siteId, from, to, logout]
  );

  const clear = useCallback(() => {
    setQuestion("");
    setAnswer(null);
    setError(null);
    setErrorSeverity(null);
    setStatus("idle");
  }, []);

  return { question, setQuestion, answer, status, error, errorSeverity, ask, clear };
}
