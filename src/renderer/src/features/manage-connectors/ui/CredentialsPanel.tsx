import { useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";
import { connectorErrorMessage } from "../model/use-connectors";

type CredentialsPanelProps = {
  credentials: CredentialMeta[];
  onSet: (name: string, secret: string, allowedHost: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
};

// Secrets are write-only: the main process never returns one, so there is no
// "current value" to prefill and an existing credential can only be replaced,
// not inspected.
export function CredentialsPanel({
  credentials,
  onSet,
  onRemove,
}: CredentialsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSet(name.trim(), secret, host.trim());
      setName("");
      setHost("");
      setSecret("");
      setAdding(false);
    } catch (err) {
      setError(connectorErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          Credentials
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px]"
          onClick={() => setAdding((value) => !value)}
        >
          <Plus className="size-3" />
          Add
        </Button>
      </div>

      {credentials.length === 0 && !adding && (
        <p className="text-[11px] text-muted-foreground/70">
          No credentials stored. Sources needing an API key will fail until one
          is added.
        </p>
      )}

      {credentials.map((credential) => (
        <div
          key={credential.name}
          className="flex items-center gap-2 rounded border border-border/40 px-2 py-1"
        >
          <KeyRound className="size-3 shrink-0 text-muted-foreground/50" />
          <span className="text-[11px] font-medium">{credential.name}</span>
          <span className="truncate text-[10px] text-muted-foreground/60">
            {credential.allowedHost}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            title={`Remove ${credential.name}`}
            onClick={() => void onRemove(credential.name)}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ))}

      {adding && (
        <div className="space-y-1.5 rounded border border-border/60 bg-muted/20 p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              value={name}
              placeholder="name (e.g. fred)"
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              value={host}
              placeholder="api.example.com"
              onChange={(e) => setHost(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <Input
            value={secret}
            type="password"
            autoComplete="off"
            placeholder="secret"
            onChange={(e) => setSecret(e.target.value)}
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground/70">
            The secret is only ever sent to this host. A source pointing
            anywhere else is refused.
          </p>
          {error && <p className="text-[10px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => void submit()}
              disabled={busy}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
