import * as React from "react"

import { cn } from "@/src/shared/lib/utils"
import { Label } from "@/src/shared/ui/label"

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

export { Field }
