"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
  Minimal mobile-friendly rich text editor for the detailed bio (Step 2).
  contentEditable + a small formatting toolbar; the HTML is mirrored into a
  hidden input so the surrounding server-action form posts it like any other
  field. Anything typed or pasted here is sanitized server-side
  (lib/forms/application/rich-text.ts) before validation or storage, so the
  editor itself only needs to be pleasant, not safe.

  44px touch targets and 16px body text (prevents iOS focus-zoom) keep it
  usable on phones.
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
}: {
  /** Form field name the HTML posts under. */
  name: string;
  /** Initial HTML; must already be sanitized by the caller. */
  defaultHtml?: string;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultHtml);

  function exec(cmd: string) {
    editorRef.current?.focus();
    // execCommand is deprecated but remains the only dependency-free way to
    // toggle inline formatting, and it works in every current browser
    // including iOS Safari.
    document.execCommand(cmd);
    setHtml(editorRef.current?.innerHTML ?? "");
  }

  const isEmpty = html.replace(/<[^>]*>/g, "").trim().length === 0;

  return (
    <div className="rounded-md border border-border bg-white focus-within:border-ace focus-within:ring-2 focus-within:ring-ace/30">
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
          onInput={() => setHtml(editorRef.current?.innerHTML ?? "")}
          className="min-h-40 px-3 py-3 text-[16px] leading-relaxed text-navy outline-none [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: defaultHtml }}
        />
      </div>
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
