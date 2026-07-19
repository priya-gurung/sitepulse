"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSites } from "@/lib/sites-context";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { PulseLine } from "@/components/PulseLine";

export default function DashboardIndexPage() {
  const { sites, loading } = useSites();
  const router = useRouter();

  useEffect(() => {
    if (!loading && sites.length > 0) {
      router.replace(`/dashboard/${sites[0].id}`);
    }
  }, [loading, sites, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <PulseLine className="h-6 w-24" color="#00B8A0" />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <EmptyState
          title="Add your first site"
          description="Create a site to get a tracking snippet, then start seeing pageviews, referrers, and visitor geography roll in."
          action={
            <Button onClick={() => router.push("/dashboard/new")}>Add a site</Button>
          }
        />
      </div>
    );
  }

  return null;
}
