import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";

type MemoPanelProps = {
  snapshots: MemoSnapshotItem[];
  orphans: MemoOrphanItem[];
  // False once this memo has any text or history of its own: adopting replaces
  // both, so it is only offered on a memo with nothing to lose.
  canAdopt: boolean;
  onRestore: (snapshotId: string) => void;
  onDelete: (snapshotId: string) => void;
  onAdopt: (orphanId: string) => void;
  onDiscard: (orphanId: string) => void;
  onClose: () => void;
};

type Tab = "snapshots" | "recover";

// The widget is a few grid cells wide, so a row shows the first line that has
// any text on it rather than the raw head of the body (which is often blank).
function preview(body: string): string {
  const line = body.split("\n").find((candidate) => candidate.trim().length > 0);
  return line?.trim() ?? "(empty)";
}

// Deleting is a DELETE with no undo behind it, and the icon that does it sits
// next to the one that restores. So it arms first: one click to ask, one to mean
// it. Nothing else in the panel destroys anything, so nothing else needs this.
function RowActions({
  armed,
  onArm,
  onDisarm,
  onDelete,
  deleteLabel,
  children,
}: {
  armed: boolean;
  onArm: () => void;
  onDisarm: () => void;
  onDelete: () => void;
  deleteLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100",
        // Armed rows stay visible: the confirmation must not vanish because the
        // pointer drifted off the row on its way to the button.
        armed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}
    >
      {armed ? (
        <>
          <Button
            variant="ghost"
            size="xs"
            className="text-[10px]"
            onClick={onDisarm}
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-[10px] text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            Delete
          </Button>
        </>
      ) : (
        <>
          {children}
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            onClick={onArm}
            aria-label={deleteLabel}
          >
            <Trash2 />
          </Button>
        </>
      )}
    </div>
  );
}

export function MemoPanel({
  snapshots,
  orphans,
  canAdopt,
  onRestore,
  onDelete,
  onAdopt,
  onDiscard,
  onClose,
}: MemoPanelProps) {
  const [tab, setTab] = useState<Tab>("snapshots");
  // Which row is asking to be confirmed. One at a time, and ids are unique
  // across both tabs, so a single value covers the whole panel.
  const [armed, setArmed] = useState<string | null>(null);

  const tabButton = (value: Tab, label: string, count: number) => (
    <Button
      variant="ghost"
      size="xs"
      className={cn(
        "text-[10px] uppercase tracking-wide",
        tab === value ? "bg-muted text-foreground" : "text-muted-foreground"
      )}
      onClick={() => {
        setTab(value);
        setArmed(null);
      }}
    >
      {label} · {count}
    </Button>
  );

  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-md border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-border px-1 py-1">
        <div className="flex items-center gap-0.5">
          {tabButton("snapshots", "Snapshots", snapshots.length)}
          {tabButton("recover", "Recover", orphans.length)}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X />
        </Button>
      </div>

      {tab === "snapshots" ? (
        snapshots.length === 0 ? (
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
                  <RowActions
                    armed={armed === snapshot.id}
                    onArm={() => setArmed(snapshot.id)}
                    onDisarm={() => setArmed(null)}
                    onDelete={() => {
                      setArmed(null);
                      onDelete(snapshot.id);
                    }}
                    deleteLabel="Delete snapshot"
                  >
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-[10px]"
                      onClick={() => onRestore(snapshot.id)}
                    >
                      Restore
                    </Button>
                  </RowActions>
                </div>
                <p className="truncate text-xs">{preview(snapshot.body)}</p>
              </div>
            ))}
          </div>
        )
      ) : orphans.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          Nothing lost. Memos left behind by a removed widget would be here.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
          {!canAdopt && (
            <p className="px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
              Recovering replaces this memo. Clear it first, or add a new memo
              widget to recover into.
            </p>
          )}
          {orphans.map((orphan) => (
            <div
              key={orphan.id}
              className="group rounded-md px-2 py-1.5 hover:bg-accent/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {formatTimeAgo(orphan.updatedAt)} ·{" "}
                  {orphan.charCount.toLocaleString()} chars
                  {orphan.snapshotCount > 0 && ` · ${orphan.snapshotCount} snap`}
                </span>
                <RowActions
                  armed={armed === orphan.id}
                  onArm={() => setArmed(orphan.id)}
                  onDisarm={() => setArmed(null)}
                  onDelete={() => {
                    setArmed(null);
                    onDiscard(orphan.id);
                  }}
                  deleteLabel="Delete this memo for good"
                >
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-[10px]"
                    disabled={!canAdopt}
                    onClick={() => onAdopt(orphan.id)}
                  >
                    Recover
                  </Button>
                </RowActions>
              </div>
              <p className="truncate text-xs">
                {orphan.preview === "" ? "(empty)" : orphan.preview}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
