"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavIconDef } from "@/lib/iconTypes";
import { AnimatedNavIcon } from "@/components/ui/AnimatedNavIcon";

const tabs: { href: string; label: string; icon: NavIconDef }[] = [
  { href: "/dashboard", label: "Home", icon: { lib: "md", name: "MdDashboard" } },
  { href: "/users", label: "Network", icon: { lib: "fa", name: "FaUsers" } },
  { href: "/fund-requests", label: "Funds", icon: { lib: "lucide", icon: IndianRupee } },
  { href: "/transactions", label: "Txns", icon: { lib: "fa", name: "FaExchangeAlt" } },
  { href: "/wallet", label: "Wallet", icon: { lib: "md", name: "MdAccountBalanceWallet" } },
];

export function MobileAdminNav() {
  const pathname = usePathname();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl md:hidden"
      style={{
        borderColor: "var(--admin-border)",
        background: "color-mix(in srgb, var(--admin-card) 95%, transparent)",
      }}
    >
      <nav className="flex items-stretch justify-around px-1 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {tabs.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
              )}
              style={{ color: active ? "var(--brand-blue-mid)" : "var(--admin-muted)" }}
            >
              <AnimatedNavIcon def={icon} active={active} size={20} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
