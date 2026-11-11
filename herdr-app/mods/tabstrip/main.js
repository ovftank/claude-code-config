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

const CLOSE_SIZE = 20;
const CLOSE_RADIUS = 4;
const CLOSE_GLYPH_SIZE = 16;
const UNREAD_DOT_SIZE = 10;

const RENAME_LEFT = TAB_PADDING_LEFT + TAB_ICON_SIZE + TAB_GAP;
const RENAME_TOP = 7;
const RENAME_HEIGHT = 20;
const RENAME_MIN_WIDTH = 40;
const RENAME_MAX_WIDTH = 220;
const RENAME_WIDTH_PADDING = 8;
const RENAME_CARET_DELAY_MS = 60;

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
  const herdrPickedTheName = /^tb\d+$/.test(tab.name);
  return herdrPickedTheName ? programOf(tab.id)?.name ?? "Terminal" : tab.name;
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
    .bg(withAlpha(t.accent, 0x80));
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
  const trafficLights = MAC_TRAFFIC_LIGHTS_WIDTH / settings().zoom;
  return Math.max(MAC_MIN_TITLE_PADDING, trafficLights);
}

export default class Tabs extends View {
  init(_props, cx) {
    this.hoveredTabId = null;
    this.pressedTabId = null;
    this.rename = null;
    this.labelWidths = {};
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
    cx.timer.after(NEW_TAB_POLL_MS, (cx) => this.waitForNewTab(cx, triesLeft - 1));
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

  beginRename(tab, title, cx) {
    const input = InputState.new({ value: title });
    this.rename = { tabId: tab.id, input };

    input.on("change", (_event, cx) => cx.notify());
    input.on("submit", (_event, cx) => this.commitRename(cx));
    input.on("blur", (_event, cx) => this.commitRename(cx));
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

  render() {
    const space = activeSpace();
    const tabs = this.visibleTabs(space);
    const win = window();

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
      .on_mouse_up("left", () => {
        this.pressedTabId = null;
      })
      .on_scroll_wheel((event) => this.scrollTabs(event))
      .child(this.renderTabRow(tabs, space))
      .child(this.renderPaneActions())
      .child(this.renderSettingsGear())
      .when(Boolean(win?.buttons), (strip) => strip.child(this.renderWindowButtons(win)));
  }

  scrollTabs(event) {
    if (Math.abs(event.delta.y) < 1) {
      return;
    }
    run(event.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  renderTabRow(tabs, space) {
    return h_flex()
      .id("tab-scroll")
      .flex_1()
      .min_w(0)
      .h_full()
      .items_center()
      .gap(0)
      .overflow_x_scrollbar()
      .children(tabs.map((tab) => this.renderTab(tab, space)));
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

  renderTab(tab, space) {
    const active = this.isTabActive(tab);
    const title = titleOf(tab);
    const t = theme();
    const labelColor = active ? t.foreground : t.dim;
    const background = active ? t.surface : t.chrome;

    return h_flex()
      .id(`tab-${tab.id}`)
      .relative()
      .h(TAB_HEIGHT)
      .min_w(TAB_MIN_WIDTH)
      .pl(TAB_PADDING_LEFT)
      .pr(TAB_PADDING_RIGHT)
      .gap(TAB_GAP)
      .items_center()
      .flex_none()
      .text_size(TAB_FONT_SIZE)
      .text_color(labelColor)
      .bg(background)
      .border_r(1)
      .border_color(t.canvas)
      .cursor_pointer()
      .when(active, (el) => el.child(activeLine(t)))
      .on_hover((hovered, cx) => this.trackHover(tab, hovered, cx))
      .on_mouse_down("left", (event, cx) => this.onTabMouseDown(tab, title, event, cx))
      .on_mouse_up("left", () => this.onTabMouseUp(tab, space))
      .child(this.renderTabIcon(tab, labelColor))
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .justify_between()
          .items_center()
          .child(this.renderTabLabel(tab, title))
          .child(this.renderTabAction(tab, labelColor, t)),
      )
      .when(this.isRenaming(tab), (el) => el.child(this.renderRenameInput(tab, background)));
  }

  renderTabLabel(tab, title) {
    const text = tab.zoomed ? `${title} Z` : title;

    return div()
      .max_w(TAB_LABEL_MAX_WIDTH)
      .truncate()
      .opacity(this.isRenaming(tab) ? 0 : 1)
      .on_size_change((size) => {
        const width = Math.round(size.width);
        if (!this.isRenaming(tab) && this.labelWidths[tab.id] !== width) {
          this.labelWidths[tab.id] = width;
        }
      })
      .child(text);
  }

  renderTabAction(tab, labelColor, t) {
    const hovering = this.hoveredTabId === tab.id;
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
      .on_mouse_up("left", (_event, cx) => {
        cx.stop_propagation();
        this.pressedTabId = null;
        this.closeTab(tab);
      })
      .child(
        showsDot
          ? attentionDot(attention === "blocked" ? t.blocked : t.done)
          : codicon(GLYPH.close, CLOSE_GLYPH_SIZE, labelColor),
      );
  }

  renderRenameInput(tab, background) {
    const labelWidth = this.labelWidths[tab.id] ?? 72;
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
      .child(this.renderPaneButton(pane, "close-pane", GLYPH.closePane, "pane.close", { pane: pane.pane }));
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
    let next = this.hoveredTabId;
    if (hovered) {
      next = tab.id;
    } else if (this.hoveredTabId === tab.id) {
      next = null;
    }
    if (next !== this.hoveredTabId) {
      this.hoveredTabId = next;
      cx.notify();
    }
  }

  onTabMouseDown(tab, title, event, cx) {
    if (this.isRenaming(tab)) {
      return;
    }

    cx.stop_propagation();

    if (event.click_count === 2) {
      this.beginRename(tab, title, cx);
      return;
    }
    this.pressedTabId = tab.id;
  }

  onTabMouseUp(tab, space) {
    if (this.isRenaming(tab)) {
      return;
    }

    const draggedId = this.pressedTabId;
    this.pressedTabId = null;

    const draggedOnto = draggedId !== null && draggedId !== tab.id;
    if (!draggedOnto) {
      run("tab.select", { id: tab.id });
      return;
    }

    const dropIndex = space.tabs.findIndex((item) => item.id === tab.id);
    run("tab.move", { id: draggedId, index: dropIndex + 1 });
  }
}
