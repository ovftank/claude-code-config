// @ts-check
export const TAB_HEIGHT = 35;
export const TAB_MIN_WIDTH = 120;
export const TAB_PADDING_LEFT = 10;
export const TAB_PADDING_RIGHT = 8;
export const TAB_GAP = 8;
export const TAB_FONT_SIZE = 13;
export const TAB_LABEL_MAX_WIDTH = 170;
export const TAB_TOP_LINE = 1.5;
export const TAB_ICON_SIZE = 16;
export const TAB_ACCENT_ALPHA = 0x80;

export const CLOSE_SIZE = 20;
export const CLOSE_RADIUS = 4;
export const CLOSE_GLYPH_SIZE = 16;
export const UNREAD_DOT_SIZE = 10;


export const TAB_CHROME =
  TAB_PADDING_LEFT + TAB_ICON_SIZE + TAB_GAP + CLOSE_SIZE + TAB_PADDING_RIGHT;

export const RENAME_LEFT = TAB_PADDING_LEFT + TAB_ICON_SIZE + TAB_GAP;
export const RENAME_TOP = 7;
export const RENAME_HEIGHT = 20;
export const RENAME_MIN_WIDTH = 40;
export const RENAME_MAX_WIDTH = 220;
export const RENAME_WIDTH_PADDING = 8;
export const RENAME_CARET_DELAY_MS = 60;
export const LABEL_CHAR_WIDTH_ESTIMATE = 7.4;
export const LABEL_MIN_ESTIMATE = 24;
export const MOVE_EPSILON_PX = 0.5;
export const MEASURE_OFFSCREEN_PX = -5000;

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const SPINNER_INTERVAL_MS = 80;
export const SPINNER_FONT_SIZE = 20;

export const NEW_TAB_POLL_MS = 40;
export const NEW_TAB_POLL_TRIES = 25;

export const MAC_TRAFFIC_LIGHTS_WIDTH = 76;
export const MAC_MIN_TITLE_PADDING = 10;

export const PANE_BUTTON_SIZE = 24;
export const PANE_BUTTON_RADIUS = 4;
export const PANE_BUTTON_ICON = 16;

export const GEAR_SIZE = 22;
export const GEAR_RADIUS = 6;
export const GEAR_ICON = 16;

export const WINDOW_BUTTON_WIDTH = 46;
export const WINDOW_BUTTON_GLYPH = 10;
export const WINDOW_GLYPH_CP = {
  minimize: 0xe921,
  maximize: 0xe922,
  restore: 0xe923,
  close: 0xe8bb,
};
/** @type {Record<string, string>} */
export const WINDOW_ICON_FONT = {
  win11: "Segoe Fluent Icons",
  fallback: "Segoe MDL2 Assets",
};
export const WINDOWS_11_BUILD = 22000;
export const WINDOW_GLYPH_SOURCE = "font";
export const WINDOW_GLYPH = {
  minimize: "mods/tabstrip/icons/win-min.svg",
  maximize: "mods/tabstrip/icons/win-max.svg",
  restore: "mods/tabstrip/icons/win-restore.svg",
  close: "mods/tabstrip/icons/win-close.svg",
};

export const DRAG_START_PX = 10;
export const REORDER_MS = 200;
export const SETTLE_MS = 200;
export const SETTLE_FRAME_MS = 16;
export const SETTLE_CLEAR_MS = SETTLE_FRAME_MS + SETTLE_MS + 60;
export const ANIMATION_MARGIN_MS = 40;

export const STANDARD_TAB_WIDTH = 232;
export const REORDER_THRESHOLD_DIPS = 16;

export const AUTOSCROLL_STEP_PX = 5;
export const AUTOSCROLL_MS = 20;

export const GLYPH = {
  terminal: 0xea85,
  close: 0xecee,
  splitRight: 0xeb56,
  splitDown: 0xeb57,
  zoom: 0xeb4c,
  unzoom: 0xeb4d,
  closePane: 0xea76,
  settings: 0xeb51,
  agent: 0xec20,
};
