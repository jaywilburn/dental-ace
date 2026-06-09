"use client";

export default function ApplicationFormError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <h1 className="text-[15px] font-semibold text-navy">Something went wrong</h1>
      <p className="mt-2 text-[12px] text-text-mid">
        We could not load this step of your application. Your saved progress is safe.
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white hover:bg-navy/90"
      >
        Try again
      </button>
    </div>
  );
}
