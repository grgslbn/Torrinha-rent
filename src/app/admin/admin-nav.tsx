"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/remotes", label: "Remotes" },
  { href: "/admin/waitlist", label: "Waitlist" },
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/bank", label: "Bank" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex items-center gap-1">
      {navLinks.map((link) => {
        const isActive =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 rounded-[var(--t-radius-sm)] text-sm transition-colors ${
              isActive
                ? "bg-t-accent-light text-t-accent-text font-medium"
                : "text-t-text-muted hover:text-t-text hover:bg-t-accent-light"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <button
        onClick={handleLogout}
        className="ml-4 px-3 py-1.5 text-sm text-t-text-muted hover:text-t-text transition-colors"
      >
        Sign out
      </button>
    </nav>
  );
}
