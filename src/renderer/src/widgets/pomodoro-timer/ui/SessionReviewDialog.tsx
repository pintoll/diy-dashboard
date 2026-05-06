import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import type {
  AttentionSource,
  AttentionVerdict,
  ConfirmReviewInput,
  PendingReview,
} from "../model/pomodoro.types";
import { formatTime } from "../lib/format";

const AUTO_CONFIRM_SECONDS = 60;

const ATTENTION_OPTIONS: { value: AttentionVerdict; label: string }[] = [
  { value: "focus", label: "Focus" },
  { value: "leisure", label: "Leisure" },
  { value: "mixed", label: "Mixed" },
];

type Props = {
  open: boolean;
  pending: PendingReview | null;
  onConfirm: (input: ConfirmReviewInput) => void;
};

export function SessionReviewDialog({ open, pending, onConfirm }: Props) {
  // Keep showing the data through the close animation after `pending` flips to null.
  const lastPendingRef = useRef<PendingReview | null>(pending);
  if (pending !== null) lastPendingRef.current = pending;
  const snapshot = lastPendingRef.current;

  const [attention, setAttention] = useState<AttentionVerdict>("focus");
  const [totalMin, setTotalMin] = useState("0");
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CONFIRM_SECONDS);

  useEffect(() => {
    if (!open || pending === null) return;
    const totalSec = pending.durationSec + pending.overtimeSec;
    setAttention("focus");
    setTotalMin(String(Math.round(totalSec / 60)));
    setSecondsLeft(AUTO_CONFIRM_SECONDS);
  }, [open, pending]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [open]);

  const fire = useCallback(
    (source: AttentionSource) => {
      if (snapshot === null) return;
      const editedMin = Number(totalMin);
      const editedSec =
        Number.isFinite(editedMin) && editedMin >= 0
          ? Math.round(editedMin * 60)
          : snapshot.durationSec + snapshot.overtimeSec;
      const overtimeSec = Math.max(0, editedSec - snapshot.durationSec);
      onConfirm({ attention, attentionSource: source, overtimeSec });
    },
    [snapshot, totalMin, attention, onConfirm],
  );

  // Auto-fire when countdown elapses. The store's confirmReview clears
  // pendingReview on first call, so duplicate calls during the close transition
  // are no-ops at the store level — no fired-flag is needed here.
  useEffect(() => {
    if (!open || secondsLeft > 0) return;
    fire("auto");
  }, [open, secondsLeft, fire]);

  const resetCountdown = () => setSecondsLeft(AUTO_CONFIRM_SECONDS);

  const handleOpenChange = (next: boolean) => {
    if (!next) fire("user");
  };

  const handleAttentionChange = (next: AttentionVerdict) => {
    setAttention(next);
    resetCountdown();
  };

  const handleTotalMinChange = (next: string) => {
    setTotalMin(next);
    resetCountdown();
  };

  if (snapshot === null) return null;

  const title = snapshot.cappedAt60m ? "Session capped at 60m" : "Session complete";
  const totalRecordedSec = snapshot.durationSec + snapshot.overtimeSec;
  const topBuckets = Object.entries(snapshot.processBuckets ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        onPointerDownCapture={resetCountdown}
        onKeyDownCapture={resetCountdown}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Review and save. Auto-saving when the countdown reaches zero.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Phase duration</span>
          <span className="text-right tabular-nums">{formatTime(snapshot.durationSec)}</span>

          <span className="text-muted-foreground">Overtime</span>
          <span className="text-right tabular-nums">{formatTime(snapshot.overtimeSec)}</span>

          <span className="text-muted-foreground">Idle trimmed</span>
          <span className="text-right tabular-nums">{formatTime(snapshot.idleSec)}</span>

          <span className="text-muted-foreground">Total recorded</span>
          <span className="text-right tabular-nums font-medium">{formatTime(totalRecordedSec)}</span>
        </div>

        {topBuckets.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <Label>Window breakdown</Label>
            <div className="flex flex-col gap-0.5">
              {topBuckets.map(([exe, sec]) => (
                <div key={exe} className="flex justify-between">
                  <span className="text-muted-foreground truncate">{exe}</span>
                  <span className="tabular-nums">{formatTime(sec)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="session-review-total-min">Total recorded (min)</Label>
          <Input
            id="session-review-total-min"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={totalMin}
            onChange={(e) => handleTotalMinChange(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Attention</Label>
          <div role="radiogroup" className="flex gap-2">
            {ATTENTION_OPTIONS.map((opt) => {
              const selected = attention === opt.value;
              return (
                <Button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => handleAttentionChange(opt.value)}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Auto-saving in {formatTime(secondsLeft)}
          </span>
          <Button onClick={() => fire("user")}>Save now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
