import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TARGETS,
  CERT_TARGETS,
  EXCLUDED,
  emailState,
  parseTypoArgs,
  pendingAuth,
  pendingDbWork,
  preflightViolations,
  type AccountSnapshot,
  type CertSnapshot,
} from "./attendee-email-typos-plan";

const kyle = CERT_TARGETS.find((t) => t.label === "Kyle Lesko")!;
const stephen = CERT_TARGETS.find((t) => t.label === "Stephen Scott Hall")!;
const eileenCert = CERT_TARGETS.find((t) => t.label === "Eileen Nowak")!;
const eileen = ACCOUNT_TARGETS.find((a) => a.label === "Eileen Nowak")!;

function certSnap(target: CertSnapshot["target"], over: Partial<CertSnapshot> = {}): CertSnapshot {
  return {
    target,
    row: { attendeeEmail: target.from, passed: true, courseIdNumber: target.courseIdNumber },
    otherPassedIds: [],
    ceLinkedUserId: null,
    usersWithTo: target.linkToProTrack && target.accountUserId ? [target.accountUserId] : [],
    authWithTo: target.linkToProTrack && target.accountUserId ? [target.accountUserId] : [],
    ...over,
  };
}

function accountSnap(over: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return { target: eileen, dbEmail: eileen.from, authEmail: eileen.from, usersWithTo: [], authWithTo: [], ...over };
}

describe("manifest", () => {
  it("only fixes a trailing .con to .com", () => {
    for (const t of [...CERT_TARGETS, ...ACCOUNT_TARGETS]) {
      expect(t.from.endsWith(".con")).toBe(true);
      expect(t.to).toBe(t.from.replace(/\.con$/, ".com"));
    }
  });

  it("re-sends only the two DentalACE One certificates and links only Kyle", () => {
    expect(CERT_TARGETS.filter((t) => t.resend).map((t) => t.label)).toEqual(["Kyle Lesko", "Stephen Scott Hall"]);
    expect(CERT_TARGETS.filter((t) => t.linkToProTrack).map((t) => t.label)).toEqual(["Kyle Lesko"]);
  });

  it("never touches the excluded certificate", () => {
    const ids = new Set(CERT_TARGETS.map((t) => t.issuedCertificateId));
    for (const e of EXCLUDED) expect(ids.has(e.issuedCertificateId)).toBe(false);
  });
});

describe("parseTypoArgs", () => {
  it("defaults to a dry run", () => {
    expect(parseTypoArgs([])).toEqual({ mode: "dry-run", sendAfterApply: false, testTo: null });
    expect(parseTypoArgs(["--dry-run"]).mode).toBe("dry-run");
  });

  it("reads rehearse, apply, apply+send and standalone send", () => {
    expect(parseTypoArgs(["--rehearse"]).mode).toBe("rehearse");
    expect(parseTypoArgs(["--apply"])).toEqual({ mode: "apply", sendAfterApply: false, testTo: null });
    expect(parseTypoArgs(["--apply", "--send-email"])).toEqual({ mode: "apply", sendAfterApply: true, testTo: null });
    expect(parseTypoArgs(["--send-email"])).toEqual({ mode: "send-email", sendAfterApply: false, testTo: null });
  });

  it("never sends from a dry run or rehearsal", () => {
    expect(() => parseTypoArgs(["--rehearse", "--send-email"])).toThrow(/never send/);
    expect(() => parseTypoArgs(["--dry-run", "--send-email"])).toThrow(/never send/);
  });

  it("lowercases and validates --test-to, only with --send-email", () => {
    expect(parseTypoArgs(["--send-email", "--test-to=Me@Example.com"]).testTo).toBe("me@example.com");
    expect(() => parseTypoArgs(["--send-email", "--test-to=nope"])).toThrow(/--test-to/);
    expect(() => parseTypoArgs(["--apply", "--test-to=me@example.com"])).toThrow(/--send-email/);
  });

  it("rejects unknown flags, space-separated values and two modes", () => {
    expect(() => parseTypoArgs(["--aply"])).toThrow(/--aply/);
    expect(() => parseTypoArgs(["--send-email", "--test-to", "me@example.com"])).toThrow(/--test-to/);
    expect(() => parseTypoArgs(["--apply", "--rehearse"])).toThrow(/one of/);
  });
});

describe("emailState", () => {
  it("is case-insensitive and tells pending, done and mismatch apart", () => {
    expect(emailState("LeskoKyle@gmail.con", kyle.from, kyle.to)).toBe("pending");
    expect(emailState("leskokyle@gmail.com", kyle.from, kyle.to)).toBe("done");
    expect(emailState("someone@else.com", kyle.from, kyle.to)).toBe("mismatch");
    expect(emailState(null, kyle.from, kyle.to)).toBe("mismatch");
  });
});

