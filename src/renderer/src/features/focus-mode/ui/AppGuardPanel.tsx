import { useCallback, useEffect, useState } from "react";
import { Button } from "@/src/shared/ui/button";
import { TEST_APPLIST } from "../model/test-applist";

// Phase 2 debug surface for the app (kill-on-sight) block engine. Manually
// trigger enforce / release and trace kills via status + history. Requires an
// active Pomodoro session for the 10s poll to run. Replaced by the real
// focus/leisure intent UI in a later phase.
export function AppGuardPanel() {
  const appGuard =
    typeof window !== "undefined" ? window.electronAPI?.appGuard : undefined;

  const [status, setStatus] = useState<AppGuardDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const run = useCallback(
    async (op: () => Promise<AppGuardDiagnostics>) => {
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
    if (!appGuard) return;
    void appGuard.getStatus().then(setStatus);
  }, [appGuard]);

  if (!appGuard) return null;

  if (collapsed) {
    return (
      <div className="fixed bottom-3 right-3 z-50">
        <Button size="xs" variant="outline" onClick={() => setCollapsed(false)}>
          App Guard
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 w-80 rounded-lg border bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">App Guard (debug)</span>
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
          variant="default"
          disabled={busy}
          onClick={() => run(() => appGuard.enforce(TEST_APPLIST))}
        >
          Enforce (test)
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={busy}
          onClick={() => run(() => appGuard.release())}
        >
          Release
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => appGuard.getStatus())}
        >
          Refresh
        </Button>
      </div>

      <History entries={status?.history ?? []} />
    </div>
  );
}

function StatusRows({ status }: { status: AppGuardDiagnostics | null }) {
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
      <Row label="Enforcing" value={status.enforcing ? "yes" : "no"} />
      <Row
        label="Exes"
        value={status.blockedExes.length ? status.blockedExes.join(", ") : "—"}
      />
      <Row label="Kills" value={String(status.killCount)} />
      <Row label="Last killed" value={status.lastKilledExe ?? "—"} />
      <Row label="Last action" value={status.lastAction ?? "—"} />
      {status.lastError ? (
        <Row label="Last error" value={status.lastError} error />
      ) : null}
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

function History({ entries }: { entries: AppGuardHistoryEntry[] }) {
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
