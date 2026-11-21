// @ts-check
import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, spaces, settings, theme, window } from "herdr";
import { TAB_TOP_LINE, TAB_ICON_SIZE, TAB_ACCENT_ALPHA, UNREAD_DOT_SIZE, SPINNER_FRAMES, SPINNER_INTERVAL_MS, SPINNER_FONT_SIZE, MAC_TRAFFIC_LIGHTS_WIDTH, MAC_MIN_TITLE_PADDING } from "./consts.js";

/**
 * The theme's colours, typed the way gpui takes them.
 * @returns {import("./state.js").Palette}
 */
export function colors() {
  return /** @type {import("./state.js").Palette} */ (/** @type {unknown} */ (theme()));
}

/**
 */
export function zoom() {
  const value = Number(settings().zoom);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export { clamp } from "./math.js";

/**
 * @param {import("./state.js").Drag | null} drag
 * @returns {drag is import("./state.js").Drag}
 */
export function isDragging(drag) {
  return drag?.phase === "drag";
}

/**
 * @param {import("./state.js").Drag | null} drag
 * @returns {drag is import("./state.js").Drag}
 */
export function isSettling(drag) {
  return drag?.phase === "settle";
}

/**
 */
export function activeSpace() {
  return spaces().find((space) => space.active);
}

/**
 * @param {import("herdr").SpaceInfo | undefined} space
 */
export function tabsOf(space) {
  return space?.tabs ?? [];
}

/**
 */
export function focusedPane() {
  return panes().find((pane) => pane.focused);
}

/**
 * @param {string} tabId
 */
export function programOf(tabId) {
  const tabPanes = panes().filter((pane) => pane.tab === tabId);
  const agentPane = tabPanes.find((pane) => pane.program?.agent);
  return (agentPane ?? tabPanes[0])?.program;
}

/**
 * @param {import("herdr").TabInfo} tab
 */
export function titleOf(tab) {
  return tab.named ? tab.name : programOf(tab.id)?.name ?? tab.name;
}

/**
 * @param {import("herdr").TabInfo} tab
 */
export function isWorking(tab) {
  return tab.status === "working";
}

/**
 * @param {import("herdr").TabInfo} tab
 */
export function attentionOf(tab) {
  if (tab.status === "blocked" || tab.status === "done") {
    return tab.status;
  }
  return null;
}

/**
 * The same colour with an alpha byte, or the colour unchanged when it is not a
 * plain hex value.
 * @param {import("gpui-kit").Color} color
 * @param {number} alpha
 * @returns {import("gpui-kit").Color}
 */
function withAlpha(color, alpha) {
  const hex = String(color ?? "").trim();
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 9)) {
    return /** @type {import("gpui-kit").Color} */ (hex);
  }
  return /** @type {import("gpui-kit").Color} */ (`${hex.slice(0, 7)}${alpha.toString(16).padStart(2, "0")}`);
}

/**
 * @param {number} codePoint
 * @param {number} size
 * @param {import("gpui-kit").Color} color
 */
export function codicon(codePoint, size, color) {
  return div()
    .flex_none()
    .font_family("codicon")
    .text_size(size)
    .text_color(color)
    .child(String.fromCodePoint(codePoint));
}

/**
 * @param {import("herdr").Program} program
 * @param {number} size
 * @param {import("gpui-kit").Color} color
 */
export function programIcon(program, size, color) {
  const icon = program.icon;
  if (!icon) {
    return div();
  }
  if (program.tint) {
    return svg(icon).size(size).flex_none().text_color(color);
  }
  return image(icon).w(size).h(size).flex_none();
}

/**
 */
export function workingSpinner() {
  const t = colors();

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

/**
 * @param {import("./state.js").Palette} t
 */
export function activeLine(t) {
  return div()
    .absolute()
    .left(0)
    .right(0)
    .top(0)
    .h(TAB_TOP_LINE)
    .bg(withAlpha(t.accent, TAB_ACCENT_ALPHA));
}

/**
 * @param {import("gpui-kit").Color} color
 */
export function attentionDot(color) {
  return div()
    .flex_none()
    .w(UNREAD_DOT_SIZE)
    .h(UNREAD_DOT_SIZE)
    .rounded(UNREAD_DOT_SIZE / 2)
    .bg(color);
}

/**
 * @param {import("gpui-kit").MouseButtonEvent} _event
 * @param {import("gpui-kit").Context} cx
 */
export function stopPropagation(_event, cx) {
  cx.stop_propagation();
}

/**
 */
export function macWindowButtonsPadding() {
  const win = window();
  const macDrawsItsOwnButtons =
    win?.platform === "macos" && win.titlebar === "none" && !win.fullscreen;
  if (!macDrawsItsOwnButtons) {
    return 0;
  }
  return Math.max(MAC_MIN_TITLE_PADDING, MAC_TRAFFIC_LIGHTS_WIDTH / zoom());
}
