import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, History, Redo2, Undo2 } from "lucide-react";
import { canRedo, canUndo } from "@shared/text-history";
import { Button } from "@/src/shared/ui/button";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";
import { registerFlushOnQuit } from "@/src/shared/lib/flush-on-quit";
import type { WidgetProps } from "@/src/shared/types";
import { useMemoStore } from "../model/use-memo-store";
import { MemoPanel } from "./MemoPanel";

export type MemoPadConfig = Record<string, never>;

// An input the user did as one act. Coalescing a paste into the surrounding
// typing would make one Ctrl+Z swallow both.
const ISOLATED_INPUT_TYPES = new Set([
  "insertFromPaste",
  "insertFromDrop",
  "deleteByCut",
  "deleteByDrag",
]);

// "Saved 2m ago" would otherwise sit frozen at whatever it said when the last
// keystroke landed.
const CLOCK_TICK_MS = 60_000;

export function MemoPadClient({
  instanceId,
  liveInstanceIds,
}: WidgetProps<MemoPadConfig>) {
  const store = useMemoStore(instanceId);
  const state = store();
  const {
    body,
    history,
    snapshots,
    orphans,
    updatedAt,
    status,
    error,
    caret,
    load,
    edit,
    undo,
    redo,
    endGroup,
    flush,
    saveSnapshot,
    restoreSnapshot,
    removeSnapshot,
    loadOrphans,
    adoptOrphan,
    discardOrphan,
    caretApplied,
  } = state;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Where the caret belongs in the current buffer. The native-undo fallback in
  // handleChange rewrites the DOM value, which drops the caret at the end unless
  // it is put back.
  const caretRef = useRef(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    void load();
  }, [load]);

  // Whatever is still being typed when the widget goes away has to reach disk.
  useEffect(() => endGroup, [endGroup]);

  // Closing the window only hides it to the tray, so that unmount never happens
  // on the way out of the app. Quitting asks for the same flush instead.
  useEffect(() => registerFlushOnQuit(flush), [flush]);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Chromium keeps its own undo stack for the textarea, and the app menu's
  // `editMenu` role puts Undo/Redo on the same keys. Neither may touch this
  // buffer: they know nothing of the persisted history, and a controlled value
  // they rewrite just snaps back on the next render. Cancelling `beforeinput`
  // stops the native edit before it lands.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const blockNativeHistory = (event: Event) => {
      const inputType = (event as InputEvent).inputType;
      if (inputType === "historyUndo" || inputType === "historyRedo") {
        event.preventDefault();
      }
    };
    textarea.addEventListener("beforeinput", blockNativeHistory);
    return () => textarea.removeEventListener("beforeinput", blockNativeHistory);
  }, []);

  // The body just changed under the user (undo, redo, restore), so the caret
  // has to be put back where the step says it belongs — a controlled textarea
  // would otherwise drop it at the end of the new value.
  useLayoutEffect(() => {
    if (caret === null) return;
    caretRef.current = caret;
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    }
    caretApplied();
  }, [caret, caretApplied]);

  if (status === "unavailable" || status === "error") {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {error}
      </p>
    );
  }

  const undoAvailable = canUndo(history);
  const redoAvailable = canRedo(history);

  // A memo the user has never typed into still has an `updatedAt` — the row is
  // stamped when it is created on first sight — so "Saved just now" over an
  // empty textarea is what a naive read of it would say. The buffer knows better.
  const untouched = body === "" && history.edits.length === 0;
  const savedLabel =
    status === "loading"
      ? "Opening..."
      : untouched || updatedAt === null
        ? "Empty"
        : `Saved ${formatTimeAgo(updatedAt)}`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;

    // preventDefault covers two things at once: Chromium's own textarea undo,
    // which fights a controlled value, and the app menu's `editMenu` role,
    // whose Undo/Redo accelerators only fire on keys the page left unhandled.
    event.preventDefault();
    if (key === "y" || event.shiftKey) redo();
    else undo();
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const inputType = (event.nativeEvent as InputEvent).inputType;
    if (inputType === "historyUndo" || inputType === "historyRedo") {
      // A native undo got through anyway (an uncancelled menu accelerator would
      // do it). The keydown handler has already run this widget's own undo, so
      // the buffer is right and only the DOM needs putting back — caret
      // included, since assigning `value` collapses the selection to the end.
      event.target.value = body;
      const at = Math.min(caretRef.current, body.length);
      event.target.setSelectionRange(at, at);
      return;
    }
    caretRef.current = event.target.selectionStart;
    edit(event.target.value, {
      isolate: inputType !== undefined && ISOLATED_INPUT_TYPES.has(inputType),
    });
  };

  const togglePanel = () => {
    setPanelOpen((open) => {
      // Which memos are orphaned depends on what is on the dashboard right now,
      // so the list is asked for on open rather than held.
      if (!open) void loadOrphans(liveInstanceIds);
      return !open;
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!undoAvailable}
          onClick={undo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!redoAvailable}
          onClick={redo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void saveSnapshot()}
          title="Save a snapshot of the memo as it is now"
          aria-label="Save snapshot"
        >
          <Camera />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className={cn(
            "text-[10px] text-muted-foreground",
            // `bg-muted` rather than the accent the ghost hover already uses,
            // so "panel is open" does not just read as "cursor is here".
            panelOpen && "bg-muted text-foreground"
          )}
          onClick={togglePanel}
          title="Snapshots and lost memos"
        >
          <History />
          {snapshots.length}
        </Button>

        {/* Narrow widget, so this truncates. `title` is what makes a long
            message (a save failure) readable at all. */}
        <span
          className={cn(
            "ml-auto truncate text-[10px]",
            error === null ? "text-muted-foreground" : "text-destructive"
          )}
          title={error ?? undefined}
        >
          {error ?? savedLabel}
        </span>
      </div>

      {/* The panel covers the editor, not the toolbar: the button that opened
          it has to stay put to close it again. */}
      <div className="relative min-h-0 flex-1">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={endGroup}
          disabled={status === "loading"}
          spellCheck={false}
          placeholder="Anything worth keeping."
          className="h-full w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-2 text-sm leading-relaxed outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
        />

        {panelOpen && (
          <MemoPanel
            snapshots={snapshots}
            orphans={orphans}
            canAdopt={untouched && snapshots.length === 0}
            onRestore={(snapshotId) => {
              restoreSnapshot(snapshotId);
              setPanelOpen(false);
            }}
            onDelete={(snapshotId) => void removeSnapshot(snapshotId)}
            onAdopt={(orphanId) => {
              void adoptOrphan(orphanId).then(() => setPanelOpen(false));
            }}
            onDiscard={(orphanId) => void discardOrphan(orphanId)}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
