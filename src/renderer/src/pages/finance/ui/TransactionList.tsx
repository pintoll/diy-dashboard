import { useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  formatDateLabel,
  type Transaction,
} from "@/src/entities/finance-ledger";
import { AmountText } from "@/src/entities/finance-ledger/client";
import { TransactionDialog } from "@/src/features/manage-transaction/client";
import { formatMinor } from "@/src/shared/lib/format-currency";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";

type Props = {
  transactions: Transaction[];
};

export function TransactionList({ transactions }: Props) {
  const [editing, setEditing] = useState<Transaction | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>
          {transactions.length === 0
            ? "Nothing recorded this month."
            : `${transactions.length} this month. Click one to edit it.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Add a transaction to start reading your flow.
          </div>
        ) : (
          <div className="flex flex-col">
            {transactions.map((transaction) => (
              <button
                key={transaction.id}
                type="button"
                onClick={() => setEditing(transaction)}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <span className="w-12 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatDateLabel(transaction.date)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {transaction.memo ||
                      transaction.categoryName ||
                      "Transfer"}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {transaction.kind === "transfer" ? (
                      <>
                        {transaction.fromAccountName}
                        <ArrowRight className="h-2.5 w-2.5" />
                        {transaction.toAccountName}
                      </>
                    ) : (
                      <>
                        {transaction.categoryName}
                        {" · "}
                        {transaction.fromAccountName ?? transaction.toAccountName}
                      </>
                    )}
                  </span>
                </span>

                <span className="flex flex-col items-end">
                  <AmountText
                    won={transaction.amountKrw}
                    kind={transaction.kind}
                    className="text-sm"
                  />
                  {transaction.currency !== "KRW" && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {formatMinor(transaction.amount, transaction.currency)}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {editing && (
        <TransactionDialog
          transaction={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </Card>
  );
}
