import { ReactNode } from "react";
import { Logo } from "./Logo";
import { PulseLine } from "./PulseLine";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-4">
      {/* Ambient pulse lines — signature texture, not decoration for its own sake */}
      <div className="pointer-events-none absolute inset-x-0 top-24 opacity-[0.07]">
        <PulseLine className="h-16 w-full" animated={false} color="#10151A" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-24 opacity-[0.07] rotate-180">
        <PulseLine className="h-16 w-full" animated={false} color="#10151A" />
      </div>

      <div className="relative w-full max-w-[400px] animate-fadeUp">
        <div className="mb-8 flex justify-center">
          <Logo size="large" />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-8 shadow-[0_1px_2px_rgba(16,21,26,0.04),0_8px_24px_rgba(16,21,26,0.06)]">
          <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>

          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