describe("preflightViolations", () => {
  it("passes the expected starting state", () => {
    const certs = CERT_TARGETS.map((t) =>
      certSnap(t, t.label === "Kyle Lesko" ? {} : { ceLinkedUserId: t.accountUserId }),
    );
    expect(preflightViolations(certs, [accountSnap()])).toEqual([]);
  });

  it("passes a re-run where everything is already corrected", () => {
    const certs = [
      certSnap(kyle, { row: { attendeeEmail: kyle.to, passed: true, courseIdNumber: kyle.courseIdNumber }, ceLinkedUserId: kyle.accountUserId }),
      certSnap(eileenCert, {
        row: { attendeeEmail: eileenCert.to, passed: true, courseIdNumber: eileenCert.courseIdNumber },
        ceLinkedUserId: eileen.userId,
        usersWithTo: [eileen.userId],
        authWithTo: [eileen.userId],
      }),
    ];
    const accounts = [accountSnap({ dbEmail: eileen.to, authEmail: eileen.to, usersWithTo: [eileen.userId], authWithTo: [eileen.userId] })];
    expect(preflightViolations(certs, accounts)).toEqual([]);
    expect(pendingDbWork(certs, accounts)).toEqual({ certs: [], links: [], accounts: [] });
    expect(pendingAuth(accounts)).toEqual([]);
  });

  it("aborts when a certificate's email was changed by someone else", () => {
    const v = preflightViolations([certSnap(stephen, { row: { attendeeEmail: "x@y.com", passed: true, courseIdNumber: stephen.courseIdNumber } })], []);
    expect(v.join()).toMatch(/Someone changed it/);
  });

  it("aborts when the corrected email already holds a passed cert on the course", () => {
    const v = preflightViolations([certSnap(stephen, { otherPassedIds: ["other-cert"] })], []);
    expect(v.join()).toMatch(/already holds a PASSED certificate/);
  });

  it("aborts when the corrected email belongs to a different account or Auth user", () => {
    expect(preflightViolations([certSnap(stephen, { usersWithTo: ["someone"] })], []).join()).toMatch(/different account/);
    expect(preflightViolations([certSnap(stephen, { authWithTo: ["someone"] })], []).join()).toMatch(/different Auth user/);
    expect(preflightViolations([], [accountSnap({ usersWithTo: ["someone"] })]).join()).toMatch(/different account/);
  });

  it("aborts when Kyle's account no longer owns the corrected email", () => {
    expect(preflightViolations([certSnap(kyle, { usersWithTo: [] })], []).join()).toMatch(/expected account/);
  });

  it("aborts when the ProTrack copy belongs to someone else", () => {
    expect(preflightViolations([certSnap(kyle, { ceLinkedUserId: "stranger" })], []).join()).toMatch(/ProTrack copy/);
  });

  it("aborts on a missing, failed or wrong-course certificate", () => {
    expect(preflightViolations([certSnap(stephen, { row: null })], []).join()).toMatch(/not found/);
    expect(
      preflightViolations([certSnap(stephen, { row: { attendeeEmail: stephen.from, passed: false, courseIdNumber: stephen.courseIdNumber } })], []).join(),
    ).toMatch(/not a passed/);
    expect(
      preflightViolations([certSnap(stephen, { row: { attendeeEmail: stephen.from, passed: true, courseIdNumber: "ACE-2026-99999" } })], []).join(),
    ).toMatch(/expected ACE-2026-00033/);
  });

  it("aborts on a missing account or Auth user, and on a changed account email", () => {
    expect(preflightViolations([], [accountSnap({ dbEmail: null })]).join()).toMatch(/no public.users row/);
    expect(preflightViolations([], [accountSnap({ authEmail: null })]).join()).toMatch(/no Supabase Auth user/);
    expect(preflightViolations([], [accountSnap({ authEmail: "x@y.com" })]).join()).toMatch(/Auth email is now/);
  });
});

describe("pending work", () => {
  it("keeps Auth separate so a failed Auth call can be finished by a re-run", () => {
    const accounts = [accountSnap({ dbEmail: eileen.to, usersWithTo: [eileen.userId] })];
    expect(pendingDbWork([], accounts).accounts).toEqual([]);
    expect(pendingAuth(accounts).map((a) => a.target.userId)).toEqual([eileen.userId]);
  });

  it("links Kyle's cert only until a ProTrack copy exists", () => {
    expect(pendingDbWork([certSnap(kyle)], []).links).toHaveLength(1);
    expect(pendingDbWork([certSnap(kyle, { ceLinkedUserId: kyle.accountUserId })], []).links).toHaveLength(0);
  });
});
