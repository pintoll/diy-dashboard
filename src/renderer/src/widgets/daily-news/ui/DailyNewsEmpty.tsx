import { Loader2, AlertCircle, Newspaper } from "lucide-react";

type DailyNewsEmptyProps = {
  status: "idle" | "loading" | "error";
  errorMessage: string | null;
};

export function DailyNewsEmpty({ status, errorMessage }: DailyNewsEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
      {status === "loading" && (
        <>
          <Loader2 className="size-6 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Fetching news...</p>
        </>
      )}

      {status === "error" && (
        <>
          <AlertCircle className="size-6 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">
              Failed to load news
            </p>
            {errorMessage && (
              <p className="mt-1 text-xs text-muted-foreground">
                {errorMessage}
              </p>
            )}
          </div>
        </>
      )}

      {status === "idle" && (
        <>
          <Newspaper className="size-6 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No news yet</p>
        </>
      )}
    </div>
  );
}
