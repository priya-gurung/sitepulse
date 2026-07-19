"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BarChart3, Globe2, LogOut, Settings, TrendingUp } from "lucide-react";
import { Logo } from "./Logo";
import { SiteSwitcher } from "./SiteSwitcher";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = (siteId: string) => [
  { href: `/dashboard/${siteId}`, label: "Overview", icon: TrendingUp, exact: true },
  { href: `/dashboard/${siteId}/pages`, label: "Pages", icon: BarChart3 },
  { href: `/dashboard/${siteId}/geography`, label: "Geography", icon: Globe2 },
  { href: `/dashboard/${siteId}/settings`, label: "Settings", icon: Settings },
];

export function Sidebar({ siteId }: { siteId?: string }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-5 pt-6">
        <Logo />
      </div>

      <div className="mt-6 px-4">
        <SiteSwitcher activeSiteId={siteId} />
      </div>

      {siteId && (
        <nav className="mt-6 flex flex-1 flex-col gap-0.5 px-3">
          {NAV_ITEMS(siteId).map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-pulse-dim/60 text-pulse-deep" : "text-muted hover:bg-paper hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mt-auto border-t border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{user?.name || user?.email}</p>
            {user?.name && <p className="truncate text-xs text-muted">{user.email}</p>}
          </div>
          <button
            onClick={logout}
            aria-label="Sign out"
            className="shrink-0 rounded-md p-1.5 text-muted hover:bg-paper hover:text-signal-coral"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
