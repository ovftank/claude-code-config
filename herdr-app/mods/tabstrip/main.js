// @ts-nocheck
import { View, div, image, svg } from "gpui-kit";
import { h_flex, Input, InputState } from "gpui-base";
import { agents, panes, run, spaces, settings, theme, window, nextCommand } from "herdr";

const TAB_HEIGHT = 35;
const TAB_MIN_WIDTH = 120;
const TAB_PADDING_LEFT = 10;
const TAB_PADDING_RIGHT = 8;
const TAB_GAP = 8;
const TAB_FONT_SIZE = 13;
const TAB_LABEL_MAX_WIDTH = 170;
const TAB_TOP_LINE = 1.5;
const TAB_ICON_SIZE = 16;
const TAB_ACCENT_ALPHA = 0x80;

const CLOSE_SIZE = 20;
const CLOSE_RADIUS = 4;
const CLOSE_GLYPH_SIZE = 16;
const UNREAD_DOT_SIZE = 10;

const TAB_CHROME =
  TAB_PADDING_LEFT + TAB_ICON_SIZE + TAB_GAP + CLOSE_SIZE + TAB_PADDING_RIGHT;

const RENAME_LEFT = TAB_PADDING_LEFT + TAB_ICON_SIZE + TAB_GAP;
const RENAME_TOP = 7;
const RENAME_HEIGHT = 20;
const RENAME_MIN_WIDTH = 40;
const RENAME_MAX_WIDTH = 220;
const RENAME_WIDTH_PADDING = 8;
const RENAME_CARET_DELAY_MS = 60;
const LABEL_CHAR_WIDTH_ESTIMATE = 7.4;
const LABEL_MIN_ESTIMATE = 24;
const MOVE_EPSILON_PX = 0.5;
const MEASURE_OFFSCREEN_PX = -5000;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;
const SPINNER_FONT_SIZE = 20;

const NEW_TAB_POLL_MS = 40;
const NEW_TAB_POLL_TRIES = 25;

const MAC_TRAFFIC_LIGHTS_WIDTH = 76;
const MAC_MIN_TITLE_PADDING = 10;

const PANE_BUTTON_SIZE = 24;
const PANE_BUTTON_RADIUS = 4;
const PANE_BUTTON_ICON = 16;

const GEAR_SIZE = 22;
const GEAR_RADIUS = 6;
const GEAR_ICON = 16;

const WINDOW_BUTTON_WIDTH = 46;
const WINDOW_BUTTON_ICON = 16;

const DRAG_START_PX = 10;
const REORDER_MS = 200;
const SETTLE_MS = 200;
const SETTLE_FRAME_MS = 16;
const SETTLE_CLEAR_MS = SETTLE_FRAME_MS + SETTLE_MS + 60;
const ANIMATION_MARGIN_MS = 40;
const GHOST_INSET_PX = 2;
const GHOST_BORDER_ALPHA = 0x66;

const STANDARD_TAB_WIDTH = 232;
const REORDER_THRESHOLD_DIPS = 16;

const AUTOSCROLL_STEP_PX = 5;
const AUTOSCROLL_MS = 20;

const GLYPH = {
  terminal: 0xea85,
  close: 0xecee,
  minimize: 0xeaba,
  maximize: 0xeab9,
  restore: 0xeabb,
  closeWindow: 0xeab8,
  splitRight: 0xeb56,
  splitDown: 0xeb57,
  zoom: 0xeb4c,
  unzoom: 0xeb4d,
  closePane: 0xea76,
  settings: 0xeb51,
  agent: 0xec20,
};

function zoom() {
  const value = Number(settings().zoom);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function activeSpace() {
  return spaces().find((space) => space.active);
}

function tabsOf(space) {
  return space?.tabs ?? [];
}

function focusedPane() {
  return panes().find((pane) => pane.focused);
}

function programOf(tabId) {
  const tabPanes = panes().filter((pane) => pane.tab === tabId);
  const agentPane = tabPanes.find((pane) => pane.program?.agent);
  return (agentPane ?? tabPanes[0])?.program;
}

function titleOf(tab) {
  const autoNamed = /^tb\d+$/.test(tab.name);
  return autoNamed ? programOf(tab.id)?.name ?? "Terminal" : tab.name;
}

function isWorking(tab) {
  if (tab.status === "working") {
    return true;
  }
  return agents().some((agent) => agent.tab === tab.id && agent.status === "working");
}

function attentionOf(tab) {
  if (tab.status === "blocked" || tab.status === "done") {
    return tab.status;
  }
  return null;
}

function withAlpha(color, alpha) {
  const hex = String(color ?? "").trim();
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 9)) {
    return hex;
  }
  return `${hex.slice(0, 7)}${alpha.toString(16).padStart(2, "0")}`;
}

