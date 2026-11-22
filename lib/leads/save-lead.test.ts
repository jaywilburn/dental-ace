import { describe, it, expect } from "vitest";
import { LEAD_RATE_LIMIT, leadIpLockKey, saveLeadUnderLimit } from "@/lib/leads/save-lead";
import type { MarketingLeadInput } from "@/lib/leads/schema";

/*
  The rate limit and the repeat check both read the table and then write to
  it, so they only hold if nothing else from the same IP can slip in between.
  saveLeadUnderLimit takes a per-IP advisory lock first. These tests run it
  against an in-memory stand-in for the transaction client whose lock really
  serializes, so a burst of parallel submissions behaves as it would in
  Postgres.
*/

const lead = (n: number): MarketingLeadInput => ({
  source: "VERIFY",
  contactName: `Dana Ortiz ${n}`,
  title: "Executive Director",
  organization: "Texas State Board of Dental Examiners",
  email: `dana.ortiz.${n}@tsbde.texas.gov`,
  message: `Inquiry ${n}: we would like a walkthrough of the audit cycle before spring renewal.`,
});

type Row = { ipHash: string; createdAt: Date; email: string; message: string | null; isSpam: boolean; spamReason: string | null };

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function fakeDb({ locking = true }: { locking?: boolean } = {}) {
  const rows: Row[] = [];
  const calls: string[] = [];
  const lockTails = new Map<string, Promise<void>>();

  async function transaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
    let release = () => {};
    const tx = {
      // pg_advisory_xact_lock: wait for the previous holder of this key, hold
      // until the transaction ends.
      $executeRaw: async (_sql: TemplateStringsArray, key: bigint) => {
        calls.push("lock");
        if (!locking) return 1;
        const k = String(key);
        const prev = lockTails.get(k) ?? Promise.resolve();
        let done!: () => void;
        const mine = new Promise<void>((r) => (done = r));
        lockTails.set(k, prev.then(() => mine));
        release = done;
        await prev;
        return 1;
      },
      marketingLead: {
        count: async ({ where }: { where: { ipHash: string; createdAt: { gte: Date } } }) => {
          calls.push("count");
          await tick();
          return rows.filter((r) => r.ipHash === where.ipHash && r.createdAt >= where.createdAt.gte).length;
        },
        findMany: async () => {
          calls.push("findMany");
          await tick();
          return rows.map((r) => ({ email: r.email, message: r.message }));
        },
        create: async ({ data }: { data: Omit<Row, "createdAt"> }) => {
          calls.push("create");
          await tick();
          rows.push({ ...data, createdAt: new Date() });
          return data;
        },
      },
    };
    try {
      return await fn(tx as never);
    } finally {
      release();
    }
  }
  return { rows, calls, transaction };
}

const submit = (db: ReturnType<typeof fakeDb>, n: number, ipHash = "ip-a", overrides: Partial<MarketingLeadInput> = {}) =>
  db.transaction((tx) =>
    saveLeadUnderLimit(tx, {
      lead: { ...lead(n), ...overrides },
      ipHash,
      nowMs: Date.now(),
      honeypotFilled: false,
      formTimingOk: true,
    }),
  );

describe("saveLeadUnderLimit", () => {
  it("takes the lock before reading, and writes in the same transaction", async () => {
    const db = fakeDb();
    const result = await submit(db, 1);
    expect(db.calls).toEqual(["lock", "count", "findMany", "create"]);
    expect(result).toEqual({ saved: true, spamReason: null });
  });

  it("saves nothing once the IP is at the limit", async () => {
    const db = fakeDb();
    for (let n = 0; n < LEAD_RATE_LIMIT; n++) await submit(db, n);
    db.calls.length = 0;

    expect(await submit(db, 99)).toEqual({ saved: false });
    expect(db.calls).toEqual(["lock", "count"]);
    expect(db.rows).toHaveLength(LEAD_RATE_LIMIT);
  });

  it("holds the limit under a burst of parallel submissions from one IP", async () => {
    const db = fakeDb();
    const results = await Promise.all(Array.from({ length: 20 }, (_, n) => submit(db, n)));
    expect(results.filter((r) => r.saved)).toHaveLength(LEAD_RATE_LIMIT);
    expect(db.rows).toHaveLength(LEAD_RATE_LIMIT);
  });

  it("would not hold without the lock (why the lock is there)", async () => {
    const db = fakeDb({ locking: false });
    await Promise.all(Array.from({ length: 20 }, (_, n) => submit(db, n)));
    expect(db.rows.length).toBeGreaterThan(LEAD_RATE_LIMIT);
  });

  it("catches a parallel burst of the same message from the second copy on", async () => {
    const db = fakeDb();
    const same = { email: "dana.ortiz@tsbde.texas.gov", message: lead(0).message };
    const results = await Promise.all(Array.from({ length: 4 }, (_, n) => submit(db, n, "ip-a", same)));
    const clean = results.filter((r) => r.saved && r.spamReason === null);
    expect(clean).toHaveLength(1);
    expect(db.rows.filter((r) => r.spamReason === "duplicate")).toHaveLength(3);
  });

  it("limits each IP separately", async () => {
    const db = fakeDb();
    const results = await Promise.all([
      ...Array.from({ length: 8 }, (_, n) => submit(db, n, "ip-a")),
      ...Array.from({ length: 8 }, (_, n) => submit(db, 100 + n, "ip-b")),
    ]);
    expect(results.filter((r) => r.saved)).toHaveLength(2 * LEAD_RATE_LIMIT);
  });

  it("records the spam verdict on the saved row", async () => {
    const db = fakeDb();
    const result = await submit(db, 1, "ip-a", { message: "See https://example.com/offer for our rates." });
    expect(result).toEqual({ saved: true, spamReason: "link" });
    expect(db.rows[0]).toMatchObject({ isSpam: true, spamReason: "link", ipHash: "ip-a" });
  });
});

describe("leadIpLockKey", () => {
  it("is stable per IP hash and differs between them", () => {
    expect(leadIpLockKey("ip-a")).toBe(leadIpLockKey("ip-a"));
    expect(leadIpLockKey("ip-a")).not.toBe(leadIpLockKey("ip-b"));
    expect(typeof leadIpLockKey("ip-a")).toBe("bigint");
  });
});
