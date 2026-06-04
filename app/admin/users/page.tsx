import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createStaffAccount, setStaffRole } from "@/lib/admin/provision";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { ok, error } = await searchParams;

  const staff = await prisma.user.findMany({
    where: { staffRole: { in: ["REVIEWER", "ADMIN"] } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, firstName: true, lastName: true, staffRole: true },
  });

  return (
    <>
      <PageHeader title="Staff Users" subtitle={`${staff.length} reviewer/admin account${staff.length === 1 ? "" : "s"}`} />
      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          {ok === "created" ? "Account created and invite sent." : "Role updated."}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{error}</div>
      ) : null}

      <form action={createStaffAccount} className="mb-6 rounded-lg border border-border bg-white p-4 grid gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-[12px] font-semibold text-navy">Create staff account</p>
        <input name="firstName" required placeholder="First name" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <input name="lastName" required placeholder="Last name" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <input name="email" type="email" required placeholder="Email" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <select name="staffRole" className="rounded-md border border-border px-3 py-2 text-[13px]">
          <option value="REVIEWER">Reviewer</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit" className="sm:col-span-2 justify-self-start rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">
          Create + send invite
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Email</th>
              <th className="px-4 py-2 font-semibold">Role</th>
              <th className="px-4 py-2 font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 font-medium text-navy">{u.firstName} {u.lastName}</td>
                <td className="px-4 py-2 text-text-mid">{u.email}</td>
                <td className="px-4 py-2 text-text-mid">{u.staffRole}</td>
                <td className="px-4 py-2">
                  <form action={setStaffRole} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="staffRole" defaultValue={u.staffRole} className="rounded-md border border-border px-2 py-1 text-[11px]">
                      <option value="REVIEWER">REVIEWER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="NONE">NONE (revoke)</option>
                    </select>
                    <button type="submit" className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-navy">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
