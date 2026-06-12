/*
  Landing-page video (client feedback, 2026-06: "add the video that John
  shot"). Hosted on YouTube; embedded via the privacy-enhanced
  youtube-nocookie domain so no tracking cookies land before play. The iframe
  lazy-loads, so it costs nothing above the fold.
*/

const VIDEO_ID = "0co1H-NKqu4";

export function VideoSection() {
  return (
    <section className="bg-white px-5 py-16 md:px-10 md:py-20">
      <p className="mb-2.5 text-center font-mono text-[10px] uppercase tracking-[2.5px] text-text-muted">
        Watch
      </p>
      <h2 className="mb-2 text-balance text-center font-serif text-3xl font-bold text-navy md:text-[38px]">
        See DentalACE One in action
      </h2>
      <p className="mx-auto mb-10 max-w-[520px] text-pretty text-center text-[15px] leading-relaxed text-text-muted">
        A walkthrough of the platform from the American Association of Dental
        Boards.
      </p>
      <div className="mx-auto max-w-[860px] overflow-hidden rounded-xl border border-border shadow-lg">
        <iframe
          className="aspect-video w-full"
          src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}`}
          title="DentalACE One platform walkthrough"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </section>
  );
}
