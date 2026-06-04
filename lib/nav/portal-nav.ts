/*
  Sidebar navigation per feature area. Hrefs reflect the real routes that exist
  or are wired up. Items that need conditional visibility (e.g. Events when the
  company has at least one live-event course) get rendered or hidden in the
  layout, not removed from the catalog here.
*/

export type PortalArea = "company" | "reviewer" | "admin" | "protrack" | "board";

export type NavItem = {
  label: string;
  href: string;
  icon: string;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

export const portalNav: Record<PortalArea, NavSection[]> = {
  company: [
    {
      label: "My Account",
      items: [
        { label: "Dashboard", href: "/company", icon: "📊" },
        { label: "New Application", href: "/company/applications/new", icon: "📝" },
        { label: "My Courses", href: "/company/courses", icon: "🎓" },
        { label: "Certificate Log", href: "/company/certificates", icon: "📜" },
        { label: "Events", href: "/company/events", icon: "⭐" },
      ],
    },
    {
      label: "Billing",
      items: [
        { label: "Buy App Credits", href: "/company/buy/credits", icon: "🪙" },
        { label: "Buy Cert Bundles", href: "/company/buy/certs", icon: "🛒" },
        { label: "Billing History", href: "/company/billing", icon: "💳" },
      ],
    },
  ],
  reviewer: [
    {
      items: [
        { label: "Review Queue", href: "/reviewer", icon: "📋" },
        { label: "Approved Courses", href: "/reviewer/approved", icon: "✅" },
        { label: "Rejected", href: "/reviewer/rejected", icon: "❌" },
      ],
    },
  ],
  admin: [
    {
      label: "Operations",
      items: [
        { label: "Dashboard", href: "/admin", icon: "📊" },
        { label: "Companies", href: "/admin/companies", icon: "🏢" },
        { label: "Staff Users", href: "/admin/users", icon: "👥" },
      ],
    },
  ],
  // Verify (Phase 3 — state-board portal). Marketing/branding says "Verify"; the
  // URL segment is /board to match the role-named convention of the other
  // portals (/admin, /reviewer, /company).
  board: [
    {
      label: "Audits",
      items: [
        { label: "Overview", href: "/board", icon: "📊" },
        { label: "Licensees", href: "/board/licensees", icon: "👥" },
        { label: "Audit History", href: "/board/audits", icon: "📋" },
        { label: "Run Audit", href: "/board/audits/new", icon: "🎲" },
      ],
    },
    {
      label: "Compliance",
      items: [
        { label: "Deficiencies", href: "/board/deficiencies", icon: "⚠️" },
        { label: "Notices", href: "/board/notices", icon: "✉️" },
      ],
    },
    {
      label: "Configure",
      items: [
        { label: "Settings", href: "/board/settings", icon: "⚙️" },
      ],
    },
  ],
  // ProTrack. "Pro Features" items redirect FREE accounts to the upgrade page
  // server-side (lib/protrack/require-pro.ts); the lock treatment is cosmetic.
  protrack: [
    {
      label: "My CE",
      items: [
        { label: "CE Dashboard", href: "/protrack", icon: "📊" },
        { label: "My Certificates", href: "/protrack/certificates", icon: "📜" },
        { label: "Upload Certificate", href: "/protrack/upload", icon: "⬆️" },
        { label: "State Requirements", href: "/protrack/states", icon: "🗺️" },
      ],
    },
    {
      label: "Pro Features",
      items: [
        { label: "Reminders", href: "/protrack/reminders", icon: "🔔" },
        { label: "Export Report", href: "/protrack/export", icon: "📤" },
        { label: "Multi-State", href: "/protrack/multistate", icon: "🌐" },
      ],
    },
  ],
};

export function navFor(area: PortalArea): NavSection[] {
  return portalNav[area];
}

/*
  Cross-product switching shown in the sidebar footer (above Sign Out) on the
  product portals. There are three products — DentalACE, ProTrack, Verify — and
  an account can hold more than one. From inside one product we surface links to
  the OTHER products the account is entitled to, plus a "Back to Home" link to
  the hub. Staff areas (Reviewer, Admin) are not products and don't appear here.
*/
export type ProductKey = "dentalace" | "protrack" | "verify";

type ProductEntry = NavItem & { key: ProductKey };

const PRODUCTS: ProductEntry[] = [
  { key: "dentalace", label: "DentalACE", href: "/company", icon: "🎓" },
  { key: "protrack", label: "ProTrack", href: "/protrack", icon: "📊" },
  { key: "verify", label: "Verify", href: "/board", icon: "🏛" },
];

/** The home hub. Lives above Sign Out on every product portal. */
export const BACK_TO_HOME: NavItem = { label: "Back to Home", href: "/home", icon: "←" };

/**
 * The OTHER products this account can open, excluding the one it's currently in.
 * Entitlements: DentalACE needs a company, ProTrack is the baseline every
 * account has, Verify needs verify_access (granted at /signup/board or by admin).
 */
export function otherProductLinks(
  user: { companyId: string | null; verifyAccess: boolean },
  current: ProductKey,
): NavItem[] {
  return PRODUCTS.filter((p) => p.key !== current)
    .filter((p) => {
      switch (p.key) {
        case "dentalace":
          return user.companyId != null;
        case "protrack":
          return true;
        case "verify":
          return user.verifyAccess;
      }
    })
    .map(({ label, href, icon }) => ({ label, href, icon }));
}
