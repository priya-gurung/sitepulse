"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "./api";
import type { Site } from "./types";

interface SitesContextValue {
  sites: Site[];
  loading: boolean;
  createSite: (name: string, domain: string) => Promise<Site>;
  deleteSite: (siteId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const SitesContext = createContext<SitesContextValue | undefined>(undefined);

export function SitesProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await apiRequest<{ sites: Site[] }>("/sites");
    setSites(data.sites);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const createSite = useCallback(async (name: string, domain: string) => {
    const data = await apiRequest<{ site: Site }>("/sites", {
      method: "POST",
      body: { name, domain },
    });
    setSites((prev) => [data.site, ...prev]);
    return data.site;
  }, []);

  const deleteSite = useCallback(async (siteId: string) => {
    await apiRequest(`/sites/${siteId}`, { method: "DELETE" });
    setSites((prev) => prev.filter((s) => s.id !== siteId));
  }, []);

  return (
    <SitesContext.Provider value={{ sites, loading, createSite, deleteSite, refresh }}>
      {children}
    </SitesContext.Provider>
  );
}

export function useSites(): SitesContextValue {
  const ctx = useContext(SitesContext);
  if (!ctx) throw new Error("useSites must be used within SitesProvider");
  return ctx;
}
