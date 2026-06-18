"use client";

import Link from "next/link";
import { useState } from "react";

/*
  Login "I'm signing in as…" selector. Sign-in is unified: the account's
  entitlements decide where it lands after auth (see lib/auth/session
  landingPathFor), so this dropdown does NOT change authentication and is not
  posted with the form. It gives each role an explicit spot on the login page
  and shows role-appropriate verbiage + the right "create account" path.

  NOTE (client, Row 10): reviewer verbiage below is a first pass — confirm the
  exact wording AADB wants for the reviewer sign-in note.
*/

type RoleKey = "individual" | "company" | "reviewer" | "admin" | "board";

const ROLES: { value: RoleKey; label: string }[] = [
  { value: "individual", label: "Individual (ProTrack)" },
  { value: "company", label: "CE Company (DentalACE)" },
  { value: "reviewer", label: "AADB Reviewer" },
  { value: "admin", label: "AADB Admin" },
  { value: "board", label: "State / Provincial Dental Board" },
];

function Hint({ role }: { role: RoleKey }) {
  switch (role) {
    case "company":
      return (
        <>
          Manage course accreditation, credits, and certificates. New provider?{" "}
          <Link className="text-ace-light underline" href="/signup?as=company">
            Create a company account
          </Link>
          , then request CE Company access.
        </>
      );
    case "reviewer":
      return (
        <>
          AADB reviewers sign in here to review and approve course applications.
          Reviewer access is provisioned by an AADB administrator; create an
          account and request access from your Home screen.
        </>
      );
    case "admin":
      return (
        <>
          AADB administrators sign in here to manage the platform, queues, and
          access requests. Admin access is provisioned by AADB.
        </>
      );
    case "board":
      return (
        <>
          State and provincial dental boards run license audits with Verify. New
          board?{" "}
          <Link className="text-ace-light underline" href="/signup/board">
            Register your board
          </Link>
          .
        </>
      );
    default:
      return <>Sign in to track your continuing-education credits with ProTrack.</>;
  }
}

export function LoginRoleSelector() {
  const [role, setRole] = useState<RoleKey>("individual");
  return (
    <div className="mt-6">
      <label
        htmlFor="role-hint"
        className="mb-1.5 block text-[10px] font-semibold text-white/50"
      >
        I&apos;m signing in as
      </label>
      <select
        id="role-hint"
        value={role}
        onChange={(e) => setRole(e.target.value as RoleKey)}
        className="w-full rounded-md border border-white/[0.12] bg-white/[0.07] px-3 py-2.5 text-xs text-white outline-none transition focus:border-ace/60 focus:bg-white/[0.09]"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value} className="text-navy">
            {r.label}
          </option>
        ))}
      </select>
      <p className="mt-2 text-[11px] leading-relaxed text-white/40">
        <Hint role={role} />
      </p>
    </div>
  );
}
