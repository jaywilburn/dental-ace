import { nextSeqFromLast } from "@/lib/reviewer/course-id";

/*
  Pure Event-ID helpers, sibling of lib/reviewer/course-id.ts. Format:
  ACE-EVT-YYYY-##### (distinct prefix from courses' ACE-YYYY-#####). Sequence
  allocation must happen under a year-scoped advisory lock in the caller; these
  only format and increment. nextSeqFromLast is shared with the course helper
  (it splits on "-" and reads the trailing number, which works for both forms).
*/

export { nextSeqFromLast };

export function formatEventId(year: number, seq: number): string {
  return `ACE-EVT-${year}-${String(seq).padStart(5, "0")}`;
}
