/*
  Pure Course-ID helpers, extracted from the approve action so they can be
  unit-tested. Format: ACE-YYYY-##### (year + zero-padded 5-digit sequence).
  Sequence allocation must still happen under a year-scoped advisory lock in
  the caller; these functions only format and increment.
*/

export function nextSeqFromLast(lastCourseIdNumber: string | null): number {
  if (!lastCourseIdNumber) return 1;
  const lastSeq = Number(lastCourseIdNumber.split("-").at(-1));
  return (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
}

export function formatCourseId(year: number, seq: number): string {
  return `ACE-${year}-${String(seq).padStart(5, "0")}`;
}
