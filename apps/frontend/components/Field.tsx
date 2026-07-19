import { InputHTMLAttributes, forwardRef } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, id, ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        {...props}
        className="rounded-lg border border-border bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-pulse focus:bg-surface focus:outline-none"
      />
    </div>
  );
});
