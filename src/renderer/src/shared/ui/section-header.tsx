import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { cn } from "@/src/shared/lib/utils"

// The small uppercase heading a list section carries, in both forms the app
// uses: a plain label, and a button that folds the section under it. They were
// written out four times — the todos page's Inbox, the projects page's Backlog,
// Scheduled and Completed — which is how a fold ends up looking unlike the
// static heading stacked directly above it.
//
// A count belongs in the heading whenever the section can be empty or folded:
// a bin with no visible size becomes a black hole.

const sizes = {
  // The list nested inside a card (the projects sidebar) reads at one step down
  // from a page-level section.
  sm: { text: "text-[10px]", chevron: "size-3" },
  md: { text: "text-xs", chevron: "size-3.5" },
}

type Size = keyof typeof sizes

function SectionLabel({
  size = "md",
  className,
  children,
  ...props
}: React.ComponentProps<"h2"> & { size?: Size }) {
  return (
    <h2
      data-slot="section-label"
      className={cn(
        "px-2 font-medium uppercase tracking-wide text-muted-foreground",
        sizes[size].text,
        className
      )}
      {...props}
    >
      {children}
    </h2>
  )
}

function SectionToggle({
  open,
  onToggle,
  size = "md",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "onToggle"> & {
  open: boolean
  onToggle: () => void
  size?: Size
}) {
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      data-slot="section-toggle"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex items-center gap-1 px-2 font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
        sizes[size].text,
        className
      )}
      {...props}
    >
      <Chevron className={sizes[size].chevron} />
      {children}
    </button>
  )
}

export { SectionLabel, SectionToggle }
