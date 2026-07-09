import { useState } from "react";
import { Plus } from "lucide-react";
import type { Account } from "@/src/entities/finance-ledger";
import { Button } from "@/src/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { AccountForm } from "./AccountForm";
import { ValuationForm } from "./ValuationForm";

export function AccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account?: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>
            An account&apos;s kind decides how money landing in it is read.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <AccountForm
            key={account?.id ?? "new"}
            account={account}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ValuationDialog({
  account,
  open,
  onOpenChange,
}: {
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {account.name}</DialogTitle>
          <DialogDescription>
            Record what this account is worth today.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ValuationForm account={account} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Account
      </Button>
      <AccountDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
