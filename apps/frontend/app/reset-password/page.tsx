"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { apiRequest, ApiError } from "@/lib/api";

// 1. Core structural logic moved here to support dynamic execution
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!token) {
      setError("Invalid reset link. Please request a new one.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest<{ message: string }>("/api/auth/reset-password", {
        method: "POST",
        body: { token, password },
      });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "This reset link has expired or is invalid. Please request a new one."
          : err instanceof ApiError && err.status === 400
          ? "Password needs to be at least 8 characters."
          : "Password reset failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // No token in the URL
  if (!token) {
    return (
      <AuthShell
        title="Invalid link"
        subtitle="This password reset link is missing or malformed."
        footer={
          <>
            <Link href="/forgot-password" className="font-medium text-pulse-deep hover:underline">
              Request a new reset link
            </Link>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-signal-coral/10">
            <svg
              className="h-6 w-6 text-signal-coral"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <p className="text-center text-sm text-muted">
            The reset link appears to be incomplete. Please check your email for the correct link
            or request a new one.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password for your account."
      footer={
        <>
          Remember your password?{" "}
          <Link href="/login" className="font-medium text-pulse-deep hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-2">
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
            Password updated
          </p>
          <p className="text-center text-sm text-muted">
            Your password has been changed successfully. You can now sign in with your new password.
          </p>
          <Link
            href="/login"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-pulse-deep"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field
            id="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <Field
            id="confirm-password"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
          />

          {error && (
            <p role="alert" className="text-sm text-signal-coral">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="mt-1 w-full">
            Reset password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

// 2. Default export wrapper protecting static layout generation from runtime params
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Loading reset interface...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}