"use client";

import { useState, FormEvent, useRef, useEffect, KeyboardEvent, ClipboardEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { apiRequest, ApiError, setToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const OTP_LENGTH = 6;

// 1. Inner Form Component handling the useSearchParams logic
function VerifyOtpForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const { login } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus the first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);

    // Auto-advance to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const newDigits = [...digits];
    for (let i = 0; i < OTP_LENGTH; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setDigits(newDigits);
    // Focus the last filled input or the next empty one
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const otp = digits.join("");
    if (otp.length !== OTP_LENGTH) {
      setError("Please enter the full 6-digit code.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ user: { id: string; email: string; name: string }; token: string }>(
        "/api/auth/verify-otp",
        { method: "POST", body: { email, otp } }
      );
      // Persist session and redirect
      setToken(data.token);
      window.localStorage.setItem("sitepulse_user", JSON.stringify(data.user));
      setSuccess(true);
      // Small delay so the user sees the success state, then redirect
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 600);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "That code is incorrect. Double-check and try again."
          : err instanceof ApiError && err.status === 400
          ? "This code has expired. Please register again to get a new code."
          : "Verification failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Check your email"
      subtitle={
        email
          ? `We sent a 6-digit code to ${email}`
          : "Enter the 6-digit code from your email"
      }
      footer={
        <>
          Didn&apos;t get the code?{" "}
          <Link href="/register" className="font-medium text-pulse-deep hover:underline">
            Try registering again
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* OTP digit inputs */}
        <div className="flex items-center justify-center gap-2.5">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              aria-label={`Digit ${i + 1}`}
              className={`
                h-12 w-11 rounded-lg border text-center font-mono text-xl font-semibold
                transition-all duration-150
                focus:border-pulse focus:bg-surface focus:outline-none focus:ring-2 focus:ring-pulse/20
                ${
                  success
                    ? "border-pulse bg-pulse-dim text-pulse-deep"
                    : error
                    ? "border-signal-coral bg-paper text-ink"
                    : "border-border bg-paper text-ink"
                }
              `}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="text-center text-sm text-signal-coral">
            {error}
          </p>
        )}

        {success && (
          <p className="text-center text-sm font-medium text-pulse-deep">
            ✓ Verified! Redirecting…
          </p>
        )}

        <Button type="submit" loading={loading} disabled={success} className="w-full">
          {success ? "Verified!" : "Verify email"}
        </Button>
      </form>
    </AuthShell>
  );
}

// 2. Exported page wrapper offering the runtime safety optimization boundary
export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Loading verification layout...</div>}>
      <VerifyOtpForm />
    </Suspense>
  );
}