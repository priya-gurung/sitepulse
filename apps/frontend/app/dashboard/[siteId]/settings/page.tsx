"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSites } from "@/lib/sites-context";
import { PageHeader } from "@/components/PageHeader";
import { Snippet } from "@/components/Snippet";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";

export default function SiteSettingsPage() {
  return (
    <Suspense fallback={null}>
      <SiteSettingsContent />
    </Suspense>
  );
}

function SiteSettingsContent() {
  const { siteId } = useParams<{ siteId: string }>();
  const { sites, deleteSite } = useSites();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const site = sites.find((s) => s.id === siteId);

  if (!site) {
    return (
      <div className="px-8 py-6">
        <EmptyState title="Site not found" description="This site may have been removed." />
      </div>
    );
  }

  const snippet = `<script
  src="https://site-pulse.xyz/analytics.js"
  data-site-key="${site.publicKey}"
  data-endpoint="https://site-pulse.xyz/collect"
  async
></script>`;

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteSite(site!.id);
      router.push("/dashboard");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle={site.domain} />

      <div className="mx-auto max-w-2xl px-8 py-6">
        {isNew && (
          <div className="mb-6 rounded-lg border border-pulse/30 bg-pulse-dim/30 px-4 py-3 text-sm text-pulse-deep">
            {site.name} is ready. Add the snippet below to your site to start collecting data.
          </div>
        )}

        <section>
          <h2 className="font-display text-sm font-semibold text-ink">Tracking snippet</h2>
          <p className="mt-1 text-sm text-muted">
            Paste this in the <code className="font-mono text-xs">&lt;head&gt;</code> of every page
            you want to track.
          </p>
          <div className="mt-3">
            <Snippet code={snippet} />
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-sm font-semibold text-ink">Site details</h2>
          <dl className="mt-3 flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Name</dt>
              <dd className="font-medium text-ink">{site.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Domain</dt>
              <dd className="font-medium text-ink">{site.domain}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Public key</dt>
              <dd className="font-mono text-xs text-ink">{site.publicKey}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Status</dt>
              <dd className={site.isActive ? "font-medium text-pulse-deep" : "font-medium text-muted"}>
                {site.isActive ? "Active" : "Inactive"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-8 rounded-xl border border-signal-coral/30 bg-surface p-5">
          <h2 className="font-display text-sm font-semibold text-ink">Danger zone</h2>
          <p className="mt-1 text-sm text-muted">
            Removing this site stops all tracking immediately and deletes its operational data.
            Historical analytics in Tinybird are retained separately.
          </p>

          {confirmOpen ? (
            <div className="mt-4 flex items-center gap-3">
              <Button variant="primary" className="bg-signal-coral hover:bg-signal-coral" loading={deleting} onClick={handleDelete}>
                Confirm delete
              </Button>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
                Delete site
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
