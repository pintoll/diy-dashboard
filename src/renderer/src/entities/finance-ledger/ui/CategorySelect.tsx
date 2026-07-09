import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";
import { useFinanceStore } from "../model/use-finance-store";
import type { Category, CategoryKind } from "../model/finance-ledger.types";

type CategoryGroup = { group: string; items: Category[] };

// Categories arrive pre-sorted by sort_order, which keeps each group contiguous.
function groupCategories(categories: Category[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const category of categories) {
    const last = groups.at(-1);
    if (last && last.group === category.groupName) last.items.push(category);
    else groups.push({ group: category.groupName, items: [category] });
  }
  return groups;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  kind: CategoryKind;
  placeholder?: string;
};

export function CategorySelect({
  value,
  onChange,
  kind,
  placeholder = "Choose a category",
}: Props) {
  const categories = useFinanceStore((s) => s.categories);
  const groups = useMemo(
    () => groupCategories(categories.filter((c) => c.kind === kind)),
    [categories, kind]
  );

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {groups.map(({ group, items }) => (
          <SelectGroup key={group}>
            <SelectLabel>{group}</SelectLabel>
            {items.map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
