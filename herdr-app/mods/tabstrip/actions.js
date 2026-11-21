// @ts-check
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run } from "herdr";
import { PANE_BUTTON_SIZE, PANE_BUTTON_RADIUS, PANE_BUTTON_ICON, GEAR_SIZE, GEAR_RADIUS, GEAR_ICON, WINDOW_BUTTON_WIDTH, WINDOW_BUTTON_GLYPH, WINDOW_GLYPH_CP, WINDOW_GLYPH, WINDOW_GLYPH_SOURCE, GLYPH } from "./consts.js";
import { focusedPane, codicon, stopPropagation, colors } from "./helpers.js";

/**
 * @param {import("./main.js").default} view
 */
export function renderSettingsGear(view) {
  const t = colors();

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

/**
 * @param {import("./main.js").default} view
 */
export function renderPaneActions(view) {
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
      renderPaneButton(view, pane, "split-right", GLYPH.splitRight, "pane.split", {
        direction: "right",
        pane: pane.pane,
      }),
    )
    .child(
      renderPaneButton(view, pane, "split-down", GLYPH.splitDown, "pane.split", {
        direction: "down",
        pane: pane.pane,
      }),
    )
    .child(renderPaneButton(view, pane, "zoom", zoomGlyph, "pane.zoom", { pane: pane.pane }))
    .child(
      renderPaneButton(view, pane, "close-pane", GLYPH.closePane, "pane.close", {
        pane: pane.pane,
      }),
    );
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").PaneInfo} pane
 * @param {string} name
 * @param {number} glyph
 * @param {string} command
 * @param {any} args
 */
function renderPaneButton(view, pane, name, glyph, command, args) {
  const t = colors();

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

/**
 * @param {import("./main.js").default} view
 * @param {{ platform: string, maximized: boolean, active?: boolean, buttons?: boolean }} win
 */
export function renderWindowButtons(view, win) {
  const t = colors();
  const restore = win.maximized;
  const glyph = restore ? "restore" : "maximize";
  const ink = win.active === false ? t.muted : t.foreground;

  return h_flex()
    .h_full()
    .items_center()
    .gap(0)
    .child(
      renderWindowButton("minimize", "minimize", ink, ink, t.hover, win, view, () =>
        run("window.minimize"),
      ),
    )
    .child(
      renderWindowButton("maximize", glyph, ink, ink, t.hover, win, view, () =>
        run("window.maximize"),
      ),
    )
    .child(
      renderWindowButton("close-window", "close", ink, "#ffffff", t.blocked, win, view, () =>
        run("window.close"),
      ),
    );
}

/**
 * @param {string} id
 * @param {keyof typeof WINDOW_GLYPH_CP} glyph
 * @param {import("gpui-kit").Color} ink
 * @param {import("gpui-kit").Color} hoverInk
 * @param {import("gpui-kit").Color} hoverColor
 * @param {{ platform: string }} win
 * @param {import("./main.js").default} view
 * @param {() => void} action
 */
function renderWindowButton(id, glyph, ink, hoverInk, hoverColor, win, view, action) {
  const icon =
    win.platform === "windows" && WINDOW_GLYPH_SOURCE === "font"
      ? // The system's own icon font, so Windows 10 and 11 each get their glyphs.
        div()
          .flex_none()
          .font_family(view.captionFont)
          .text_size(WINDOW_BUTTON_GLYPH)
          .text_color(ink)
          .child(String.fromCodePoint(WINDOW_GLYPH_CP[glyph]))
      : svg(WINDOW_GLYPH[glyph]).size(WINDOW_BUTTON_GLYPH).flex_none();

  return div()
    .id(id)
    .w(WINDOW_BUTTON_WIDTH)
    .h_full()
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .cursor_pointer()
    .text_color(ink)
    .hover((el) => el.bg(hoverColor).text_color(hoverInk))
    .on_mouse_down("left", stopPropagation)
    .on_click(action)
    .child(icon);
}
