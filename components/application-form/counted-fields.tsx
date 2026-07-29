"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { inputBase } from "./form-styles";

/*
  Textarea with a live character counter.

  The wizard step pages stay server components; this is the smallest client
  island that lets a provider SEE they are approaching a cap. Before this, the
  only feedback was a server rejection after submitting the whole step, and
  there was no counter anywhere in the app.

  Deliberately UNCONTROLLED: defaultValue passes straight through and onInput
  only updates the counter, never the value. That keeps React out of the typing
  path (no re-render per keystroke on a 20,000-character outline) and preserves
  the existing defaultValue-from-draft behavior the step pages rely on.
*/

type CountedTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "maxLength"
> & {
  /** The server-side cap for this field. Also applied as the browser maxLength. */
  max: number;
  invalid?: boolean;
};

export function CountedTextarea({
  max,
  invalid,
  className,
  defaultValue,
  onInput,
  id,
  name,
  ...props
}: CountedTextareaProps) {
  const [length, setLength] = useState(() => String(defaultValue ?? "").length);

  const pct = max > 0 ? length / max : 0;
  const near = pct >= 0.9;
  const atCap = length >= max;
  const counterId = `${id ?? name ?? "field"}-count`;

  return (
    <>
      <textarea
        {...props}
        id={id}
        name={name}
        defaultValue={defaultValue}
        maxLength={max}
        aria-describedby={counterId}
        aria-invalid={invalid || undefined}
        onInput={(e) => {
          setLength(e.currentTarget.value.length);
          onInput?.(e);
        }}
        className={cn(
          inputBase,
          "min-h-[88px] resize-y",
          invalid && "border-red-400 focus:border-red-500 focus:ring-red-300/40",
          className,
        )}
      />
      <p
        id={counterId}
        aria-live="polite"
        className={cn(
          "mt-1 text-right text-[10px] tabular-nums",
          atCap ? "text-red-600" : near ? "text-orange-600" : "text-text-muted",
        )}
      >
        {length.toLocaleString()} / {max.toLocaleString()}
        {atCap ? " (limit reached)" : null}
      </p>
    </>
  );
}
