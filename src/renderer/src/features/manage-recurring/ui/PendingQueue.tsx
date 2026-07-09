import { useState } from "react";
import { Check, SkipForward, X } from "lucide-react";
import {
  formatDateLabel,
  ledgerErrorMessage,
  requireLedgerApi,
  useFinanceStore,
  type PendingCharge,
} from "@/src/entities/finance-ledger";
import {
  formatMinor,
  minorToInputValue,
  parseAmountToMinor,
} from "@/src/shared/lib/format-currency";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";

// A charge is "pending" when its rule is due this month and no transaction has
// been posted for it. Confirming posts the transaction, which is what makes it
// disappear from here: there is no status to keep in sync.
export function PendingQueue() {
  const pending = useFinanceStore((s) => s.pending);
  const ym = useFinanceStore((s) => s.ym);
  const refresh = useFinanceStore((s) => s.refresh);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(ruleId: number, action: () => Promise<unknown>) {
    setBusyId(ruleId);
    setError(null);
    try {
      await action();
      await refresh();
      setEditingId(null);
    } catch (err) {
      setError(ledgerErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function confirm(charge: PendingCharge, amount?: number) {
    return run(charge.id, () =>
      requireLedgerApi().recurring.confirm({
        ruleId: charge.id,
        ym,
        amount,
        date: charge.dueDate,
      })
    );
  }

  function skip(charge: PendingCharge) {
    return run(charge.id, () =>
      requireLedgerApi().recurring.skip({ ruleId: charge.id, ym })
    );
  }

  function startReview(charge: PendingCharge) {
    setEditingId(charge.id);
    setDraftAmount(minorToInputValue(charge.amount, charge.currency));
    setError(null);
  }

  function submitReview(charge: PendingCharge) {
    const minor = parseAmountToMinor(draftAmount, charge.currency);
    if (minor === null || minor <= 0) {
      setError("Enter the amount you were actually charged");
      return;
    }
    void confirm(charge, minor);
  }

  if (pending.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
        Nothing left to confirm this month.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {pending.map((charge) => {
        const busy = busyId === charge.id;
        const editing = editingId === charge.id;

        return (
          <div
            key={charge.id}
            className="group flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm">{charge.name}</span>
                {charge.variable && (
                  <span className="rounded-sm bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                    varies
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {formatDateLabel(charge.dueDate)}
                {charge.categoryName ? ` · ${charge.categoryName}` : ""}
              </span>
            </div>

            {editing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  inputMode="decimal"
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitReview(charge);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 w-24 tabular-nums"
                />
                <Button
                  size="icon-xs"
                  disabled={busy}
                  aria-label="Confirm charge"
                  onClick={() => submitReview(charge)}
                >
                  <Check />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Cancel"
                  onClick={() => setEditingId(null)}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {charge.variable ? "~" : ""}
                  {formatMinor(charge.amount, charge.currency)}
                </span>
                <Button
                  size="xs"
                  variant={charge.variable ? "outline" : "default"}
                  disabled={busy}
                  onClick={() =>
                    charge.variable ? startReview(charge) : void confirm(charge)
                  }
                >
                  {charge.variable ? "Review" : "Confirm"}
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Skip ${charge.name} this month`}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => void skip(charge)}
                >
                  <SkipForward />
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="px-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
