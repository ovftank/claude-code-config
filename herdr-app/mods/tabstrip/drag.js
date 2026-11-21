// @ts-check
import { run } from "herdr";
import { MOVE_EPSILON_PX, NEW_TAB_POLL_MS, NEW_TAB_POLL_TRIES, DRAG_START_PX, REORDER_MS, SETTLE_FRAME_MS, SETTLE_CLEAR_MS, ANIMATION_MARGIN_MS, STANDARD_TAB_WIDTH, REORDER_THRESHOLD_DIPS, AUTOSCROLL_STEP_PX, AUTOSCROLL_MS } from "./consts.js";
import { zoom, clamp, activeSpace, tabsOf, focusedPane, isDragging, isSettling } from "./helpers.js";
import { slotIndexFor } from "./math.js";
import { contentTotal, targetLeft, visibleTabs, widthOf } from "./row.js";

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
export function openTabAtEnd(view, cx) {
  const space = activeSpace();
  const tabs = tabsOf(space);

  view.movingNewTab = {
    knownIds: new Set(tabs.map((tab) => tab.id)),
    activeId: tabs.find((tab) => tab.active)?.id ?? null,
    spaceId: space?.id ?? null,
  };

  run("tab.new");

  if (moveNewTabToEnd(view)) {
    view.movingNewTab = null;
    return;
  }

  cx.notify();
  waitForNewTab(view, cx, NEW_TAB_POLL_TRIES);
}

/**
 * @param {import("./main.js").default} view
 */
