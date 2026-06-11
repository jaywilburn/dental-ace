import "server-only";
import { render } from "@react-email/components";
import { Resend } from "resend";

/*
  Email send helper. Two modes:

  - Real send: RESEND_API_KEY is set. Uses Resend.
  - Log mode: no API key. Renders the email to HTML and prints subject +
    recipients to the server log. No file output, no preview UI; that's
    intentional for Weeks 3-4. When DNS is verified in Week 5, this helper
    starts actually sending without template changes.
*/

export type Attachment = {
  filename: string;
  /** raw bytes; helper base64-encodes for Resend at send time */
  content: Buffer;
};

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  /** Optional CC/BCC for fan-out (e.g., reviewer-notification copies the customer). */
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Attachment[];
};

/*
  Testing-only client copy. When EMAIL_TEST_BCC is set (comma-separated
  addresses), every outbound email is silently BCC'd to those addresses so the
  client (John & Christy) can confirm each template fires during testing. BCC,
  not CC, so the recipient never sees the client's addresses. Leave the env var
  UNSET in production to switch this off — no code change needed.
*/
function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function withTestBcc(bcc: string | string[] | undefined): string[] {
  const extra = (process.env.EMAIL_TEST_BCC ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Dedupe (case-insensitive) so a recipient also listed in the test BCC isn't doubled.
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const addr of [...toList(bcc), ...extra]) {
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(addr);
  }
  return merged;
}

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "noreply@dentalace.org";
  const bcc = withTestBcc(args.bcc);

  if (!apiKey) {
    const html = await render(args.react);
    console.info(
      `[email:LOG_MODE] subject="${args.subject}" to=${JSON.stringify(args.to)}${
        args.cc ? ` cc=${JSON.stringify(args.cc)}` : ""
      }${bcc.length ? ` bcc=${JSON.stringify(bcc)}` : ""} attachments=${
        args.attachments?.length ?? 0
      } html_bytes=${html.length}`,
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    cc: args.cc,
    bcc: bcc.length ? bcc : undefined,
    subject: args.subject,
    react: args.react,
    attachments: args.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    })),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
