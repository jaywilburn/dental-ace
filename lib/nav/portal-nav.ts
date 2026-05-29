import type { Role } from "@prisma/client";

/*
  Sidebar navigation per portal. Hrefs reflect the real Phase 1 routes that
  exist or are wired up in Weeks 3-4. Items that need conditional visibility
  (e.g. Events when the company has at least one live-event course) get
  rendered or hidden in the layout, not removed from the catalog here.

  Mirror the mockup ordering in logic/dentalace-dev-mockup-suite-v3.html.
*/

export type NavItem = {
  label: string;
  href: string;
  icon: string;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

export const portalNav: Record<"CUSTOMER" | "REVIEWER" | "ADMIN", NavSection[]> = {
  CUSTOMER: [
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
  REVIEWER: [
    {
      items: [
        { label: "Review Queue", href: "/reviewer", icon: "📋" },
        { label: "Approved Courses", href: "/reviewer/approved", icon: "✅" },
        { label: "Rejected", href: "/reviewer/rejected", icon: "❌" },
      ],
    },
  ],
  ADMIN: [
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
};

export function navFor(role: Role): NavSection[] {
  if (role === "CUSTOMER" || role === "REVIEWER" || role === "ADMIN") {
    return portalNav[role];
  }
  return [];
}
