import { useState } from "react";
import { cn } from "@/src/shared/lib/utils";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Textarea } from "@/src/shared/ui/textarea";
import {
  connectorFromDraft,
  type ConnectorDraft,
} from "../model/connector-draft";
import { connectorErrorMessage } from "../model/use-connectors";

const UNITS = ["percent", "index", "currency", "basis_points"] as const;
const AUTH_MODES = ["none", "query", "bearer", "header"] as const;

type ConnectorEditorProps = {
  draft: ConnectorDraft;
  existing?: ConnectorDefinition;
  credentials: CredentialMeta[];
  onChange: (draft: ConnectorDraft) => void;
  onSave: (connector: unknown) => Promise<unknown>;
  onTest: (connector: unknown) => Promise<ConnectorTestResult>;
  onCancel: () => void;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function ConnectorEditor({
  draft,
  existing,
  credentials,
  onChange,
  onSave,
  onTest,
  onCancel,
}: ConnectorEditorProps) {
  const [test, setTest] = useState<ConnectorTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ConnectorDraft>(key: K, value: ConnectorDraft[K]) {
    onChange({ ...draft, [key]: value });
    // Any edit invalidates the previous verdict; leaving a stale green result
    // on screen would be worse than showing none.
    setTest(null);
  }

  async function run(action: "test" | "save") {
    setBusy(true);
    setError(null);
    try {
      const definition = connectorFromDraft(draft, existing);
      if (action === "test") {
        setTest(await onTest(definition));
        return;
      }
      await onSave(definition);
    } catch (err) {
      setError(connectorErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isSeries = draft.kind === "series";

  return (
    <div className="space-y-2.5 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="ID" hint="Stable key. Also how dyd addresses it.">
          <Input
            value={draft.id}
            disabled={existing !== undefined}
            placeholder="BTC-KRW"
            onChange={(e) => set("id", e.target.value)}
          />
        </Field>
        <Field label="Label">
          <Input
            value={draft.label}
            placeholder="Bitcoin"
            onChange={(e) => set("label", e.target.value)}
          />
        </Field>
        <Field label="Group" hint="Becomes a tab in the widget.">
          <Input
            value={draft.group}
            placeholder="Crypto"
            onChange={(e) => set("group", e.target.value)}
          />
        </Field>
        <Field label="Kind">
          <select
            value={draft.kind}
            disabled={existing !== undefined}
            onChange={(e) =>
              set("kind", e.target.value as ConnectorDraft["kind"])
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-50"
          >
            <option value="series">series</option>
            <option value="events">events</option>
          </select>
        </Field>
      </div>

      <Field label="URL" hint="https only.">
        <Input
          value={draft.url}
          placeholder="https://api.example.com/v1/candles"
          onChange={(e) => set("url", e.target.value)}
        />
      </Field>

      <Field
        label="Query parameters"
        hint={
          isSeries
            ? "One key=value per line. {{limit}} is substituted per request."
            : "One key=value per line. {{from}} and {{to}} are substituted per request."
        }
      >
        <Textarea
          value={draft.queryText}
          rows={3}
          spellCheck={false}
          placeholder={"market=KRW-BTC\ncount={{limit}}"}
          onChange={(e) => set("queryText", e.target.value)}
          className="font-mono text-xs"
        />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Auth">
          <select
            value={draft.authMode}
            onChange={(e) =>
              set("authMode", e.target.value as ConnectorDraft["authMode"])
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {AUTH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </Field>
        {(draft.authMode === "query" || draft.authMode === "header") && (
          <Field label={draft.authMode === "query" ? "Param" : "Header"}>
            <Input
              value={draft.authParam}
              onChange={(e) => set("authParam", e.target.value)}
            />
          </Field>
        )}
        {draft.authMode !== "none" && (
          <Field label="Credential">
            <select
              value={draft.authCredential}
              onChange={(e) => set("authCredential", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">select…</option>
              {credentials.map((credential) => (
                <option key={credential.name} value={credential.name}>
                  {credential.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="itemsPath" hint="Empty = root is the array.">
          <Input
            value={draft.itemsPath}
            placeholder="observations"
            onChange={(e) => set("itemsPath", e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="datePath">
          <Input
            value={draft.datePath}
            onChange={(e) => set("datePath", e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        {isSeries ? (
          <Field label="valuePath">
            <Input
              value={draft.valuePath}
              onChange={(e) => set("valuePath", e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
        ) : (
          <Field label="labelPath" hint="Optional.">
            <Input
              value={draft.labelPath}
              onChange={(e) => set("labelPath", e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
        )}
      </div>

      {isSeries && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Unit">
            <select
              value={draft.unit}
              onChange={(e) => set("unit", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Decimals">
            <Input
              value={draft.fractionDigits}
              inputMode="numeric"
              onChange={(e) => set("fractionDigits", e.target.value)}
            />
          </Field>
          <Field label="Skip values" hint="Comma separated.">
            <Input
              value={draft.skipValuesText}
              placeholder="."
              onChange={(e) => set("skipValuesText", e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
        </div>
      )}

      {test && (
        <div
          className={cn(
            "rounded border px-2 py-1.5 text-[11px] leading-snug",
            test.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {test.ok ? (
            <>
              <div className="font-medium">
                Parsed {test.itemCount} point{test.itemCount === 1 ? "" : "s"}
              </div>
              <div className="mt-0.5 font-mono">
                {(test.sample ?? [])
                  .map((s) => `${s.date} ${s.value ?? s.label ?? ""}`.trim())
                  .join("  |  ")}
              </div>
            </>
          ) : (
            test.error
          )}
        </div>
      )}

      {error && (
        <p className="text-[11px] leading-snug text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => run("test")}
          disabled={busy}
        >
          Test
        </Button>
        <Button size="sm" onClick={() => run("save")} disabled={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}
