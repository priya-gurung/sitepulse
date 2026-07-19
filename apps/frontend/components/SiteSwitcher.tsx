"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import { useSites } from "@/lib/sites-context";
import type { Site } from "@/lib/types";

export function SiteSwitcher({ activeSiteId }: { activeSiteId?: string }) {
  const { sites } = useSites();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const active = sites.find((s) => s.id === activeSiteId) ?? sites[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(site: Site) {
    setOpen(false);
    router.push(`/dashboard/${site.id}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-pulse/60"
      >
        <span className="truncate font-medium text-ink">{active?.name ?? "No sites yet"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-lg border border-border bg-surface p-1 shadow-[0_8px_24px_rgba(16,21,26,0.1)]">
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => select(site)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-paper"
            >
              <span className="truncate">
                <span className="block font-medium text-ink">{site.name}</span>
                <span className="block truncate text-xs text-muted">{site.domain}</span>
              </span>
              {site.id === active?.id && <Check className="h-3.5 w-3.5 shrink-0 text-pulse-deep" />}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => {
              setOpen(false);
              router.push("/dashboard/new");
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-pulse-deep hover:bg-paper"
          >
            <Plus className="h-3.5 w-3.5" />
            Add a site
          </button>
        </div>
      )}
    </div>
  );
}
