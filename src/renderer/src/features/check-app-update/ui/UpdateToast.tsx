import { useEffect, useState } from "react";
import { Download, RefreshCw, X, AlertCircle } from "lucide-react";
import { Button } from "@/src/shared/ui/button";

export function UpdateToast() {
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onUpdateStatus((payload) => {
      setStatus(payload);
      setDismissed(false);
    });
    return () => unsubscribe?.();
  }, []);

  if (dismissed || !status) return null;
  if (status.status === "checking" || status.status === "not-available") return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-card p-4 shadow-lg">
      {status.status === "available" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Download className="size-4" />
          <span>Downloading update v{status.version}...</span>
        </div>
      )}

      {status.status === "downloading" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Download className="size-4 animate-pulse" />
            <span>Downloading update...</span>
            <span className="ml-auto">{Math.round(status.percent)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${status.percent}%` }}
            />
          </div>
        </div>
      )}

      {status.status === "downloaded" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="size-4 text-primary" />
            <span>Update v{status.version} ready</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              onClick={() => window.electronAPI?.quitAndInstallUpdate()}
            >
              Restart now
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setDismissed(true)}
            >
              Later
            </Button>
          </div>
        </div>
      )}

      {status.status === "error" && (
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm">Update failed</p>
            <p className="truncate text-xs text-muted-foreground">
              {status.message}
            </p>
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setDismissed(true)}
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
