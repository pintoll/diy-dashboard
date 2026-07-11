import { AlertTriangle } from "lucide-react";
import { useFocusModeStore } from "@/src/entities/focus-mode";

// Surfaces the site guard's last hosts-write failure. Only rendered while an
// error is set (a focus session whose block did not apply), so an active
// session can no longer look like it is blocking sites when it is not. The
// full OS error is in the tooltip; FocusModeController clears it on success.
export function SiteBlockWarning() {
  const siteBlockError = useFocusModeStore((s) => s.siteBlockError);
  if (!siteBlockError) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-300"
      title={`Site blocking is not active: ${siteBlockError}`}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      Sites not blocked
    </span>
  );
}