function codicon(codePoint, size, color) {
  return div()
    .flex_none()
    .font_family("codicon")
    .text_size(size)
    .text_color(color)
    .child(String.fromCodePoint(codePoint));
}

function programIcon(program, size, color) {
  if (program.tint) {
    return svg(program.icon).size(size).flex_none().text_color(color);
  }
  return image(program.icon).w(size).h(size).flex_none();
}

function workingSpinner() {
  const t = theme();

  return h_flex()
    .flex_none()
    .w(TAB_ICON_SIZE)
    .h(TAB_ICON_SIZE)
    .items_center()
    .justify_center()
    .text_size(SPINNER_FONT_SIZE)
    .text_color(t.working)
    .child(SPINNER_FRAMES[0])
    .frames(SPINNER_FRAMES, SPINNER_INTERVAL_MS);
}

function activeLine(t) {
  return div()
    .absolute()
    .left(0)
    .right(0)
    .top(0)
    .h(TAB_TOP_LINE)
    .bg(withAlpha(t.accent, TAB_ACCENT_ALPHA));
}

function attentionDot(color) {
  return div()
    .flex_none()
    .w(UNREAD_DOT_SIZE)
    .h(UNREAD_DOT_SIZE)
    .rounded(UNREAD_DOT_SIZE / 2)
    .bg(color);
}

function stopPropagation(_event, cx) {
  cx.stop_propagation();
}

function macWindowButtonsPadding() {
  const win = window();
  const macDrawsItsOwnButtons =
    win?.platform === "macos" && win.titlebar === "none" && !win.fullscreen;
  if (!macDrawsItsOwnButtons) {
    return 0;
  }
  return Math.max(MAC_MIN_TITLE_PADDING, MAC_TRAFFIC_LIGHTS_WIDTH / zoom());
}

export default class Tabs extends View {
  init(_props, cx) {
    this.hoveredTabId = null;
    this.grab = null;
    this.drag = null;
    this.rename = null;
    this.labelWidths = {};
    this.rowWidth = 0;
    this.scrollX = 0;
    this.animatingUntil = 0;
    this.slotX = {};
    this.lastSlotX = {};
    this.focusBack = null;
    this.focus = cx.focus_handle();
    this.movingNewTab = null;
    this.watchingKeys = true;
    this.watchKeys(cx);
  }

  watchKeys(cx) {
    nextCommand().then(
      (command) => {
        if (!this.watchingKeys) {
          return;
        }
        if (command.endsWith("newTab")) {
          this.openTabAtEnd(cx);
        }
        this.watchKeys(cx);
      },
      () => {
        this.watchingKeys = false;
      },
    );
  }

  async close() {
    this.watchingKeys = false;
    this.stopAutoScroll();
  }

  openTabAtEnd(cx) {
    const space = activeSpace();
    const tabs = tabsOf(space);

    this.movingNewTab = {
      knownIds: new Set(tabs.map((tab) => tab.id)),
      activeId: tabs.find((tab) => tab.active)?.id ?? null,
      spaceId: space?.id ?? null,
    };

    run("tab.new");

    if (this.moveNewTabToEnd()) {
      this.movingNewTab = null;
      return;
    }

    cx.notify();
    this.waitForNewTab(cx, NEW_TAB_POLL_TRIES);
  }

  moveNewTabToEnd() {
    const moving = this.movingNewTab;
    if (moving === null) {
      return false;
    }
    const tabs = tabsOf(activeSpace());
    const newTab = tabs.find((tab) => !moving.knownIds.has(tab.id));
    if (!newTab) {
      return false;
    }
    run("tab.move", { id: newTab.id, index: tabs.length });
    return true;
  }

  waitForNewTab(cx, triesLeft) {
    if (this.moveNewTabToEnd() || triesLeft <= 0) {
      this.movingNewTab = null;
      cx.notify();
      return;
    }
    cx.timer.after(NEW_TAB_POLL_MS, (acx) => this.waitForNewTab(acx, triesLeft - 1));
  }

