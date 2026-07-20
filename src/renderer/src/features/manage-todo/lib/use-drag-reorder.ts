import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import {
  autoScrollSpeed,
  insertionIndex,
  measureGap,
  moveItem,
  rowOffset,
  type RowRect,
} from "./reorder-geometry";

// Pointer-driven reordering for a vertical list.
//
// Deliberately domain-agnostic: it takes ids and hands back a new order, and
// knows nothing about todos. It lives in this slice rather than `shared/`
// because there is exactly one consumer; promoting it is a file move plus a
// barrel edit once a second list wants it.
//
// The HTML5 drag API is avoided on purpose. It opens an OS drag session, whose
// ghost is drawn outside the page and whose dragover cadence is not
// frame-synced, which is what made the previous implementation feel laggy.

const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 48;
const MAX_SCROLL_PX = 12;

type Options = {
  // The rendered order. Callers must hold this steady for the duration of a
  // drag; `onDragStart` is the signal to freeze.
  ids: string[];
  onReorder: (ids: string[]) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
};

type Session = {
  phase: "pressed" | "dragging";
  pointerId: number;
  gripEl: HTMLElement;
  // The row that was pressed. `from` is re-derived from it at promotion, since
  // the list can still change between the press and the first movement.
  id: string;
  from: number;
  startClientY: number;
  lastClientY: number;

  // Measured at promotion to "dragging".
  rects: RowRect[];
  rowEls: HTMLElement[];
  unit: number;
  grabOffset: number;
  to: number;
  scroller: HTMLElement | null;
  rafId: number;
};

// The nearest ancestor that actually scrolls, or null when the window does.
// Stops at the document so the caller gets the window branch rather than an
// element whose box is the whole document.
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) break;
    const overflowY = getComputedStyle(node).overflowY;
    const scrollable =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    if (scrollable && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

export function useDragReorder(options: Options) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowMap = useRef(new Map<string, HTMLElement>());
  const rowRefs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const session = useRef<Session | null>(null);

  // Event handlers are created once and live on `window`, so they read props
  // through this rather than closing over a stale render.
  const latest = useRef(options);
  latest.current = options;

  const controller = useRef<ReturnType<typeof createController> | null>(null);
  controller.current ??= createController({ listRef, rowMap, session, latest });
  const { onGripPointerDown, cancelDrag } = controller.current;

  // A drag in flight owns window listeners and a rAF loop; unmounting mid-drag
  // must not leave either behind.
  useEffect(() => () => cancelDrag(), [cancelDrag]);

  function rowRef(id: string) {
    let callback = rowRefs.current.get(id);
    if (!callback) {
      // Block body on purpose: React 19 treats any return value from a ref
      // callback as a cleanup function.
      callback = (el: HTMLElement | null) => {
        if (el) {
          rowMap.current.set(id, el);
        } else {
          rowMap.current.delete(id);
          rowRefs.current.delete(id);
        }
      };
      rowRefs.current.set(id, callback);
    }
    return callback;
  }

  return { listRef, rowRef, onGripPointerDown };
}

type Ctx = {
  listRef: { current: HTMLDivElement | null };
  rowMap: { current: Map<string, HTMLElement> };
  session: { current: Session | null };
  latest: { current: Options };
};

