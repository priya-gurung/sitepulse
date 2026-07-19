interface PulseLineProps {
  className?: string;
  animated?: boolean;
  color?: string;
}

/**
 * The signature element: a literal pulse/waveform line, echoing the
 * product name. Used in the logo mark, the live-visitor indicator, and
 * as ambient texture behind the auth screens — never as generic
 * decoration elsewhere.
 */
export function PulseLine({ className, animated = true, color = "#00B8A0" }: PulseLineProps) {
  return (
    <svg
      viewBox="0 0 240 40"
      fill="none"
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 20 H70 L82 20 L90 4 L100 36 L110 20 L120 20 L128 12 L136 28 L144 20 H240"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={animated ? "240" : undefined}
        className={animated ? "animate-pulseTravel" : undefined}
      />
    </svg>
  );
}
