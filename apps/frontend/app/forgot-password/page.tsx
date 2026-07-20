"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { apiRequest, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest<{ message: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "Please enter a valid email address."
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <>
          Remember your password?{" "}
          <Link href="/login" className="font-medium text-pulse-deep hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-2">
          {/* Success checkmark */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pulse-dim">
            <svg
              className="h-6 w-6 text-pulse-deep"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <p className="text-center text-sm text-ink font-medium">
            Check your inbox
          </p>
          <p className="text-center text-sm text-muted">
            If an account exists for <span className="font-medium text-ink">{email}</span>,
            you&apos;ll receive a password reset link shortly.
          </p>
          <Link
            href="/login"
            className="mt-2 text-sm font-medium text-pulse-deep hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />

          {error && (
            <p role="alert" className="text-sm text-signal-coral">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="mt-1 w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
