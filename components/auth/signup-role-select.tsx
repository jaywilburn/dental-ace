"use client";

import { useRouter } from "next/navigation";

/*
  Account-creation role selector (client Row 19). The user denotes their role,
  and we route to the matching flow. Every account is still created as ProTrack
  Free; the role only steers the form and the post-signup access request
  (CE Company / AADB staff are granted via approval, boards self-register).
*/
const ROUTES: Record<string, string> = {
  individual: "/signup?as=individual",
  company: "/signup?as=company",
  admin: "/signup?as=staff",
  reviewer: "/signup?as=staff",
  board: "/signup/board",
};

export function SignupRoleSelect() {
  const router = useRouter();
  return (
    <div>
      <label
        htmlFor="signup-role"
        className="mb-1.5 block text-[11px] font-semibold text-text-mid"
      >
        I&apos;m creating an account as
      </label>
      <select
        id="signup-role"
        defaultValue=""
        onChange={(e) => {
          const route = ROUTES[e.target.value];
          if (route) router.push(route);
        }}
        className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-[13px] text-navy outline-none focus:border-ace"
      >
        <option value="" disabled>
          Select your role…
        </option>
        <option value="individual">Individual — track my CE (ProTrack)</option>
        <option value="company">DentalACE customer (CE provider)</option>
        <option value="admin">AADB admin</option>
        <option value="reviewer">AADB reviewer</option>
        <option value="board">State dental board</option>
      </select>
    </div>
  );
}
