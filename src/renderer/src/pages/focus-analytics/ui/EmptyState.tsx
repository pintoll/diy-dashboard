import type { ReactNode } from "react";

/**
 * The page's shared "nothing here yet" box. Each card supplies the one line
 * that tells the reader how to make its data appear.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
