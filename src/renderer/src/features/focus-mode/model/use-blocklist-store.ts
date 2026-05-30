import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TEST_BLOCKLIST } from "./test-blocklist";
import { TEST_APPLIST } from "./test-applist";

// The user-editable blocklist driving both engines during focus. sites feeds
// siteGuard.block (hosts, domain-level), apps feeds appGuard.enforce (exe
// kill-on-sight). Seeded from the Phase 1/2 test constants; the blocklist is
// the only lever — only what is listed is blocked. Persisted so edits survive
// restarts.
type BlocklistState = {
  sites: string[];
  apps: string[];
  addSite: (domain: string) => void;
  removeSite: (domain: string) => void;
  addApp: (exe: string) => void;
  removeApp: (exe: string) => void;
};

function addNormalized(list: string[], raw: string): string[] {
  const value = raw.trim().toLowerCase();
  if (value === "") return list;
  if (list.includes(value)) return list;
  return [...list, value];
}

export const useBlocklistStore = create<BlocklistState>()(
  persist(
    (set) => ({
      sites: [...TEST_BLOCKLIST],
      apps: [...TEST_APPLIST],
      addSite: (domain) => set((s) => ({ sites: addNormalized(s.sites, domain) })),
      removeSite: (domain) =>
        set((s) => ({ sites: s.sites.filter((d) => d !== domain.toLowerCase()) })),
      addApp: (exe) => set((s) => ({ apps: addNormalized(s.apps, exe) })),
      removeApp: (exe) =>
        set((s) => ({ apps: s.apps.filter((a) => a !== exe.toLowerCase()) })),
    }),
    {
      name: "focus-blocklist",
    }
  )
);