function createController({ listRef, rowMap, session, latest }: Ctx) {
  function onGripPointerDown(event: ReactPointerEvent<HTMLElement>, index: number) {
    if (session.current) return;
    // Left button, first contact only.
    if (event.button !== 0 || !event.isPrimary) return;
    const pressedId = latest.current.ids[index];
    if (latest.current.ids.length < 2 || !pressedId) return;

    const gripEl = event.currentTarget;
    // Capture is a nicety, not the transport: it keeps events flowing when the
    // pointer leaves the window, but the drag is driven by the window
    // listeners below and works without it. It also throws if the id is not
    // active, which is exactly the case on the input stack this runs on.
    try {
      gripEl.setPointerCapture(event.pointerId);
    } catch {
      // Ignored on purpose; see above.
    }
    // Suppresses text selection, and with it the compatibility mousedown that
    // would normally focus the button -- so focus it back, or the keyboard
    // reorder path silently stops working.
    event.preventDefault();
    gripEl.focus();

    session.current = {
      phase: "pressed",
      pointerId: event.pointerId,
      gripEl,
      id: pressedId,
      from: index,
      startClientY: event.clientY,
      lastClientY: event.clientY,
      rects: [],
      rowEls: [],
      unit: 0,
      grabOffset: 0,
      to: index,
      scroller: null,
      rafId: 0,
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    // Capture phase, so an open Radix layer cannot swallow Escape first.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onCancel);
  }

  // Deliberately not filtered by pointerId. The press and the move stream do
  // not always share one: this app's input stack reports pointerdown/pointerup
  // as pointer 1 while delivering the moves under a different id, so matching
  // on it drops every move and the drag never starts. Only one session exists
  // at a time and a non-primary press is already rejected, so whichever pointer
  // is moving is the one dragging.
  function onMove(event: PointerEvent) {
    const drag = session.current;
    if (!drag) return;
    drag.lastClientY = event.clientY;
    if (drag.phase === "pressed") {
      if (Math.abs(event.clientY - drag.startClientY) < DRAG_THRESHOLD_PX) return;
      promote(drag);
    }
  }

  function promote(drag: Session) {
    const list = listRef.current;
    if (!list) return;

    const { ids, onDragStart } = latest.current;
    const from = ids.indexOf(drag.id);
    if (from === -1) return; // The pressed row is gone; write nothing.
    drag.from = from;

    const rowEls: HTMLElement[] = [];
    for (const id of ids) {
      const el = rowMap.current.get(id);
      if (!el) return; // DOM and props disagree; stay in "pressed" and write nothing.
      rowEls.push(el);
    }

    // Measure before freezing, so the geometry matches the DOM that the
    // snapshot is about to pin.
    const listTop = list.getBoundingClientRect().top;
    drag.rects = rowEls.map((el) => {
      const box = el.getBoundingClientRect();
      return { top: box.top - listTop, height: box.height };
    });
    drag.rowEls = rowEls;
    drag.unit = drag.rects[drag.from].height + measureGap(drag.rects);
    drag.grabOffset = drag.startClientY - (listTop + drag.rects[drag.from].top);
    drag.scroller = scrollParentOf(list);
    drag.to = drag.from;
    drag.phase = "dragging";

    // Everything applied to the dragged row must be layout-neutral: a size or
    // border change here would invalidate every rect measured above.
    const dragged = rowEls[drag.from];
    dragged.style.transition = "none";
    dragged.style.position = "relative";
    dragged.style.zIndex = "10";

    document.body.toggleAttribute("data-reordering", true);
    onDragStart(ids[drag.from]);
    drag.rafId = requestAnimationFrame(frame);
  }

  // Runs every frame while dragging, not just on pointermove, so auto-scroll
  // keeps going while the pointer is held still at an edge.
  function frame() {
    const drag = session.current;
    if (!drag || drag.phase !== "dragging") return;
    const list = listRef.current;
    if (!list) return;

    if (drag.scroller) autoScrollElement(drag.scroller, drag.lastClientY);
    else autoScrollWindow(drag.lastClientY);

    // The list wrapper is never transformed, so re-reading its position each
    // frame re-anchors the cached rects. That is what makes scrolling -- by
    // wheel, by auto-scroll, or because content above the list changed height
    // -- need no bookkeeping at all.
    const listTop = list.getBoundingClientRect().top;
    const origin = drag.rects[drag.from];
    const translate = drag.lastClientY - drag.grabOffset - (listTop + origin.top);
    const center = origin.top + translate + origin.height / 2;

    drag.rowEls[drag.from].style.transform = `translate3d(0, ${translate}px, 0)`;

    const to = insertionIndex(drag.rects, center);
    if (to !== drag.to) {
      drag.to = to;
      for (let index = 0; index < drag.rowEls.length; index++) {
        if (index === drag.from) continue;
        const offset = rowOffset(index, drag.from, to, drag.unit);
        drag.rowEls[index].style.transform =
          offset === 0 ? "" : `translate3d(0, ${offset}px, 0)`;
      }
    }

    drag.rafId = requestAnimationFrame(frame);
  }

  function onUp() {
    const drag = session.current;
    if (!drag) return;

    if (drag.phase === "pressed") {
      teardown(drag); // A plain click on the grip: nothing measured, nothing written.
      return;
    }

    cancelAnimationFrame(drag.rafId);
    const { ids, onReorder, onDragEnd } = latest.current;
    const moved = drag.to !== drag.from;

    // Inline transforms ride along with the DOM nodes when React reorders keyed
    // children, so the reorder and the style reset have to land in the same
    // task. flushSync makes "no intermediate paint" explicit instead of leaning
    // on the scheduler batching them.
    flushSync(() => {
      if (moved) onReorder(moveItem(ids, drag.from, drag.to));
      else onDragEnd();
    });
    clearRowStyles(drag);
    teardown(drag);
  }

  function onCancel() {
    cancelDrag();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !session.current) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag();
  }

  // Abandon the drag without writing: the rows snap back to the order they
  // started in, which is still the DOM order since it was never touched.
  function cancelDrag() {
    const drag = session.current;
    if (!drag) return;
    if (drag.phase === "dragging") {
      cancelAnimationFrame(drag.rafId);
      clearRowStyles(drag);
      latest.current.onDragEnd();
    }
    teardown(drag);
  }

  // Rows carry `transition-transform` for the slide-aside animation, which must
  // not run here: by now React has already reordered the DOM, so a row's stale
  // transform is measured from its *new* slot and animating it away would drift
  // in from somewhere wrong. Suppress the transition, clear, force the reflow
  // that commits it, then hand the transition back.
  function clearRowStyles(drag: Session) {
    for (const el of drag.rowEls) {
      el.style.transition = "none";
      el.style.transform = "";
      el.style.position = "";
      el.style.zIndex = "";
    }
    void drag.rowEls[0].offsetHeight;
    for (const el of drag.rowEls) el.style.transition = "";
  }

  function teardown(drag: Session) {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onCancel);
    if (drag.gripEl.hasPointerCapture(drag.pointerId)) {
      drag.gripEl.releasePointerCapture(drag.pointerId);
    }
    document.body.toggleAttribute("data-reordering", false);
    session.current = null;
  }

  return { onGripPointerDown, cancelDrag };
}

// Module scope so every session shares one implementation; both take the
// pointer position and scroll by at most a few pixels per frame.
function autoScrollElement(scroller: HTMLElement, pointerY: number) {
  const box = scroller.getBoundingClientRect();
  const speed = autoScrollSpeed(pointerY, box.top, box.bottom, EDGE_PX, MAX_SCROLL_PX);
  if (speed !== 0) scroller.scrollTop += speed;
}

function autoScrollWindow(pointerY: number) {
  const speed = autoScrollSpeed(pointerY, 0, window.innerHeight, EDGE_PX, MAX_SCROLL_PX);
  if (speed !== 0) window.scrollBy(0, speed);
}
