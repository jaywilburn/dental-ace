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

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "noreply@dentalace.org";

  if (!apiKey) {
    const html = await render(args.react);
    console.info(
      `[email:LOG_MODE] subject="${args.subject}" to=${JSON.stringify(args.to)}${
        args.cc ? ` cc=${JSON.stringify(args.cc)}` : ""
      } attachments=${args.attachments?.length ?? 0} html_bytes=${html.length}`,
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
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
