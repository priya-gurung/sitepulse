"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PulseLine } from "@/components/PulseLine";

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [user, loading, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-paper">
      <PulseLine className="h-8 w-32" color="#00B8A0" />
    </div>
  );
}
