import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/src/shared/lib/utils";
import type {
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

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SessionReviewDialog({ open, pending, onConfirm }: Props) {
  // Keep a stable snapshot so the summary text doesn't disappear during close animation.
  const lastPendingRef = useRef<PendingReview | null>(pending);
  if (pending !== null) {
    lastPendingRef.current = pending;
  }
  const snapshot = lastPendingRef.current;

  const [attention, setAttention] = useState<AttentionVerdict>("focus");
  const [totalMin, setTotalMin] = useState<string>("0");
  const [userTouched, setUserTouched] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CONFIRM_SECONDS);

  // Refs so the auto-fire callback always reads latest values without resubscribing.
  const attentionRef = useRef(attention);
  const totalMinRef = useRef(totalMin);
  const userTouchedRef = useRef(userTouched);
  const onConfirmRef = useRef(onConfirm);
  const snapshotRef = useRef(snapshot);
  const firedRef = useRef(false);
  attentionRef.current = attention;
  totalMinRef.current = totalMin;
  userTouchedRef.current = userTouched;
  onConfirmRef.current = onConfirm;
  snapshotRef.current = snapshot;

  // Reset transient state every time the dialog (re)opens with fresh data.
  useEffect(() => {
    if (!open || pending === null) return;
    const totalSec = pending.durationSec + pending.overtimeSec;
    setAttention("focus");
    setTotalMin(String(Math.round(totalSec / 60)));
    setUserTouched(false);
    setSecondsLeft(AUTO_CONFIRM_SECONDS);
    firedRef.current = false;
  }, [open, pending]);

  // Countdown ticker — only runs while open.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [open]);

  const fireConfirm = () => {
    if (firedRef.current) return;
    const snap = snapshotRef.current;
    if (snap === null) return;
    firedRef.current = true;
    const touched = userTouchedRef.current;
    let overtimeSecOverride: number | undefined;
    if (touched) {
      const editedMin = Number(totalMinRef.current);
      if (Number.isFinite(editedMin) && editedMin >= 0) {
        const editedSec = Math.round(editedMin * 60);
        overtimeSecOverride = Math.max(0, editedSec - snap.durationSec);
      }
    }
    onConfirmRef.current({
      attention: attentionRef.current,
      attentionSource: touched ? "user" : "auto",
      overtimeSecOverride,
    });
  };

  // Fire when countdown elapses. fireConfirm reads refs, so it doesn't need to be in deps.
  useEffect(() => {
    if (!open) return;
    if (secondsLeft > 0) return;
    fireConfirm();
  }, [open, secondsLeft]);

  const handleOpenChange = (next: boolean) => {
    if (next) return;
    // Esc / outside-click / explicit close → confirm immediately.
    fireConfirm();
  };

  const resetCountdown = () => {
    setSecondsLeft(AUTO_CONFIRM_SECONDS);
  };

  const handleAttentionChange = (next: AttentionVerdict) => {
    setAttention(next);
    setUserTouched(true);
    resetCountdown();
  };

  const handleTotalMinChange = (next: string) => {
    setTotalMin(next);
    setUserTouched(true);
    resetCountdown();
  };

  if (snapshot === null) return null;

  const title = snapshot.cappedAt60m ? "Session capped at 60m" : "Session complete";
  const totalRecordedSec = snapshot.durationSec + snapshot.overtimeSec;

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
                  className={cn("flex-1")}
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
            Auto-saving in {formatCountdown(secondsLeft)}
          </span>
          <Button onClick={fireConfirm}>Save now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
