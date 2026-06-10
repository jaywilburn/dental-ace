import { cn } from "@/lib/utils";

/*
  Form input primitives styled to match logic/dentalace-dev-mockup-suite-v3.html
  .form-input / .form-select / .form-label. Pure server-rendered tags; no client
  state. Used by the multi-step application form.
*/

const inputBase =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none transition-colors focus:border-ace focus:ring-2 focus:ring-ace/30";

export function FormLabel({
  children,
  hint,
  required,
}: {
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-[11px] font-semibold text-text-mid">
      {children}
      {required ? <span className="ml-1 text-red-500">*</span> : null}
      {hint ? (
        <span className="ml-2 text-[10px] font-normal text-text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}

export function FormTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(inputBase, "min-h-[88px] resize-y", props.className)}
    />
  );
}

export function FormSelect({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: readonly string[] }) {
  return (
    <select {...props} className={cn(inputBase, "bg-white", props.className)}>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

export function FormCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <p className="mb-4 border-b border-border pb-3 text-[13px] font-semibold text-navy">
        {title}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

export function FormField({
  children,
  fullWidth,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return <div className={fullWidth ? "md:col-span-2" : undefined}>{children}</div>;
}

/** Banner shown when a step's server-side validation rejects the submission. */
export function FormErrorBanner({ detail }: { detail?: string }) {
  return (
    <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
      <p className="font-semibold">This step could not be saved.</p>
      <p>
        {detail ??
          "Check that every required field is filled in and meets the minimum length, then try again."}
      </p>
    </div>
  );
}

export function FormNav({
  back,
  nextLabel,
}: {
  back?: { href: string; label: string };
  nextLabel: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-between">
      {back ? (
        <a
          href={back.href}
          className="rounded-md border border-border bg-white px-4 py-2 text-[12px] font-semibold text-navy transition-colors hover:bg-surface"
        >
          ← {back.label}
        </a>
      ) : (
        <span />
      )}
      <button
        type="submit"
        className="rounded-md bg-navy px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
      >
        {nextLabel} →
      </button>
    </div>
  );
}
