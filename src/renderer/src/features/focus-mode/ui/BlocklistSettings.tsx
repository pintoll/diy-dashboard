import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";
import { useBlocklistStore } from "../model/use-blocklist-store";

// Minimal blocklist editor for the sites (hosts) and apps (kill) engines. The
// full config UX (validation, subdomain hints, import) is Phase 4 polish.
export function BlocklistSettings() {
  const [collapsed, setCollapsed] = useState(true);
  const { sites, apps, addSite, removeSite, addApp, removeApp } = useBlocklistStore();

  if (collapsed) {
    return (
      <div className="fixed top-3 right-3 z-50">
        <Button size="xs" variant="outline" onClick={() => setCollapsed(false)}>
          Blocklist
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed top-3 right-3 z-50 w-72 rounded-lg border bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Blocklist</span>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse"
        >
          ×
        </Button>
      </div>

      <EditList
        label="Sites (domain)"
        placeholder="www.youtube.com"
        items={sites}
        onAdd={addSite}
        onRemove={removeSite}
      />
      <div className="mt-3">
        <EditList
          label="Apps (exe)"
          placeholder="notepad.exe"
          items={apps}
          onAdd={addApp}
          onRemove={removeApp}
        />
      </div>
    </div>
  );
}

function EditList({
  label,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
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
        />
        <Button type="submit" size="xs" variant="secondary" disabled={draft.trim() === ""}>
          Add
        </Button>
      </form>
      <ul className="mt-1.5 space-y-0.5">
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
                className="text-muted-foreground hover:text-destructive"
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