function moveNewTabToEnd(view) {
  const moving = view.movingNewTab;
  if (moving === null) {
    return true;
  }

  const space = activeSpace();
  if ((space?.id ?? null) !== moving.spaceId) {
    view.movingNewTab = null;
    return true;
  }

  const tabs = tabsOf(space);
  const newTab = tabs.find((tab) => !moving.knownIds.has(tab.id));
  if (!newTab) {
    return false;
  }
  run("tab.move", { id: newTab.id, index: tabs.length });
  return true;
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 * @param {number} triesLeft
 */
function waitForNewTab(view, cx, triesLeft) {
  if (moveNewTabToEnd(view) || triesLeft <= 0) {
    view.movingNewTab = null;
    cx.notify();
    return;
  }
  cx.timer.after(NEW_TAB_POLL_MS, (acx) => waitForNewTab(view, acx, triesLeft - 1));
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 * @param {boolean} hovered
 * @param {import("gpui-kit").Context} cx
 */
export function trackHover(view, tab, hovered, cx) {
  if (view.drag) {
    if (view.hoveredTabId !== null) {
      view.hoveredTabId = null;
      cx.notify();
    }
    return;
  }
  const next = hovered ? tab.id : view.hoveredTabId === tab.id ? null : view.hoveredTabId;
  if (next !== view.hoveredTabId) {
    view.hoveredTabId = next;
    cx.notify();
  }
}

/**
 * @param {import("./main.js").default} view
 * @param {{ id: string, offsetX: number, offsetY: number, pointerX: number, pointerY: number }} grab
 * @param {number} pointerX
 * @param {import("gpui-kit").Context} cx
 */
function startDrag(view, grab, pointerX, cx) {
  const space = activeSpace();
  const tabs = visibleTabs(view, space);
  const tab = tabs.find((item) => item.id === grab.id);
  view.grab = null;
  if (!tab) {
    return;
  }

  const width = widthOf(view, tab);
  view.focusBack = focusedPane()?.pane ?? null;
  view.hoveredTabId = null;
  view.drag = {
    id: tab.id,
    spaceId: space?.id ?? null,
    width,
    offsetX: grab.offsetX,
    pointerX,
    x: clamp(pointerX - grab.offsetX, 0, Math.max(0, view.rowWidth - width)),
    index: tabs.findIndex((item) => item.id === tab.id),
    order: tabs.map((item) => item.id),
    lastCommitX: null,
    phase: "drag",
    targetX: null,
    timer: null,
  };
  view.drag.timer = cx.timer.every(AUTOSCROLL_MS, (acx) => autoScroll(view, acx));
  view.focus?.focus();
  cx.notify();
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").MouseMoveEvent} event
 * @param {import("gpui-kit").Context} cx
 */
export function onPointerMove(view, event, cx) {
  const pointerX = (event.local_position?.x ?? 0) / zoom();
  const pointerY = (event.local_position?.y ?? 0) / zoom();

  if (!view.drag && view.grab) {
    const dx = pointerX - view.grab.pointerX;
    const dy = pointerY - view.grab.pointerY;
    if (Math.hypot(dx, dy) < DRAG_START_PX) {
      return;
    }
    startDrag(view, view.grab, pointerX, cx);
  }

  const d = view.drag;
  if (!isDragging(d)) {
    return;
  }

  d.pointerX = pointerX;
  const x = clamp(pointerX - d.offsetX, 0, Math.max(0, view.rowWidth - d.width));
  const moved = Math.abs(x - d.x) >= MOVE_EPSILON_PX;
  d.x = x;

  if (reindex(view, cx)) {
    return;
  }
  if (moved) {
    cx.notify();
  }
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
function reindex(view, cx) {
  const d = view.drag;
  if (!isDragging(d)) {
    return false;
  }

  const tabs = visibleTabs(view, activeSpace());
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const others = d.order.flatMap((id) => {
    if (id === d.id) {
      return [];
    }
    const tab = byId.get(id);
    return tab ? [tab] : [];
  });
  const ghostLeft = d.x + view.scrollX;
  const bestIndex = slotIndexFor(ghostLeft, others, (tab) => widthOf(view, tab));

  if (bestIndex === d.index) {
    return false;
  }
  if (!movedPastReorderThreshold(view, d)) {
    return false;
  }

  const otherIds = others.map((tab) => tab.id);
  d.index = bestIndex;
  d.order = [...otherIds.slice(0, bestIndex), d.id, ...otherIds.slice(bestIndex)];
  d.lastCommitX = d.pointerX;
  view.animatingUntil = Date.now() + REORDER_MS + ANIMATION_MARGIN_MS;
  cx.notify();
  return true;
}

/**
 * @param {import("./main.js").default} view
 * @param {import("./state.js").Drag} d
 */
function movedPastReorderThreshold(view, d) {
  const threshold = Math.max(
    1,
    Math.round((d.width / STANDARD_TAB_WIDTH) * REORDER_THRESHOLD_DIPS),
  );
  return d.lastCommitX === null || Math.abs(d.pointerX - d.lastCommitX) > threshold;
}

/**
 * @param {import("./main.js").default} view
 */
export function stopAutoScroll(view) {
  if (view.drag?.timer) {
    view.drag.timer.cancel();
    view.drag.timer = null;
  }
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
function autoScroll(view, cx) {
  const d = view.drag;
  if (!isDragging(d)) {
    stopAutoScroll(view);
    return;
  }
  if (view.rowWidth <= 0) {
    return;
  }

  const max = Math.max(0, contentTotal(view) - view.rowWidth);
  let step = 0;
  if (d.x <= 0 && view.scrollX > 0) {
    step = -AUTOSCROLL_STEP_PX;
  } else if (d.x + d.width >= view.rowWidth && view.scrollX < max) {
    step = AUTOSCROLL_STEP_PX;
  }
  if (step === 0) {
    return;
  }

  const before = view.scrollX;
  view.scrollX = clamp(view.scrollX + step, 0, max);
  if (view.scrollX === before) {
    return;
  }
  reindex(view, cx);
  cx.notify();
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").MouseButtonEvent} event
 * @param {import("gpui-kit").Context} cx
 */
export function onGhostDown(view, event, cx) {
  cx.stop_propagation();
  const d = view.drag;
  if (!isSettling(d)) {
    return;
  }

  const z = zoom();
  const localX = (event.local_position?.x ?? 0) / z;
  const localY = (event.local_position?.y ?? 0) / z;
  const hasTab = visibleTabs(view, activeSpace()).some((item) => item.id === d.id);

  view.drag = null;
  view.animatingUntil = 0;
  view.focusBack = focusedPane()?.pane ?? null;

  if (!hasTab) {
    cx.notify();
    return;
  }

  view.grab = {
    id: d.id,
    offsetX: localX,
    offsetY: localY,
    pointerX: d.x + localX,
    pointerY: localY,
  };
  view.hoveredTabId = d.id;
  cx.notify();
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
export function onPointerUp(view, cx) {
  view.grab = null;
  if (view.drag) {
    drop(view, cx);
  }
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
function drop(view, cx) {
  const d = view.drag;
  if (!isDragging(d)) {
    return;
  }
  stopAutoScroll(view);

  const tabs = visibleTabs(view, activeSpace());
  if (!tabs.some((tab) => tab.id === d.id)) {
    view.drag = null;
    restoreFocus(view, cx);
    cx.notify();
    return;
  }

  const original = tabs.map((tab) => tab.id);
  if (d.order.join("|") !== original.join("|")) {
    run("tab.move", { id: d.id, index: d.index + 1 });
  }

  settle(view, cx, targetLeft(view, tabs));
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
export function cancelDrag(view, cx) {
  const d = view.drag;
  if (!isDragging(d)) {
    view.grab = null;
    return;
  }
  stopAutoScroll(view);

  const tabs = visibleTabs(view, activeSpace());
  if (!tabs.some((tab) => tab.id === d.id)) {
    view.drag = null;
    view.focusBack = null;
    cx.notify();
    return;
  }

  d.order = tabs.map((tab) => tab.id);
  d.index = d.order.indexOf(d.id);
  settle(view, cx, targetLeft(view, tabs));
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 * @param {number} targetX
 */
function settle(view, cx, targetX) {
  const d = view.drag;
  if (!d || !Number.isFinite(targetX)) {
    view.drag = null;
    view.focusBack = null;
    cx.notify();
    return;
  }
  d.phase = "settle";
  d.targetX = targetX;
  view.animatingUntil = Date.now() + SETTLE_CLEAR_MS + ANIMATION_MARGIN_MS;
  view.hoveredTabId = null;

  cx.timer.after(SETTLE_FRAME_MS, (acx) => {
    if (view.drag !== d || !isSettling(d)) {
      return;
    }
    if (d.targetX === null) {
      return;
    }
    d.x = d.targetX;
    acx.notify();
  });

  cx.timer.after(SETTLE_CLEAR_MS, (acx) => {
    if (view.drag !== d) {
      return;
    }
    view.drag = null;
    restoreFocus(view, acx);
    acx.notify();
  });

  cx.notify();
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
function restoreFocus(view, cx) {
  const pane = view.focusBack;
  view.focusBack = null;
  if (!view.focus?.is_focused()) {
    return;
  }
  const target = pane ?? focusedPane()?.pane;
  if (target) {
    run("pane.focus", { pane: target });
  }
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
export function dropStaleDrag(view, cx) {
  view.grab = null;
  if (!view.drag) {
    return;
  }
  if (view.drag.phase === "drag") {
    cancelDrag(view, cx);
  } else {
    stopAutoScroll(view);
    view.drag = null;
    restoreFocus(view, cx);
    cx.notify();
  }
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").ScrollWheelEvent} event
 */
export function scrollTabs(view, event) {
  if (view.drag || Math.abs(event.delta.y) < 1) {
    return;
  }
  run(event.delta.y > 0 ? "tab.prev" : "tab.next");
}
