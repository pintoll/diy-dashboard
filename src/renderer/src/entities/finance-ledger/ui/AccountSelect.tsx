import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";
import { useFinanceStore } from "../model/use-finance-store";
import { KindDot } from "./KindDot";

type Props = {
  value: string;
  onChange: (value: string) => void;
  // Hides an account already chosen for the other side of a transfer.
  excludeId?: string;
  placeholder?: string;
};

export function AccountSelect({
  value,
  onChange,
  excludeId,
  placeholder = "Choose an account",
}: Props) {
  const accounts = useFinanceStore((s) => s.accounts);
  const options = accounts.filter((a) => String(a.id) !== excludeId);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((account) => (
          <SelectItem key={account.id} value={String(account.id)}>
            <KindDot kind={account.kind} />
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
