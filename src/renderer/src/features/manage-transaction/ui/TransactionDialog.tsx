import { useState } from "react";
import { Plus } from "lucide-react";
import type { Transaction } from "@/src/entities/finance-ledger";
import { Button } from "@/src/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { TransactionForm } from "./TransactionForm";

type Props = {
  transaction?: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TransactionDialog({ transaction, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {transaction ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
          <DialogDescription>
            Expenses leave your net worth. Transfers into savings or investments
            do not.
          </DialogDescription>
        </DialogHeader>
        {/* Remount on open so a reopened dialog starts from stored values. */}
        {open && (
          <TransactionForm
            key={transaction?.id ?? "new"}
            transaction={transaction}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddTransactionButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className={className} onClick={() => setOpen(true)}>
        <Plus />
        Add transaction
      </Button>
      <TransactionDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
