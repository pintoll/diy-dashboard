import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import { Switch } from "@/src/shared/ui/switch";
import {
  draftFromConnector,
  EMPTY_DRAFT,
  type ConnectorDraft,
} from "../model/connector-draft";
import { useConnectors } from "../model/use-connectors";
import { ConnectorEditor } from "./ConnectorEditor";
import { CredentialsPanel } from "./CredentialsPanel";

type Editing = { draft: ConnectorDraft; existing?: ConnectorDefinition };

// Data sources are primarily managed from outside the app (the dyd CLI, or
// connectors.json directly). This panel exists so a source that stops working
// can be diagnosed and fixed without leaving the app, not as the main authoring
// surface, which is why it stays deliberately plain.
export function ConnectorsSection() {
  const controller = useConnectors(true);
  const [editing, setEditing] = useState<Editing | null>(null);

  const { connectors, credentials, loading, error } = controller;

  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">Data sources</span>
          <p className="text-[11px] text-muted-foreground/70">
            Feed the Macro Indicators and Economic Calendar widgets.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => setEditing({ draft: EMPTY_DRAFT })}
        >
          <Plus className="size-3" />
          Add
        </Button>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {loading && connectors.length === 0 && (
        <p className="text-[11px] text-muted-foreground/70">Loading…</p>
      )}

      <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
        {connectors.map((connector) => (
          <div
            key={connector.id}
            className="flex items-center gap-2 rounded border border-border/40 px-2 py-1"
          >
            <Switch
              size="sm"
              checked={connector.enabled}
              onCheckedChange={(enabled) =>
                void controller.patch(connector.id, { enabled })
              }
              title={connector.enabled ? "Enabled" : "Disabled"}
            />
            <span className="text-[11px] font-medium">{connector.label}</span>
            <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
              {connector.group}
            </span>
            <span className="truncate text-[10px] text-muted-foreground/50">
              {connector.id}
            </span>
            <div className="ml-auto flex items-center">
              <Button
                variant="ghost"
                size="icon-xs"
                title={`Edit ${connector.label}`}
                onClick={() =>
                  setEditing({
                    draft: draftFromConnector(connector),
                    existing: connector,
                  })
                }
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title={`Remove ${connector.label}`}
                onClick={() => void controller.remove(connector.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ConnectorEditor
          draft={editing.draft}
          existing={editing.existing}
          credentials={credentials}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onSave={async (connector) => {
            const saved = await controller.save(connector);
            setEditing(null);
            return saved;
          }}
          onTest={controller.test}
          onCancel={() => setEditing(null)}
        />
      )}

      <CredentialsPanel
        credentials={credentials}
        onSet={controller.setCredential}
        onRemove={controller.removeCredential}
      />
    </div>
  );
}
