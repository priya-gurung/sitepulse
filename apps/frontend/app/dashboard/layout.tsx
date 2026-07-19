"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SitesProvider } from "@/lib/sites-context";
import { Sidebar } from "@/components/Sidebar";
import { PulseLine } from "@/components/PulseLine";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ siteId?: string }>();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-paper">
        <PulseLine className="h-8 w-32" color="#00B8A0" />
      </div>
    );
  }

  const siteId = typeof params?.siteId === "string" ? params.siteId : undefined;

  return (
    <SitesProvider>
      <div className="flex min-h-screen bg-paper">
        <Sidebar siteId={siteId && siteId !== "new" ? siteId : undefined} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </SitesProvider>
  );
}
