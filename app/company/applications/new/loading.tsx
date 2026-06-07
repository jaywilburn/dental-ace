export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-7 w-56 animate-pulse rounded bg-border" />
      <div className="h-2 w-full animate-pulse rounded bg-surface" />
      <div className="h-80 w-full animate-pulse rounded-lg bg-surface" />
    </div>
  );
}
