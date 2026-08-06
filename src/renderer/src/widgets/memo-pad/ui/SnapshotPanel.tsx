import { Trash2, X } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";

type SnapshotPanelProps = {
  snapshots: MemoSnapshotItem[];
  onRestore: (snapshotId: string) => void;
  onDelete: (snapshotId: string) => void;
  onClose: () => void;
};

// The widget is a few grid cells wide, so a row shows the first line that has
// any text on it rather than the raw head of the body (which is often blank).
function preview(body: string): string {
  const line = body.split("\n").find((candidate) => candidate.trim().length > 0);
  return line?.trim() ?? "(empty)";
}

export function SnapshotPanel({
  snapshots,
  onRestore,
  onDelete,
  onClose,
}: SnapshotPanelProps) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-md border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Snapshots · {snapshots.length}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close snapshots"
        >
          <X />
        </Button>
      </div>

      {snapshots.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          No snapshots yet.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className="group rounded-md px-2 py-1.5 hover:bg-accent/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {formatTimeAgo(snapshot.createdAt)}
                </span>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-[10px]"
                    onClick={() => onRestore(snapshot.id)}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(snapshot.id)}
                    aria-label="Delete snapshot"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <p className="truncate text-xs">{preview(snapshot.body)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
