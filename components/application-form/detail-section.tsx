import type { DetailRow } from "@/lib/forms/application/detail-rows";
import type { ApplicationDataRead } from "@/lib/forms/application/schemas";

/*
  Read-only presentation for application detail rows + the quiz preview card.
  Shared by the reviewer detail screen and the company-facing read-only view.
  Rows are built by lib/forms/application/detail-rows.ts.
*/

export function DetailSection({
  title,
  rows,
}: {
  title: string;
  rows: DetailRow[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="border-b border-border bg-surface px-4 py-2.5">
        <p className="text-[12px] font-semibold text-navy">{title}</p>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2">
        {rows.map((row, i) => (
          <div key={i} className={row.full ? "sm:col-span-2" : undefined}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              {row.label}
            </dt>
            {row.html ? (
              // html rows contain ONLY sanitizeRichText() output (enforced by
              // the row builders in detail-rows.ts).
              <dd
                className="mt-0.5 text-[13px] leading-relaxed text-navy [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
                dangerouslySetInnerHTML={{ __html: row.value }}
              />
            ) : (
              <dd className="mt-0.5 whitespace-pre-line text-[13px] text-navy">
                {row.value}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

export function QuizPreviewCard({
  title,
  quiz,
}: {
  title: string;
  quiz: ApplicationDataRead["quiz"];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-2 text-[12px] font-semibold text-navy">{title}</p>
      {quiz.map((q, i) => (
        <div key={i} className="mt-3 text-[11px] text-text-mid">
          <p>
            <strong>
              Q{i + 1} ({q.type}):
            </strong>{" "}
            {q.question}
          </p>
          {q.type === "TF" ? (
            <p className="pl-3 text-emerald-700">Correct: {q.correctAnswer}</p>
          ) : (
            <p className="pl-3 text-emerald-700">
              Correct: {q.options[q.correctIndex]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
