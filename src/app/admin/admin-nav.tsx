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
  { href: "/admin/connect-bank", label: "Bank" },
  { href: "/admin/emails", label: "Emails" },
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
            className={`px-3 py-1.5 rounded text-sm ${
              isActive
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <button
        onClick={handleLogout}
        className="ml-4 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        Sign out
      </button>
    </nav>
  );
}