  visibleTabs(space) {
    const tabs = tabsOf(space);
    if (this.movingNewTab === null || this.movingNewTab.spaceId !== space?.id) {
      return tabs;
    }
    return tabs.filter((tab) => this.movingNewTab.knownIds.has(tab.id));
  }

  isTabActive(tab) {
    if (tab.active) {
      return true;
    }
    return this.movingNewTab !== null && tab.id === this.movingNewTab.activeId;
  }

  isRenaming(tab) {
    return this.rename?.tabId === tab.id;
  }

  labelText(tab) {
    const title = titleOf(tab);
    return tab.zoomed ? `${title} Z` : title;
  }

  labelWidthOf(tab) {
    const text = this.labelText(tab);
    const measured = this.labelWidths[tab.id];
    if (measured && measured.text === text) {
      return measured.width;
    }
    return clamp(text.length * LABEL_CHAR_WIDTH_ESTIMATE, LABEL_MIN_ESTIMATE, TAB_LABEL_MAX_WIDTH);
  }

  widthOf(tab) {
    return clamp(
      TAB_MIN_WIDTH,
      TAB_CHROME + this.labelWidthOf(tab),
      TAB_CHROME + TAB_LABEL_MAX_WIDTH,
    );
  }

  measure(tab, text, width, cx) {
    const before = this.labelWidths[tab.id];
    if (before && before.text === text && Math.abs(before.width - width) < MOVE_EPSILON_PX) {
      return;
    }
    this.labelWidths[tab.id] = { text, width };
    cx.notify();
  }

  layout(tabs) {
    const byId = new Map(tabs.map((tab) => [tab.id, tab]));
    let ids = tabs.map((tab) => tab.id);
    const d = this.drag;

    for (const id of Object.keys(this.labelWidths)) {
      if (!byId.has(id)) {
        delete this.labelWidths[id];
      }
    }

    if (d) {
      const kept = d.order.filter((id) => byId.has(id));
      for (const id of ids) {
        if (!kept.includes(id)) {
          kept.push(id);
        }
      }
      d.order = kept;
      ids = kept;
      const dragged = byId.get(d.id);
      if (dragged) {
        d.width = this.widthOf(dragged);
        d.offsetX = Math.min(d.offsetX, d.width);
      }
    }

    const widths = {};
    const xs = {};
    let x = 0;
    for (const id of ids) {
      const width = this.widthOf(byId.get(id));
      widths[id] = width;
      xs[id] = x;
      x += width;
    }
    return { ids, byId, widths, xs, total: x };
  }

  contentTotal() {
    return this.visibleTabs(activeSpace()).reduce((sum, tab) => sum + this.widthOf(tab), 0);
  }

  targetLeft(tabs) {
    const d = this.drag;
    return this.layout(tabs).xs[d.id] - this.scrollX;
  }

  fitScroll(lay, tabs) {
    const max = Math.max(0, lay.total - this.rowWidth);
    this.scrollX = clamp(this.scrollX, 0, max);
    if (this.drag || this.rowWidth <= 0) {
      return;
    }
    const active = tabs.find((tab) => this.isTabActive(tab));
    if (!active) {
      return;
    }
    const left = lay.xs[active.id] - this.scrollX;
    const right = left + lay.widths[active.id];
    if (left < 0) {
      this.scrollX = clamp(this.scrollX + left, 0, max);
    } else if (right > this.rowWidth) {
      this.scrollX = clamp(this.scrollX + right - this.rowWidth, 0, max);
    }
  }

  beginRename(tab, title, cx) {
    const input = InputState.new({ value: title });
    this.rename = { tabId: tab.id, input };

    input.on("change", (_event, acx) => acx.notify());
    input.on("submit", (_event, acx) => this.commitRename(acx));
    input.on("blur", (_event, acx) => this.commitRename(acx));
    input.focus();

    cx.timer.after(RENAME_CARET_DELAY_MS, () => {
      const end = input.value().length;
      input.focus();
      input.set_selected_range({ start: end, end });
    });
    cx.notify();
  }

  commitRename(cx) {
    if (!this.rename) {
      return;
    }

    const { tabId, input } = this.rename;
    this.rename = null;

    const name = input.value().trim();
    if (name) {
      run("tab.rename", { id: tabId, name });
    }
    cx.notify();
  }

