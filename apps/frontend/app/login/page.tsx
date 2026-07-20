"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "That email and password don't match."
          : "Couldn't sign you in. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Check on your sites' traffic."
      footer={
        <>
          New to SitePulse?{" "}
          <Link href="/register" className="font-medium text-pulse-deep hover:underline">
            Create an account
          </Link>
        </>
      }
    >
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
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        <div className="flex justify-end -mt-1">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-pulse-deep hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <p role="alert" className="text-sm text-signal-coral">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} className="mt-1 w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
