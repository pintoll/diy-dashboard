import { useState } from "react";
import { Ban, X } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { useFocusModeStore } from "@/src/entities/focus-mode";
import { useBlocklistStore } from "../model/use-blocklist-store";

// Blocklist editor surfaced as an icon button beside the Pomodoro settings gear.
// Editing locks while a focus session runs: the blocklist is a commitment set by
// the calm self before starting, immutable mid-session (mirrors FocusModeTab).
export function BlocklistButton() {
  const [open, setOpen] = useState(false);
  const sessionActive = useFocusModeStore((s) => s.sessionActive);
  const { sites, apps, addSite, removeSite, addApp, removeApp } =
    useBlocklistStore();

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setOpen(true)}
        aria-label="Blocklist"
        title={
          sessionActive
            ? "Locked during a focus session — stop to edit"
            : "Blocklist"
        }
      >
        <Ban />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blocklist</DialogTitle>
            <DialogDescription>
              {sessionActive
                ? "Locked while a focus session is running. Stop the session to edit."
                : "Sites and apps blocked while a focus session runs."}
            </DialogDescription>
          </DialogHeader>

          <EditList
            label="Sites (domain)"
            placeholder="www.youtube.com"
            items={sites}
            onAdd={addSite}
            onRemove={removeSite}
            locked={sessionActive}
          />
          <div className="mt-3">
            <EditList
              label="Apps (exe)"
              placeholder="notepad.exe"
              items={apps}
              onAdd={addApp}
              onRemove={removeApp}
              locked={sessionActive}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditList({
  label,
  placeholder,
  items,
  onAdd,
  onRemove,
  locked,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  locked: boolean;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    onAdd(draft);
    setDraft("");
  };

  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-7 text-xs"
          disabled={locked}
        />
        <Button
          type="submit"
          size="xs"
          variant="secondary"
          disabled={locked || draft.trim() === ""}
        >
          Add
        </Button>
      </form>
      <ul className="mt-1.5 space-y-0.5 text-xs">
        {items.length === 0 ? (
          <li className="text-muted-foreground">—</li>
        ) : (
          items.map((item) => (
            <li key={item} className="flex items-center justify-between gap-2">
              <span className="truncate" title={item}>
                {item}
              </span>
              <button
                type="button"
                onClick={() => onRemove(item)}
                aria-label={`Remove ${item}`}
                disabled={locked}
                className="text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
