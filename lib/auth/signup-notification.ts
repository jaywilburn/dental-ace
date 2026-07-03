import type { LicenseType, SignupIntent, StaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import { licenseTypeShort, stateName } from "@/lib/protrack/reference";
import SignupNotificationEmail from "@/emails/signup-notification";

/*
  "New signup" ops notification to AADB. One entry point, notifyAccountCreated(),
  fires once per account when it becomes active, from every activation path:
  - self-serve email verification (public + state board) — verify-email route,
  - admin-manual verification — lib/admin/users.ts markEmailVerified,
  - admin-provisioned staff (born verified) — lib/admin/users.ts createUserAccount.
  Tells AADB who signed up and which type of user they are. Best-effort — a send
  failure must never break the caller's flow. Mirrors the access-request admin
  notice pattern (lib/auth/access-requests.ts).
*/

export type SignupDetailRow = { label: string; value: string };

/*
  Recipients. AADB_ADMIN_EMAIL may be a single shared inbox (info@dentalace.org)
  or a comma-separated list, so AADB can add individual admins without a code
  change (same parse as access-requests.ts). Falls back to info@dentalace.org so
  the notice still lands before the env is configured on Vercel.
*/
export function signupNotificationRecipients(): string[] {
  const configured = (process.env.AADB_ADMIN_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : ["info@dentalace.org"];
}

export type SignupUser = {
  staffRole: StaffRole;
  signupIntent: SignupIntent | null;
  boardId: string | null;
  licenses: { state: string; licenseType: LicenseType; licenseNumber: string }[];
  // A BOARD-kind access request (any status), take 1. Present => board signup.
  accessRequests: { label: string }[];
};

/*
  Map an account to a human "type" label + detail rows for the ops email. Pure
  and unit-tested (signup-notification.test.ts) — the single source of truth for
  the notification's type vocabulary across every activation path.

  Order matters. staffRole is checked first: a role is only ever set at
  admin-create time (self-serve rows are born NONE and only gain a role later via
  a grant, long after this notification has fired), so a role here means the
  account was admin-provisioned. Board is checked before the individual fallback
  because a board registrant also carries the FREE tier and no signupIntent.
*/
export function describeSignup(user: SignupUser): {
  typeLabel: string;
  detailRows: SignupDetailRow[];
} {
  if (user.staffRole === "ADMIN" || user.staffRole === "REVIEWER") {
    const roleWord = user.staffRole === "ADMIN" ? "Admin" : "Reviewer";
    return {
      typeLabel: `Staff (${roleWord})`,
      detailRows: [{ label: "Origin", value: "Created by an admin" }],
    };
  }
  const boardRequest = user.accessRequests[0];
  if (boardRequest || user.boardId) {
    return {
      typeLabel: "State Board",
      detailRows: boardRequest ? [{ label: "Board", value: boardRequest.label }] : [],
    };
  }
  if (user.signupIntent === "COMPANY") {
    return {
      typeLabel: "CE Provider (company)",
      detailRows: [{ label: "Note", value: "Intends to register a CE-provider company" }],
    };
  }
  if (user.signupIntent === "STAFF") {
    return { typeLabel: "Staff (self-requested)", detailRows: [] };
  }
  const license = user.licenses[0];
  return {
    typeLabel: "Individual (ProTrack)",
    detailRows: [
      {
        label: "License",
        value: license
          ? `${licenseTypeShort(license.licenseType)} · ${stateName(license.state)} · ${license.licenseNumber}`
          : "No license on file",
      },
    ],
  };
}

async function sendSignupNotification(input: {
  name: string;
  email: string;
  typeLabel: string;
  detailRows: SignupDetailRow[];
  origin?: string;
}): Promise<void> {
  await sendEmail({
    to: signupNotificationRecipients(),
    subject: SignupNotificationEmail.subject({ typeLabel: input.typeLabel }),
    react: SignupNotificationEmail({
      name: input.name,
      email: input.email,
      typeLabel: input.typeLabel,
      detailRows: input.detailRows,
      adminUrl: `${appBaseUrl(input.origin)}/admin/users`,
    }),
  });
}

/*
  Fire the "new signup" notification for a just-activated account. Loads exactly
  the fields describeSignup needs, so every caller only has to pass the userId
  (and optionally the request origin for the CTA link). Best-effort: swallows any
  failure so it can never break signup/verification, but LOGS it — a silent drop
  would leave AADB's inbox mysteriously quiet with no trail.
*/
export async function notifyAccountCreated(userId: string, origin?: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        staffRole: true,
        signupIntent: true,
        boardId: true,
        licenses: {
          where: { isPrimary: true },
          select: { state: true, licenseType: true, licenseNumber: true },
          take: 1,
        },
        accessRequests: {
          where: { kind: "BOARD" },
          select: { label: true },
          take: 1,
        },
      },
    });
    if (!user) return;
    const { typeLabel, detailRows } = describeSignup(user);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
    await sendSignupNotification({ name, email: user.email, typeLabel, detailRows, origin });
  } catch (err) {
    console.error("[signup-notification] notifyAccountCreated failed", err);
  }
}
