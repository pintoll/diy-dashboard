import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  ledgerErrorMessage,
  requireLedgerApi,
  useFinanceStore,
} from "@/src/entities/finance-ledger";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";

// One manually maintained rate, applied at read time. Changing it reflows every
// USD figure in the ledger at once, which is what you want when the number is a
// judgement call rather than a market quote.
export function FxRateSetting() {
  const rate = useFinanceStore((s) => s.rate);
  const refresh = useFinanceStore((s) => s.refresh);

  const [draft, setDraft] = useState(String(rate));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(String(rate));
  }, [rate]);

  const dirty = draft !== String(rate);

  async function save() {
    const next = Number(draft.replace(/[,\s]/g, ""));
    if (!Number.isFinite(next) || next <= 0) {
      setError("Enter a positive number");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await requireLedgerApi().rate.set(next);
      await refresh();
    } catch (err) {
      setError(ledgerErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">USD to KRW</span>
        <Input
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          className="h-8 w-28 tabular-nums"
        />
        {dirty && (
          <Button
            size="icon-sm"
            aria-label="Save exchange rate"
            disabled={saving}
            onClick={() => void save()}
          >
            <Check />
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
