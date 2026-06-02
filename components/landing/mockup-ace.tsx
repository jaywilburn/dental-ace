import { MockupChrome } from "@/components/landing/mockup-chrome";

/*
  DentalACE provider-dashboard mockup. Three stat cards (active courses,
  certs issued, cert balance), three course rows with status badges, and a
  low-balance alert callout.
*/

const stats = [
  { value: "3", label: "Active courses" },
  { value: "247", label: "Certs issued" },
  { value: "150", label: "Cert balance" },
];

const courses: { name: string; status: "approved" | "pending" }[] = [
  { name: "Advanced Periodontal Techniques", status: "approved" },
  { name: "Infection Control Update 2025", status: "approved" },
  { name: "Dental Materials Science", status: "pending" },
];

export function MockupAce() {
  return (
    <MockupChrome url="dentalace.org/company/dashboard">
      <div className="mb-2.5 grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-md bg-white/[0.05] p-2.5 text-center"
          >
            <p className="font-serif text-[22px] font-bold leading-none text-ace-light tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1 text-[10px] text-white/30">{stat.label}</p>
          </div>
        ))}
      </div>

      <ul className="flex flex-col gap-1.5">
        {courses.map((course) => (
          <li
            key={course.name}
            className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2.5"
          >
            <span className="text-xs font-medium text-white">{course.name}</span>
            {course.status === "approved" ? (
              <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                ✓ Approved
              </span>
            ) : (
              <span className="rounded-lg bg-ace/20 px-2 py-0.5 text-[10px] font-bold text-ace-light">
                ⏳ Pending
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2 rounded-md border border-ace/20 bg-ace/[0.08] p-2.5">
        <p className="mb-0.5 text-[11px] font-semibold text-ace-light">
          ⚠ Low balance alert
        </p>
        <p className="text-[11px] text-white/40 tabular-nums">
          150 certs remaining · Consider purchasing a bundle
        </p>
      </div>
    </MockupChrome>
  );
}
