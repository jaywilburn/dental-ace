/*
  Sidebar navigation per feature area. Hrefs reflect the real routes that exist
  or are wired up. Items that need conditional visibility (e.g. Events when the
  company has at least one live-event course) get rendered or hidden in the
  layout, not removed from the catalog here.
*/

export type PortalArea = "company" | "reviewer" | "admin" | "protrack";

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
        { label: "Companies", href: "#", icon: "🏢" },
        { label: "Users", href: "#", icon: "👥" },
        { label: "Applications", href: "#", icon: "📝" },
        { label: "Certificates", href: "#", icon: "📜" },
      ],
    },
    {
      label: "Platform",
      items: [
        { label: "Billing Overrides", href: "#", icon: "🛠" },
        { label: "Reviewer Accounts", href: "#", icon: "🧑‍⚖️" },
        { label: "State Board Access", href: "#", icon: "🏛" },
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
