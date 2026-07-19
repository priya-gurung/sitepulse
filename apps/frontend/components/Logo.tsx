import { PulseLine } from "./PulseLine";

export function Logo({ size = "default" }: { size?: "default" | "large" }) {
  const isLarge = size === "large";
  return (
    <div className="flex items-center gap-2.5">
      <div className={isLarge ? "h-8 w-10" : "h-5 w-7"}>
        <PulseLine className="h-full w-full" />
      </div>
      <span
        className={
          isLarge
            ? "font-display text-2xl font-semibold tracking-tight text-ink"
            : "font-display text-lg font-semibold tracking-tight text-ink"
        }
      >
        SitePulse
      </span>
    </div>
  );
}