  closeTab(tab) {
    run("tab.close", { id: tab.id, confirmed: true });
  }

  onTabDown(tab, event, cx) {
    cx.stop_propagation();

    if (this.isRenaming(tab)) {
      return;
    }

    this.dropStaleDrag(cx);

    if (event.click_count === 2) {
      this.beginRename(tab, titleOf(tab), cx);
      return;
    }

    if (!tab.active) {
      run("tab.select", { id: tab.id });
    }

    const z = zoom();
    const offsetX = (event.local_position?.x ?? 0) / z;
    const offsetY = (event.local_position?.y ?? 0) / z;
    this.grab = {
      id: tab.id,
      offsetX,
      offsetY,
      pointerX: (this.slotX[tab.id] ?? 0) + offsetX,
      pointerY: offsetY,
    };
    this.hoveredTabId = tab.id;
    cx.notify();
  }

  onPointerMove(event, cx) {
    const pointerX = (event.local_position?.x ?? 0) / zoom();
    const pointerY = (event.local_position?.y ?? 0) / zoom();

    if (!this.drag && this.grab) {
      const dx = pointerX - this.grab.pointerX;
      const dy = pointerY - this.grab.pointerY;
      if (Math.hypot(dx, dy) < DRAG_START_PX) {
        return;
      }
      this.startDrag(this.grab, pointerX, cx);
    }

    const d = this.drag;
    if (!d || d.phase !== "drag") {
      return;
    }

    d.pointerX = pointerX;
    const x = clamp(pointerX - d.offsetX, 0, Math.max(0, this.rowWidth - d.width));
    const moved = Math.abs(x - d.x) >= MOVE_EPSILON_PX;
    d.x = x;

    if (this.reindex(cx)) {
      return;
    }
    if (moved) {
      cx.notify();
    }
  }

  startDrag(grab, pointerX, cx) {
    const space = activeSpace();
    const tabs = this.visibleTabs(space);
    const tab = tabs.find((item) => item.id === grab.id);
    this.grab = null;
    if (!tab) {
      return;
    }

    const width = this.widthOf(tab);
    this.focusBack = focusedPane()?.pane ?? null;
    this.hoveredTabId = null;
    this.drag = {
      id: tab.id,
      spaceId: space?.id ?? null,
      width,
      offsetX: grab.offsetX,
      pointerX,
      x: clamp(pointerX - grab.offsetX, 0, Math.max(0, this.rowWidth - width)),
      index: tabs.findIndex((item) => item.id === tab.id),
      order: tabs.map((item) => item.id),
      lastCommitX: null,
      phase: "drag",
      targetX: null,
      timer: null,
    };
    this.drag.timer = cx.timer.every(AUTOSCROLL_MS, (acx) => this.autoScroll(acx));
    this.focus.focus();
    cx.notify();
  }

