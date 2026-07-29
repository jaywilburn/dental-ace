"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DETAILED_BIO_PLAIN_MAX,
  DETAILED_BIO_HTML_MAX,
} from "@/lib/forms/application/bio-limits";

/** Visible length of a stored HTML bio, for seeding the counter before the DOM
 *  exists. Approximates the server's richTextPlainLength (which uses
 *  sanitize-html, unavailable in the browser); once the user types, innerText
 *  takes over and is exact. */
function plainTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim().length;
}

/*
  Minimal mobile-friendly rich text editor for the detailed bio (Step 2).
  contentEditable + a small formatting toolbar; the HTML is mirrored into a
  hidden input so the surrounding server-action form posts it like any other
  field. Anything typed or pasted here is sanitized server-side
  (lib/forms/application/rich-text.ts) before validation or storage, so the
  editor itself only needs to be pleasant, not safe.

  44px touch targets and 16px body text (prevents iOS focus-zoom) keep it
  usable on phones.

  PASTES ARE FORCED TO PLAIN TEXT. Word and Google Docs paste <span
  style="mso-..."> soup and base64 data: images, which used to spend the whole
  20,000-character HTML budget on markup the provider could not see, producing a
  "too long" rejection on a visibly short bio. sanitize-html strips that
  server-side, but only AFTER it has already blown the cap. Stripping at the
  paste is the only place that fixes the cause.
*/

const COMMANDS = [
  { cmd: "bold", label: "B", title: "Bold", className: "font-bold" },
  { cmd: "italic", label: "I", title: "Italic", className: "italic" },
  { cmd: "underline", label: "U", title: "Underline", className: "underline" },
  { cmd: "insertUnorderedList", label: "• List", title: "Bulleted list", className: "" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list", className: "" },
] as const;

export function RichTextEditor({
  name,
  defaultHtml = "",
  placeholder,
  maxPlainLength = DETAILED_BIO_PLAIN_MAX,
  maxHtmlLength = DETAILED_BIO_HTML_MAX,
  invalid,
}: {
  /** Form field name the HTML posts under. */
  name: string;
  /** Initial HTML; must already be sanitized by the caller. */
  defaultHtml?: string;
  placeholder?: string;
  /** Visible-character ceiling, matching step2WriteSchema. */
  maxPlainLength?: number;
  /** Raw HTML ceiling, matching step2Schema. Only used to warn. */
  maxHtmlLength?: number;
  invalid?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultHtml);
  const [plainLength, setPlainLength] = useState(() => plainTextLength(defaultHtml));

  function sync() {
    const el = editorRef.current;
    setHtml(el?.innerHTML ?? "");
    setPlainLength(el?.innerText.trim().length ?? 0);
  }

  function exec(cmd: string) {
    editorRef.current?.focus();
    // execCommand is deprecated but remains the only dependency-free way to
    // toggle inline formatting, and it works in every current browser
    // including iOS Safari.
    document.execCommand(cmd);
    sync();
  }

  const isEmpty = plainLength === 0;
  const overPlain = plainLength > maxPlainLength;
  const nearPlain = plainLength >= maxPlainLength * 0.9;
  const heavyMarkup = html.length > maxHtmlLength * 0.9;

  return (
    <div
      className={cn(
        "rounded-md border bg-white focus-within:ring-2",
        invalid || overPlain
          ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-300/40"
          : "border-border focus-within:border-ace focus-within:ring-ace/30",
      )}
    >
      <div className="flex flex-wrap gap-1 border-b border-border bg-surface p-1.5">
        {COMMANDS.map((c) => (
          <button
            key={c.cmd}
            type="button"
            title={c.title}
            aria-label={c.title}
            // preventDefault on pointer-down keeps the text selection alive
            // while the button is pressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(c.cmd)}
            className={cn(
              "min-h-10 min-w-10 rounded px-2.5 text-[13px] text-navy transition-colors hover:bg-white",
              c.className,
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="relative">
        {isEmpty && placeholder ? (
          <p
            aria-hidden
            className="pointer-events-none absolute left-3 top-3 text-[14px] text-text-muted"
          >
            {placeholder}
          </p>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Detailed bio"
          suppressContentEditableWarning
          aria-invalid={invalid || overPlain || undefined}
          aria-describedby={`${name}-count`}
          onInput={sync}
          onPaste={(e) => {
            // Insert the clipboard's PLAIN text, dropping the source's markup
            // and any embedded base64 images. See the note at the top of the
            // file: this is what keeps the HTML cap meaningful.
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            sync();
          }}
          className="min-h-40 px-3 py-3 text-[16px] leading-relaxed text-navy outline-none [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: defaultHtml }}
        />
      </div>
      <div
        id={`${name}-count`}
        aria-live="polite"
        className="border-t border-border px-3 py-1.5 text-right text-[10px] tabular-nums"
      >
        <span
          className={
            overPlain
              ? "text-red-600"
              : nearPlain
                ? "text-orange-600"
                : "text-text-muted"
          }
        >
          {plainLength.toLocaleString()} / {maxPlainLength.toLocaleString()} characters
        </span>
        {heavyMarkup ? (
          <span className="ml-2 block text-orange-600">
            Formatting is using a lot of space. Paste as plain text to keep the
            bio under the limit.
          </span>
        ) : null}
      </div>
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
