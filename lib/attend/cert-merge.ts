/*
  Pure planner for folding several passing certificates one attendee holds on
  the same selective event into ONE certificate. Used by the one-off
  scripts/merge-smile-together-certs.ts; no database access here.

  The kept certificate is the one with the most sessions (ties go to the
  earliest issued), because its Certificate ID is on the fullest PDF the
  attendee already holds. Its session list becomes the union of every
  certificate plus any admin-credited sessions, each session counted once, in
  event order. Score mirrors the per-session-credit rule at issue time: one
  point per credited session.
*/

export type MergeSession = { id: string; name: string; hours: number; position: number };

export type MergeCert = { id: string; passed: boolean; attendedSessionIds: string[] };

export type CertMergePlan = {
  keepId: string;
  absorbIds: string[];
  /** Union of credited sessions, in event order. */
  sessionIds: string[];
  /** Index-aligned with sessionIds. */
  sessionNames: string[];
  /** Index-aligned with sessionIds. */
  sessionHours: number[];
  ceHours: number;
  score: number;
  /** False when the kept certificate already lists exactly these sessions. */
  contentChanged: boolean;
};

export function planCertMerge(opts: {
  sessions: MergeSession[];
  /** In issue order, oldest first. */
  certs: MergeCert[];
  addSessionIds?: string[];
}): CertMergePlan {
  const { sessions, certs, addSessionIds = [] } = opts;
  if (certs.length === 0) throw new Error("planCertMerge needs at least one certificate");
  const failed = certs.find((c) => !c.passed);
  if (failed) throw new Error(`Certificate ${failed.id} is a failed attempt and cannot be merged`);

  const byId = new Map(sessions.map((s) => [s.id, s]));
  const union = new Set<string>();
  for (const id of [...certs.flatMap((c) => c.attendedSessionIds), ...addSessionIds]) {
    if (!byId.has(id)) throw new Error(`Session ${id} is not on this event`);
    union.add(id);
  }

  // Most sessions wins; reduce keeps the earlier certificate on a tie.
  const keep = certs.reduce((best, c) =>
    c.attendedSessionIds.length > best.attendedSessionIds.length ? c : best,
  );

  const ordered = [...union].map((id) => byId.get(id)!).sort((a, b) => a.position - b.position);
  const keepSet = new Set(keep.attendedSessionIds);
  const contentChanged = keepSet.size !== union.size || [...union].some((id) => !keepSet.has(id));

  return {
    keepId: keep.id,
    absorbIds: certs.filter((c) => c.id !== keep.id).map((c) => c.id),
    sessionIds: ordered.map((s) => s.id),
    sessionNames: ordered.map((s) => s.name),
    sessionHours: ordered.map((s) => s.hours),
    ceHours: ordered.reduce((sum, s) => sum + s.hours, 0),
    score: ordered.length,
    contentChanged,
  };
}