  reindex(cx) {
    const d = this.drag;
    if (!d || d.phase !== "drag") {
      return false;
    }

    const tabs = this.visibleTabs(activeSpace());
    const byId = new Map(tabs.map((tab) => [tab.id, tab]));
    const others = d.order.filter((id) => id !== d.id && byId.has(id));
    const ghostLeft = d.x + this.scrollX;

    let bestIndex = 0;
    let bestDistance = Infinity;
    let x = 0;
    for (let index = 0; index <= others.length; index += 1) {
      if (index > 0) {
        x += this.widthOf(byId.get(others[index - 1]));
      }
      const distance = Math.abs(ghostLeft - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex === d.index) {
      return false;
    }

    const threshold = Math.max(
      1,
      Math.round((d.width / STANDARD_TAB_WIDTH) * REORDER_THRESHOLD_DIPS),
    );
    if (d.lastCommitX !== null && Math.abs(d.pointerX - d.lastCommitX) <= threshold) {
      return false;
    }

    d.index = bestIndex;
    d.order = [...others.slice(0, bestIndex), d.id, ...others.slice(bestIndex)];
    d.lastCommitX = d.pointerX;
    this.animatingUntil = Date.now() + REORDER_MS + ANIMATION_MARGIN_MS;
    cx.notify();
    return true;
  }

  stopAutoScroll() {
    if (this.drag?.timer) {
      this.drag.timer.cancel();
      this.drag.timer = null;
    }
  }

  autoScroll(cx) {
    const d = this.drag;
    if (!d || d.phase !== "drag") {
      this.stopAutoScroll();
      return;
    }
    if (this.rowWidth <= 0) {
      return;
    }

    const max = Math.max(0, this.contentTotal() - this.rowWidth);
    let step = 0;
    if (d.x <= 0 && this.scrollX > 0) {
      step = -AUTOSCROLL_STEP_PX;
    } else if (d.x + d.width >= this.rowWidth && this.scrollX < max) {
      step = AUTOSCROLL_STEP_PX;
    }
    if (step === 0) {
      return;
    }

    const before = this.scrollX;
    this.scrollX = clamp(this.scrollX + step, 0, max);
    if (this.scrollX === before) {
      return;
    }
    this.reindex(cx);
    cx.notify();
  }

  onGhostDown(event, cx) {
    cx.stop_propagation();
    const d = this.drag;
    if (!d || d.phase !== "settle") {
      return;
    }

    const z = zoom();
    const localX = (event.local_position?.x ?? 0) / z;
    const localY = (event.local_position?.y ?? 0) / z;
    const tab = this.visibleTabs(activeSpace()).find((item) => item.id === d.id);

    this.drag = null;
    this.animatingUntil = 0;
    this.focusBack = focusedPane()?.pane ?? null;

    if (!tab) {
      cx.notify();
      return;
    }

    this.grab = {
      id: d.id,
      offsetX: localX,
      offsetY: localY,
      pointerX: d.x + localX,
      pointerY: localY,
    };
    this.hoveredTabId = d.id;
    cx.notify();
  }

  onPointerUp(cx) {
    this.grab = null;
    if (this.drag) {
      this.drop(cx);
    }
  }

  drop(cx) {
    const d = this.drag;
    if (!d || d.phase !== "drag") {
      return;
    }
    this.stopAutoScroll();

    const tabs = this.visibleTabs(activeSpace());
    if (!tabs.some((tab) => tab.id === d.id)) {
      this.drag = null;
      this.restoreFocus(cx);
      cx.notify();
      return;
    }

    const original = tabs.map((tab) => tab.id);
    if (d.order.join("|") !== original.join("|")) {
      run("tab.move", { id: d.id, index: d.index + 1 });
    }

    this.settle(cx, this.targetLeft(tabs));
  }

  cancelDrag(cx) {
    const d = this.drag;
    if (!d || d.phase !== "drag") {
      this.grab = null;
      return;
    }
    this.stopAutoScroll();

    const tabs = this.visibleTabs(activeSpace());
    if (!tabs.some((tab) => tab.id === d.id)) {
      this.drag = null;
      this.focusBack = null;
      cx.notify();
      return;
    }

    d.order = tabs.map((tab) => tab.id);
    d.index = d.order.indexOf(d.id);
    this.settle(cx, this.targetLeft(tabs));
  }

  settle(cx, targetX) {
    const d = this.drag;
    if (!d || !Number.isFinite(targetX)) {
      this.drag = null;
      this.focusBack = null;
      cx.notify();
      return;
    }
    d.phase = "settle";
    d.targetX = targetX;
    this.animatingUntil = Date.now() + SETTLE_CLEAR_MS + ANIMATION_MARGIN_MS;
    this.hoveredTabId = null;

    cx.timer.after(SETTLE_FRAME_MS, (acx) => {
      if (this.drag !== d || d.phase !== "settle") {
        return;
      }
      d.x = d.targetX;
      acx.notify();
    });

    cx.timer.after(SETTLE_CLEAR_MS, (acx) => {
      if (this.drag !== d) {
        return;
      }
      this.drag = null;
      this.restoreFocus(acx);
      acx.notify();
    });

    cx.notify();
  }

  restoreFocus(cx) {
    const pane = this.focusBack;
    this.focusBack = null;
    if (!this.focus.is_focused()) {
      return;
    }
    const target = pane ?? focusedPane()?.pane;
    if (target) {
      run("pane.focus", { pane: target });
    }
  }

  dropStaleDrag(cx) {
    this.grab = null;
    if (!this.drag) {
      return;
    }
    if (this.drag.phase === "drag") {
      this.cancelDrag(cx);
    } else {
      this.stopAutoScroll();
      this.drag = null;
      this.restoreFocus(cx);
      cx.notify();
    }
  }

  onKey(event, cx) {
    if (event.key === "escape" && this.drag?.phase === "drag") {
      this.cancelDrag(cx);
      cx.stop_propagation();
    }
  }

  render() {
    const space = activeSpace();
    const win = window();

    if (this.drag) {
      const current = this.visibleTabs(space);
      if (
        this.drag.spaceId !== (space?.id ?? null) ||
        !current.some((tab) => tab.id === this.drag.id)
      ) {
        this.stopAutoScroll();
        this.drag = null;
        this.grab = null;
      }
    }

    const tabs = this.visibleTabs(space);
    const lay = this.layout(tabs);
    this.fitScroll(lay, tabs);

    this.slotX = {};
    let slid = false;
    for (const id of lay.ids) {
      const left = lay.xs[id] - this.scrollX;
      this.slotX[id] = left;
      const before = this.lastSlotX[id];
      if (before !== undefined && Math.abs(before - left) > MOVE_EPSILON_PX) {
        slid = true;
      }
    }
    this.lastSlotX = { ...this.slotX };
    if (slid && !this.drag) {
      this.animatingUntil = Math.max(
        this.animatingUntil,
        Date.now() + REORDER_MS + ANIMATION_MARGIN_MS,
      );
    }

    return h_flex()
      .id("tab-strip")
      .relative()
      .size_full()
      .min_w(0)
      .gap(0)
      .items_center()
      .pl(macWindowButtonsPadding())
      .bg(theme().canvas)
      .border_b(1)
      .border_color(theme().border)
      .track_focus(this.focus)
      .on_key_down((event, cx) => this.onKey(event, cx))
      .on_mouse_down_out((_event, cx) => this.dropStaleDrag(cx))
      .on_scroll_wheel((event) => this.scrollTabs(event))
      .child(this.renderTabRow(lay))
      .child(this.renderPaneActions())
      .child(this.renderSettingsGear())
      .when(Boolean(win?.buttons), (strip) => strip.child(this.renderWindowButtons(win)));
  }

  scrollTabs(event) {
    if (this.drag || Math.abs(event.delta.y) < 1) {
      return;
    }
    run(event.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  renderTabRow(lay) {
    const t = theme();
    const d = this.drag;
    const children = [];

    for (const id of lay.ids) {
      if (d && id === d.id) {
        continue;
      }
      const tab = lay.byId.get(id);
      if (tab) {
        children.push(this.renderTab(tab, lay, t));
      }
    }

    children.push(this.renderMeasurements(lay));

    if (d) {
      const tab = lay.byId.get(d.id);
      if (tab) {
        children.push(this.renderFloating(tab, t));
      }
    }

    return h_flex()
      .id("tab-row")
      .relative()
      .flex_1()
      .min_w(0)
      .h_full()
      .overflow_hidden()
      .on_size_change((size, cx) => {
        const width = size.width / zoom();
        if (Math.abs(width - this.rowWidth) > MOVE_EPSILON_PX) {
          this.rowWidth = width;
          cx.notify();
        }
      })
      .on_mouse_move((event, cx) => this.onPointerMove(event, cx))
      .on_mouse_up("left", (_event, cx) => this.onPointerUp(cx))
      .on_mouse_down("left", (event, cx) => {
        if (this.drag || Date.now() < this.animatingUntil) {
          cx.stop_propagation();
        }
        this.dropStaleDrag(cx);
      })
      .children(children);
  }

  renderMeasurements(lay) {
    const z = zoom();

    return h_flex()
      .id("tab-measure")
      .absolute()
      .left(MEASURE_OFFSCREEN_PX)
      .top(0)
      .h(0)
      .gap(0)
      .children(
        lay.ids.map((id) => {
          const tab = lay.byId.get(id);
          const text = this.labelText(tab);
          return div()
            .id(`tab-measure-${id}`)
            .text_size(TAB_FONT_SIZE)
            .max_w(TAB_LABEL_MAX_WIDTH)
            .truncate()
            .child(text)
            .on_size_change((size, cx) => this.measure(tab, text, size.width / z, cx));
        }),
      );
  }

  renderSettingsGear() {
    const t = theme();

    return h_flex()
      .h_full()
      .flex_none()
      .items_center()
      .px(2)
      .child(
        div()
          .id("settings-gear")
          .size(GEAR_SIZE)
          .flex()
          .items_center()
          .justify_center()
          .rounded(GEAR_RADIUS)
          .cursor_pointer()
          .text_color(t.muted)
          .hover((el) => el.bg(t.hover).text_color(t.foreground))
          .on_mouse_down("left", stopPropagation)
          .on_mouse_up("left", () => run("app.settings"))
          .child(codicon(GLYPH.settings, GEAR_ICON, t.muted)),
      );
  }

  renderTabIcon(tab, color) {
    if (isWorking(tab)) {
      return workingSpinner();
    }

    const program = programOf(tab.id);
    if (!program?.agent) {
      return codicon(GLYPH.terminal, TAB_ICON_SIZE, color);
    }
    if (program.icon) {
      return programIcon(program, TAB_ICON_SIZE, color);
    }
    return codicon(GLYPH.agent, TAB_ICON_SIZE, color);
  }

  renderTab(tab, lay, t) {
    const active = this.isTabActive(tab);
    const labelColor = active ? t.foreground : t.dim;
    const background = active ? t.surface : t.chrome;
    const x = (lay.xs[tab.id] ?? 0) - this.scrollX;
    const width = lay.widths[tab.id] ?? TAB_MIN_WIDTH;
    const hovering = this.hoveredTabId === tab.id && !this.drag;

    return h_flex()
      .id(`tab-${tab.id}`)
      .absolute()
      .left(x)
      .top(0)
      .w(width)
      .h(TAB_HEIGHT)
      .pl(TAB_PADDING_LEFT)
      .pr(TAB_PADDING_RIGHT)
      .gap(TAB_GAP)
      .items_center()
      .text_size(TAB_FONT_SIZE)
      .text_color(labelColor)
      .bg(background)
      .border_r(1)
      .border_color(t.canvas)
      .cursor_pointer()
      .transition("left", { duration: REORDER_MS, easing: "ease-in-out" })
      .when(active, (el) => el.child(activeLine(t)))
      .on_hover((isHovered, cx) => this.trackHover(tab, isHovered, cx))
      .on_mouse_down("left", (event, cx) => this.onTabDown(tab, event, cx))
      .child(this.renderTabIcon(tab, labelColor))
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .justify_between()
          .items_center()
          .child(this.renderTabLabel(tab))
          .child(this.renderTabAction(tab, labelColor, t, hovering)),
      )
      .when(this.isRenaming(tab), (el) => el.child(this.renderRenameInput(tab, background)));
  }

  renderFloating(tab, t) {
    const d = this.drag;
    const landing = d.phase === "settle";
    const active = this.isTabActive(tab);
    const color = active ? t.foreground : t.dim;

    return h_flex()
      .id("tab-ghost")
      .absolute()
      .left(d.x)
      .top(GHOST_INSET_PX)
      .w(d.width)
      .h(TAB_HEIGHT - GHOST_INSET_PX * 2)
      .rounded(5)
      .shadow_md()
      .bg(t.surface)
      .border_1()
      .border_color(withAlpha(t.accent, GHOST_BORDER_ALPHA))
      .pl(TAB_PADDING_LEFT)
      .pr(TAB_PADDING_RIGHT)
      .gap(TAB_GAP)
      .items_center()
      .text_size(TAB_FONT_SIZE)
      .text_color(color)
      .cursor_grabbing()
      .on_mouse_down("left", (event, cx) => this.onGhostDown(event, cx))
      .when(landing, (el) => el.transition("left", { duration: SETTLE_MS, easing: "ease-in-out" }))
      .child(activeLine(t))
      .child(this.renderTabIcon(tab, color))
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .justify_between()
          .items_center()
          .child(div().max_w(TAB_LABEL_MAX_WIDTH).truncate().child(this.labelText(tab)))
          .child(
            div()
              .flex_none()
              .w(CLOSE_SIZE)
              .h(CLOSE_SIZE)
              .flex()
              .items_center()
              .justify_center()
              .child(codicon(GLYPH.close, CLOSE_GLYPH_SIZE, color)),
          ),
      );
  }

  renderTabLabel(tab) {
    return div()
      .max_w(TAB_LABEL_MAX_WIDTH)
      .truncate()
      .opacity(this.isRenaming(tab) ? 0 : 1)
      .child(this.labelText(tab));
  }

  renderTabAction(tab, labelColor, t, hovering) {
    const attention = attentionOf(tab);
    const showsDot = attention !== null && !hovering;
    const visible = showsDot || tab.active || hovering;

    return div()
      .id(`tab-action-${tab.id}`)
      .flex_none()
      .w(CLOSE_SIZE)
      .h(CLOSE_SIZE)
      .rounded(CLOSE_RADIUS)
      .flex()
      .items_center()
      .justify_center()
      .cursor_pointer()
      .text_color(labelColor)
      .opacity(visible ? 1 : 0)
      .hover((el) => el.bg(t.hover).opacity(1))
      .on_mouse_down("left", stopPropagation)
      .on_mouse_up("left", (_event, cx) => {
        cx.stop_propagation();
        this.grab = null;
        if (this.drag) {
          this.onPointerUp(cx);
          return;
        }
        this.closeTab(tab);
      })
      .child(
        showsDot
          ? attentionDot(attention === "blocked" ? t.blocked : t.done)
          : codicon(GLYPH.close, CLOSE_GLYPH_SIZE, labelColor),
      );
  }

  renderRenameInput(tab, background) {
    const labelWidth = this.labelWidthOf(tab);
    const width = Math.min(
      RENAME_MAX_WIDTH,
      Math.max(RENAME_MIN_WIDTH, labelWidth + RENAME_WIDTH_PADDING),
    );

    return Input.new(this.rename.input)
      .absolute()
      .left(RENAME_LEFT)
      .top(RENAME_TOP)
      .w(width)
      .h(RENAME_HEIGHT)
      .px(0)
      .py(0)
      .text_size(TAB_FONT_SIZE)
      .bg(background)
      .text_color(theme().foreground);
  }

  renderPaneActions() {
    const pane = focusedPane();
    if (!pane) {
      return div();
    }

    const zoomGlyph = pane.zoomed ? GLYPH.unzoom : GLYPH.zoom;

    return h_flex()
      .h_full()
      .items_center()
      .gap(2)
      .px(4)
      .child(
        this.renderPaneButton(pane, "split-right", GLYPH.splitRight, "pane.split", {
          direction: "right",
          pane: pane.pane,
        }),
      )
      .child(
        this.renderPaneButton(pane, "split-down", GLYPH.splitDown, "pane.split", {
          direction: "down",
          pane: pane.pane,
        }),
      )
      .child(this.renderPaneButton(pane, "zoom", zoomGlyph, "pane.zoom", { pane: pane.pane }))
      .child(
        this.renderPaneButton(pane, "close-pane", GLYPH.closePane, "pane.close", {
          pane: pane.pane,
        }),
      );
  }

  renderPaneButton(pane, name, glyph, command, args) {
    const t = theme();

    return div()
      .id(`pane-action-${name}-${pane.pane}`)
      .size(PANE_BUTTON_SIZE)
      .flex()
      .items_center()
      .justify_center()
      .rounded(PANE_BUTTON_RADIUS)
      .cursor_pointer()
      .text_color(t.muted)
      .hover((el) => el.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stopPropagation)
      .on_mouse_up("left", () => run(command, args))
      .child(codicon(glyph, PANE_BUTTON_ICON, t.muted));
  }

  renderWindowButtons(win) {
    const maximizeGlyph = win.maximized ? GLYPH.restore : GLYPH.maximize;

    return h_flex()
      .h_full()
      .items_center()
      .gap(0)
      .child(this.renderWindowButton("minimize", GLYPH.minimize, () => run("window.minimize")))
      .child(this.renderWindowButton("maximize", maximizeGlyph, () => run("window.maximize")))
      .child(
        this.renderWindowButton("close-window", GLYPH.closeWindow, () => run("window.close"), true),
      );
  }

  renderWindowButton(id, glyph, action, isClose = false) {
    const t = theme();
    const hoverColor = isClose ? t.blocked : t.hover;

    return div()
      .id(id)
      .w(WINDOW_BUTTON_WIDTH)
      .h_full()
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .cursor_pointer()
      .text_color(t.foreground)
      .hover((el) => el.bg(hoverColor))
      .on_mouse_down("left", stopPropagation)
      .on_click(action)
      .child(codicon(glyph, WINDOW_BUTTON_ICON, t.foreground));
  }

  trackHover(tab, hovered, cx) {
    if (this.drag) {
      if (this.hoveredTabId !== null) {
        this.hoveredTabId = null;
        cx.notify();
      }
      return;
    }
    const next = hovered ? tab.id : this.hoveredTabId === tab.id ? null : this.hoveredTabId;
    if (next !== this.hoveredTabId) {
      this.hoveredTabId = next;
      cx.notify();
    }
  }
}
