// @ts-check
import { View } from "gpui-kit";
import { run, window, nextCommand, exec, checking } from "herdr";
import { WINDOW_ICON_FONT, WINDOWS_11_BUILD } from "./consts.js";
import { activeSpace, isDragging, titleOf, zoom } from "./helpers.js";
import { fitScroll, layoutTabs, renderStripBody, trackSlotMovement, visibleTabs } from "./row.js";
import { cancelDrag, dropStaleDrag, openTabAtEnd, stopAutoScroll } from "./drag.js";
import { beginRename, cancelRename, isRenaming, tabExists } from "./rename.js";

export default class Tabs extends View {
  /** @type {string | null} */
  hoveredTabId = null;
  /** @type {{ id: string, offsetX: number, offsetY: number, pointerX: number, pointerY: number } | null} */
  grab = null;
  /** @type {import("./state.js").Drag | null} */
  drag = null;
  /** @type {import("./state.js").Rename | null} */
  rename = null;
  /** @type {Record<string, import("./state.js").MeasuredLabel>} */
  labelWidths = {};
  rowWidth = 0;
  scrollX = 0;
  animatingUntil = 0;
  /** @type {Record<string, number>} */
  slotX = {};
  /** @type {Record<string, number>} */
  lastSlotX = {};
  /** @type {string | null} */
  focusBack = null;
  /** @type {import("gpui-kit").FocusHandle | null} */
  focus = null;
  /** @type {import("./state.js").NewTabPlacement | null} */
  movingNewTab = null;
  watchingKeys = false;
  captionFont = WINDOW_ICON_FONT.fallback;

  /**
   * @param {unknown} _props
   * @param {import("gpui-kit").Context} cx
   */
  init(_props, cx) {
    this.focus = cx.focus_handle();
    this.watchingKeys = true;
    this.watchKeys(cx);
    this.pickCaptionFont(cx);
  }

  /**
   * @param {import("gpui-kit").Context} cx
   */
  pickCaptionFont(cx) {
    const win = window();
    if (win?.platform !== "windows" || win.titlebar !== "none" || checking()) {
      return;
    }
    cx.spawn(async (taskCx) => {
      try {
        const result = await exec("cmd", ["/c", "ver"], { timeout: 5000 });
        const build = Number((/\b10\.0\.(\d+)/.exec(result?.stdout ?? "") ?? [])[1] || 0);
        if (build >= WINDOWS_11_BUILD) {
          this.captionFont = WINDOW_ICON_FONT.win11;
          taskCx.notify();
        }
      } catch {}
    });
  }

  /** @param {import("gpui-kit").Context} _cx */
  async close(_cx) {
    this.watchingKeys = false;
    stopAutoScroll(this);
  }

  /** @param {import("gpui-kit").Context} cx */
  watchKeys(cx) {
    cx.spawn(async (taskCx) => {
      while (this.watchingKeys) {
        let command;
        try {
          command = await nextCommand();
        } catch {
          this.watchingKeys = false;
          return;
        }
        if (!this.watchingKeys) {
          return;
        }
        if (command.endsWith("newTab")) {
          openTabAtEnd(this, taskCx);
        }
      }
    });
  }

  /**
   * @param {import("gpui-kit").KeyEvent} event
   * @param {import("gpui-kit").Context} cx
   */
  onKey(event, cx) {
    if (event.key !== "escape") {
      return;
    }
    if (this.rename) {
      cancelRename(this, cx);
      cx.stop_propagation();
      return;
    }
    if (isDragging(this.drag)) {
      cancelDrag(this, cx);
      cx.stop_propagation();
    }
  }

  /** @param {import("herdr").TabInfo} tab */
  closeTab(tab) {
    run("tab.close", { id: tab.id, confirmed: true });
  }

  /**
   * @param {import("herdr").TabInfo} tab
   * @param {import("gpui-kit").MouseButtonEvent} event
   * @param {import("gpui-kit").Context} cx
   */
  onTabDown(tab, event, cx) {
    cx.stop_propagation();

    if (isRenaming(this, tab)) {
      return;
    }

    dropStaleDrag(this, cx);

    if (event.click_count === 2) {
      beginRename(this, tab, titleOf(tab), cx);
      return;
    }

    this.selectTab(tab);
    this.armDrag(tab, event);
    cx.notify();
  }

  /** @param {import("herdr").TabInfo} tab */
  selectTab(tab) {
    if (tab.active) {
      return;
    }
    run("tab.select", { id: tab.id });
  }

  /**
   * @param {import("herdr").TabInfo} tab
   * @param {import("gpui-kit").MouseButtonEvent} event
   */
  armDrag(tab, event) {
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
  }

  render() {
    const space = activeSpace();
    const win = window();

    this.forgetClosedRename();
    this.forgetBrokenDrag(space);

    const tabs = visibleTabs(this, space);
    const lay = layoutTabs(this, tabs);
    fitScroll(this, lay, tabs);
    trackSlotMovement(this, lay);

    return renderStripBody(this, win, lay);
  }

  forgetClosedRename() {
    const renameTabIsGone = this.rename && !tabExists(this, this.rename.tabId);
    if (renameTabIsGone) {
      this.rename = null;
    }
  }

  /** @param {import("herdr").SpaceInfo | undefined} space */
  forgetBrokenDrag(space) {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    const tabs = visibleTabs(this, space);
    const dragIsBroken =
      drag.spaceId !== (space?.id ?? null) || !tabs.some((tab) => tab.id === drag.id);
    if (dragIsBroken) {
      stopAutoScroll(this);
      this.drag = null;
      this.grab = null;
    }
  }
}
