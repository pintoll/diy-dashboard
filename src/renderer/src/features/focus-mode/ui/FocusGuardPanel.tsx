import { useCallback, useEffect, useState } from "react";
import { Button } from "@/src/shared/ui/button";
import { TEST_BLOCKLIST } from "../model/test-blocklist";

// Phase 1 debug surface for the hosts (site) block engine. Manually trigger
// grant / block / unblock and trace failures via status + history. Replaced by
// the real focus/leisure intent UI in a later phase.
export function FocusGuardPanel() {
  const siteGuard =
    typeof window !== "undefined" ? window.electronAPI?.siteGuard : undefined;

  const [status, setStatus] = useState<SiteGuardDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const run = useCallback(
    async (op: () => Promise<SiteGuardDiagnostics>) => {
      setBusy(true);
      try {
        setStatus(await op());
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!siteGuard) return;
    void siteGuard.getStatus().then(setStatus);
  }, [siteGuard]);

  if (!siteGuard) return null;

  if (collapsed) {
    return (
      <div className="fixed bottom-3 left-3 z-50">
        <Button size="xs" variant="outline" onClick={() => setCollapsed(false)}>
          Site Guard
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 z-50 w-80 rounded-lg border bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Site Guard (debug)</span>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse"
        >
          ×
        </Button>
      </div>

      <StatusRows status={status} />

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => siteGuard.grantPermission())}
        >
          Grant permission
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => siteGuard.getStatus())}
        >
          Refresh
        </Button>
        <Button
          size="xs"
          variant="default"
          disabled={busy}
          onClick={() => run(() => siteGuard.block(TEST_BLOCKLIST))}
        >
          Block (test)
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={busy}
          onClick={() => run(() => siteGuard.unblock())}
        >
          Unblock
        </Button>
      </div>

      <History entries={status?.history ?? []} />
    </div>
  );
}

function StatusRows({ status }: { status: SiteGuardDiagnostics | null }) {
  if (!status) return <p className="text-muted-foreground">Loading status...</p>;

  if (!status.supported) {
    return (
      <p className="text-muted-foreground">
        Windows only (platform: {status.platform})
      </p>
    );
  }

  return (
    <dl className="space-y-0.5">
      <Row label="Write permission" value={permLabel(status.hasWritePermission)} />
      <Row label="Blocked" value={status.isBlocked ? "yes" : "no"} />
      <Row
        label="Domains"
        value={status.blockedDomains.length ? status.blockedDomains.join(", ") : "—"}
      />
      <Row label="Last action" value={status.lastAction ?? "—"} />
      {status.lastError ? (
        <Row label="Last error" value={status.lastError} error />
      ) : null}
      <p className="truncate pt-1 text-[10px] text-muted-foreground" title={status.hostsPath}>
        {status.hostsPath}
      </p>
    </dl>
  );
}

function Row({
  label,
  value,
  error,
}: {
  label: string;
  value: string;
  error?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={error ? "text-right text-destructive" : "text-right"}>{value}</dd>
    </div>
  );
}

function History({ entries }: { entries: SiteGuardHistoryEntry[] }) {
  if (entries.length === 0) return null;
  const recent = entries.slice(-6).reverse();
  return (
    <div className="mt-3 border-t pt-2">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        History
      </p>
      <ul className="space-y-0.5">
        {recent.map((entry) => (
          <li key={entry.at} className="flex gap-2">
            <span className={entry.ok ? "text-green-500" : "text-destructive"}>
              {entry.ok ? "✓" : "✗"}
            </span>
            <span className="text-muted-foreground">{entry.action}</span>
            {entry.message ? (
              <span className="truncate" title={entry.message}>
                {entry.message}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function permLabel(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "granted" : "denied";
}
