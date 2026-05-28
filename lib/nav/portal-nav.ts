import type { Role } from "@prisma/client";

/*
  Sidebar navigation per portal. Most items are placeholders pointing to "#"
  for Week 2; their real routes land in Weeks 3 to 7 as the features ship.

  Keep this in sync with the mockup in logic/dentalace-dev-mockup-suite-v3.html
  - sections + ordering match each portal's sidebar there.
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
        { label: "New Application", href: "#", icon: "📝" },
        { label: "My Courses", href: "#", icon: "🎓" },
        { label: "Certificate Log", href: "#", icon: "📜" },
      ],
    },
    {
      label: "Billing",
      items: [
        { label: "Buy App Credits", href: "#", icon: "🪙" },
        { label: "Buy Cert Bundles", href: "#", icon: "🛒" },
        { label: "Billing History", href: "#", icon: "💳" },
      ],
    },
  ],
  REVIEWER: [
    {
      items: [
        { label: "Application Queue", href: "/reviewer", icon: "📥" },
        { label: "Review History", href: "#", icon: "📚" },
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
