"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { apiRequest, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Hit the new OTP-based registration endpoint
      await apiRequest<{ message: string }>("/api/auth/register", {
        method: "POST",
        body: { name: name || undefined, email, password },
      });
      // Redirect to OTP verification page, pass email as query param
      router.push(`/verify-otp?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "An account with that email already exists."
          : err instanceof ApiError && err.status === 429
          ? "A verification code was already sent. Check your email or wait a few minutes."
          : err instanceof ApiError && err.status === 400
          ? "Password needs to be at least 8 characters."
          : "Couldn't create your account. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up privacy-first analytics in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-pulse-deep hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          id="name"
          label="Name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ada Lovelace"
        />
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
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />

        {error && (
          <p role="alert" className="text-sm text-signal-coral">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} className="mt-1 w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
