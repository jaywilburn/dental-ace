import type { AttachmentLink } from "@/lib/forms/application/attachments";

/*
  Read-only list of uploaded application attachments with signed download links.
  Shared by the customer review step and the reviewer detail screen.
*/
export function AttachmentsCard({
  title,
  links,
}: {
  title: string;
  links: AttachmentLink[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="border-b border-border bg-surface px-4 py-2.5">
        <p className="text-[12px] font-semibold text-navy">{title}</p>
      </div>
      <ul className="divide-y divide-border">
        {links.length === 0 ? (
          <li className="px-4 py-3 text-[12px] text-text-muted">
            No files uploaded.
          </li>
        ) : (
          links.map((link) => (
            <li
              key={link.label}
              className="flex items-center justify-between px-4 py-2.5 text-[12px]"
            >
              <span className="text-text-muted">
                <span className="font-semibold text-navy">{link.label}:</span>{" "}
                {link.filename}
              </span>
              {link.url ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ace-dark hover:underline"
                >
                  Download ↓
                </a>
              ) : (
                <span className="text-text-muted">link unavailable</span>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
