import { useState } from "react";
import { Plus, Repeat } from "lucide-react";
import {
  useFinanceStore,
  type RecurringRule,
} from "@/src/entities/finance-ledger";
import { formatMinor } from "@/src/shared/lib/format-currency";
import { Button } from "@/src/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { RuleForm } from "./RuleForm";

type Editing = RecurringRule | "new" | null;

export function RecurringRulesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rules = useFinanceStore((s) => s.rules);
  const [editing, setEditing] = useState<Editing>(null);

  function close(next: boolean) {
    if (!next) setEditing(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? (editing === "new" ? "New rule" : "Edit rule") : "Recurring"}
          </DialogTitle>
          <DialogDescription>
            Rules do not post on their own. Each month they wait in the queue
            until you confirm what you were actually charged.
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <RuleForm
            key={editing === "new" ? "new" : editing.id}
            rule={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {rules.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                No recurring rules yet. Add the subscriptions you pay every month.
              </p>
            ) : (
              <div className="flex flex-col">
                {rules.map((rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => setEditing(rule)}
                    className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm">{rule.name}</span>
                        {!rule.active && (
                          <span className="rounded-sm bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                            paused
                          </span>
                        )}
                        {rule.variable && (
                          <span className="rounded-sm bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                            varies
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {`Day ${rule.billingDay}`}
                        {rule.categoryName ? ` · ${rule.categoryName}` : ""}
                      </span>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {rule.variable ? "~" : ""}
                      {formatMinor(rule.amount, rule.currency)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <Button variant="outline" onClick={() => setEditing("new")}>
              <Plus />
              Add rule
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RecurringRulesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Repeat />
        Rules
      </Button>
      <RecurringRulesDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
