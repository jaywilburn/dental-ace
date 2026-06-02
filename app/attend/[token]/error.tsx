"use client";

export default function AttendError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        We could not load this course right now. Please try again.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        Retry
      </button>
    </main>
  );
}
