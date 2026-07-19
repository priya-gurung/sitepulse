"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSites } from "@/lib/sites-context";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";

export default function NewSitePage() {
  const { createSite } = useSites();
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const site = await createSite(name, domain);
      router.push(`/dashboard/${site.id}/settings?new=1`);
    } catch {
      setError("Couldn't create the site. Check the domain and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-xl font-semibold text-ink">Add a site</h1>
      <p className="mt-1.5 text-sm text-muted">
        Give it a name and the domain it lives on — you'll get a tracking snippet next.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Field
          id="name"
          label="Site name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Marketing site"
        />
        <Field
          id="domain"
          label="Domain"
          required
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
        />

        {error && (
          <p role="alert" className="text-sm text-signal-coral">
            {error}
          </p>
        )}

        <div className="mt-1 flex gap-3">
          <Button type="submit" loading={loading}>
            Create site
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
