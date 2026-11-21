// @ts-check
import { Input, InputState } from "gpui-base";
import { div } from "gpui-kit";
import { run, spaces } from "herdr";
import { TAB_FONT_SIZE, TAB_PADDING_RIGHT, CLOSE_SIZE, RENAME_LEFT, RENAME_TOP, RENAME_HEIGHT, RENAME_MIN_WIDTH, RENAME_MAX_WIDTH, RENAME_WIDTH_PADDING, RENAME_CARET_DELAY_MS } from "./consts.js";
import { tabsOf, colors } from "./helpers.js";
import { labelWidthOf, widthOf } from "./row.js";

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 */
export function isRenaming(view, tab) {
  return view.rename?.tabId === tab.id;
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 * @param {string} title
 * @param {import("gpui-kit").Context} cx
 */
export function beginRename(view, tab, title, cx) {
  const input = InputState.new({ value: title });
  const rename = { tabId: tab.id, input };
  view.rename = rename;

  input.on("change", (_event, acx) => acx.notify());
  input.on("submit", (_event, acx) => commitRename(view, acx, rename));
  input.on("blur", (_event, acx) =>
    acx.timer.after(0, (timerCx) => commitRename(view, timerCx, rename)),
  );
  input.focus();

  cx.timer.after(RENAME_CARET_DELAY_MS, () => {
    if (view.rename !== rename) {
      return;
    }
    const end = input.value().length;
    input.focus();
    input.set_selected_range({ start: end, end });
  });
  cx.notify();
}

/**
 * @param {import("./main.js").default} view
 * @param {string} tabId
 */
export function tabExists(view, tabId) {
  return spaces().some((space) => tabsOf(space).some((tab) => tab.id === tabId));
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 * @param {import("./state.js").Rename} expectedRename
 */
function commitRename(view, cx, expectedRename) {
  if (view.rename !== expectedRename) {
    return;
  }

  const rename = expectedRename;
  view.rename = null;
  if (!tabExists(view, rename.tabId)) {
    cx.notify();
    return;
  }

  const name = rename.input.value().trim();
  if (name) {
    run("tab.rename", { id: rename.tabId, name });
  }
  cx.notify();
}

/**
 * @param {import("./main.js").default} view
 * @param {import("gpui-kit").Context} cx
 */
export function cancelRename(view, cx) {
  const rename = view.rename;
  view.rename = null;
  try {
    rename?.input.release();
  } catch {
  }
  cx.notify();
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 * @param {import("gpui-kit").Color} background
 */
export function renderRenameInput(view, tab, background) {
  const rename = view.rename;
  if (!rename || rename.tabId !== tab.id) {
    return div();
  }

  const labelWidth = labelWidthOf(view, tab);
  const availableWidth = widthOf(view, tab) - RENAME_LEFT - TAB_PADDING_RIGHT - CLOSE_SIZE;
  const desiredWidth = Math.max(RENAME_MIN_WIDTH, labelWidth + RENAME_WIDTH_PADDING);
  const width = Math.min(RENAME_MAX_WIDTH, desiredWidth, availableWidth);

  return Input.new(rename.input)
    .absolute()
    .left(RENAME_LEFT)
    .top(RENAME_TOP)
    .w(width)
    .h(RENAME_HEIGHT)
    .px(0)
    .py(0)
    .text_size(TAB_FONT_SIZE)
    .bg(background)
    .text_color(colors().foreground);
}
