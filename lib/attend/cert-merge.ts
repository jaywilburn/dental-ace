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

export type CertMergeWrite =
  | { kind: "delete"; ids: string[]; passed: boolean }
  | { kind: "update"; id: string; email: string; sessionIds: string[]; ceHours: number; score: number };

/**
 * The database writes for a batch of merges, in the only safe order.
 *
 * issued_certificates_event_attendee_uq (sql-migrations/0014) allows one
 * passing certificate per (event, lower(email)) and is checked per statement.
 * The kept certificate often sits under the SECOND email while the duplicate
 * sits under the primary one, so every delete must land before any kept
 * certificate is moved to its primary email.
 */
export function orderMergeWrites(
  items: { plan: CertMergePlan; primaryEmail: string; failedIds: string[] }[],
): CertMergeWrite[] {
  return [
    { kind: "delete", ids: items.flatMap((i) => i.failedIds), passed: false },
    { kind: "delete", ids: items.flatMap((i) => i.plan.absorbIds), passed: true },
    ...items.map(
      (i): CertMergeWrite => ({
        kind: "update",
        id: i.plan.keepId,
        email: i.primaryEmail.toLowerCase(),
        sessionIds: i.plan.sessionIds,
        ceHours: i.plan.ceHours,
        score: i.plan.score,
      }),
    ),
  ];
}

/**
 * Certificates whose ProTrack claim (ce_certificates row) would go wrong if
 * one existed: a deleted certificate orphans its claim, and a kept certificate
 * that changes hours or moves email leaves its claim stale or on the wrong
 * account. The merge refuses to run while any of these is claimed.
 */
export function claimSensitiveIds(items: { plan: CertMergePlan; emailChanged: boolean }[]): string[] {
  return items.flatMap((i) => [
    ...i.plan.absorbIds,
    ...(i.plan.contentChanged || i.emailChanged ? [i.plan.keepId] : []),
  ]);
}
