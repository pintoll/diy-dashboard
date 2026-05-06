import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AttentionVerdict,
  ConfirmReviewInput,
  PendingReview,
} from "../model/pomodoro.types";
import { computeAttentionVerdict, isLeisureProcess } from "../model/leisure-rules";
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
  leisureProcesses: string[];
  onConfirm: (input: ConfirmReviewInput) => void;
  onMarkAsLeisure: (exeName: string) => void;
};

export function SessionReviewDialog({
  open,
  pending,
  leisureProcesses,
  onConfirm,
  onMarkAsLeisure,
}: Props) {
  // Keep showing the data through the close animation after `pending` flips to null.
  const lastPendingRef = useRef<PendingReview | null>(pending);
  if (pending !== null) lastPendingRef.current = pending;
  const snapshot = lastPendingRef.current;

  const detection = useMemo(() => {
    if (snapshot === null) return null;
    return computeAttentionVerdict({
      processBuckets: snapshot.processBuckets ?? {},
      idleSec: snapshot.idleSec,
      totalSec: snapshot.durationSec + snapshot.overtimeSec,
      leisureProcesses,
    });
  }, [snapshot, leisureProcesses]);

  const autoVerdict = detection?.verdict ?? "focus";

  const [attention, setAttention] = useState<AttentionVerdict>(autoVerdict);
  const [userOverrode, setUserOverrode] = useState(false);
  const [totalMin, setTotalMin] = useState("0");
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CONFIRM_SECONDS);

  useEffect(() => {
    if (!open || pending === null) return;
    const totalSec = pending.durationSec + pending.overtimeSec;
    setAttention(autoVerdict);
    setUserOverrode(false);
    setTotalMin(String(Math.round(totalSec / 60)));
    setSecondsLeft(AUTO_CONFIRM_SECONDS);
  }, [open, pending, autoVerdict]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [open]);

  const fire = useCallback(() => {
    if (snapshot === null) return;
    const editedMin = Number(totalMin);
    const editedSec =
      Number.isFinite(editedMin) && editedMin >= 0
        ? Math.round(editedMin * 60)
        : snapshot.durationSec + snapshot.overtimeSec;
    const overtimeSec = Math.max(0, editedSec - snapshot.durationSec);
    onConfirm({
      attention,
      attentionSource: userOverrode ? "user" : "auto",
      overtimeSec,
    });
  }, [snapshot, totalMin, attention, userOverrode, onConfirm]);

  // Auto-fire when countdown elapses. The store's confirmReview clears
  // pendingReview on first call, so duplicate calls during the close transition
  // are no-ops at the store level — no fired-flag is needed here.
  useEffect(() => {
    if (!open || secondsLeft > 0) return;
    fire();
  }, [open, secondsLeft, fire]);

  const resetCountdown = () => setSecondsLeft(AUTO_CONFIRM_SECONDS);

  const handleOpenChange = (next: boolean) => {
    if (!next) fire();
  };

  const handleAttentionChange = (next: AttentionVerdict) => {
    setAttention(next);
    if (next !== autoVerdict) setUserOverrode(true);
    else setUserOverrode(false);
    resetCountdown();
  };

  const handleTotalMinChange = (next: string) => {
    setTotalMin(next);
    resetCountdown();
  };

  const handleMarkAsLeisure = (exe: string) => {
    onMarkAsLeisure(exe);
    resetCountdown();
  };

  if (snapshot === null || detection === null) return null;

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
              {topBuckets.map(([exe, sec]) => {
                const flagged = isLeisureProcess(exe, leisureProcesses);
                return (
                  <div key={exe} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground truncate flex-1">{exe}</span>
                    <span className="tabular-nums">{formatTime(sec)}</span>
                    {!flagged && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={() => handleMarkAsLeisure(exe)}
                      >
                        Mark as leisure
                      </Button>
                    )}
                  </div>
                );
              })}
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
          {detection.reason !== null && (
            <p className="text-xs text-muted-foreground">{detection.reason}</p>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Auto-saving in {formatTime(secondsLeft)}
          </span>
          <Button onClick={fire}>Save now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
