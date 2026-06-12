export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-7 w-56 animate-pulse rounded bg-border" />
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <div className="h-48 w-full animate-pulse rounded-lg bg-surface" />
          <div className="h-80 w-full animate-pulse rounded-lg bg-surface" />
        </div>
        <div className="h-64 w-full animate-pulse rounded-lg bg-surface" />
      </div>
    </div>
  );
}
