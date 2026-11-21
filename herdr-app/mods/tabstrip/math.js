// @ts-check
import {
  LABEL_CHAR_WIDTH_ESTIMATE,
  LABEL_MIN_ESTIMATE,
  TAB_CHROME,
  TAB_LABEL_MAX_WIDTH,
  TAB_MIN_WIDTH,
} from "./consts.js";

/**
 * @typedef {object} Placement
 * @property {string[]} ids
 * @property {Map<string, import("herdr").TabInfo>} byId
 * @property {Record<string, number>} widths
 * @property {Record<string, number>} xs
 * @property {number} total
 */

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * @param {string} text
 * @returns {number}
 */
export function estimateLabelWidth(text) {
  return clamp(text.length * LABEL_CHAR_WIDTH_ESTIMATE, LABEL_MIN_ESTIMATE, TAB_LABEL_MAX_WIDTH);
}

/**
 * @param {number} labelWidth
 * @returns {number}
 */
export function tabWidth(labelWidth) {
  return clamp(TAB_MIN_WIDTH, TAB_CHROME + labelWidth, TAB_CHROME + TAB_LABEL_MAX_WIDTH);
}

/**
 * @param {string[]} ids
 * @param {Map<string, import("herdr").TabInfo>} byId
 * @param {(tab: import("herdr").TabInfo) => number} widthOf
 * @returns {Placement}
 */
export function placeTabs(ids, byId, widthOf) {
  /** @type {Record<string, number>} */
  const widths = {};
  /** @type {Record<string, number>} */
  const xs = {};
  const presentIds = ids.filter((id) => byId.has(id));
  let left = 0;
  for (const id of presentIds) {
    const tab = byId.get(id);
    if (!tab) {
      continue;
    }
    const width = widthOf(tab);
    widths[id] = width;
    xs[id] = left;
    left += width;
  }
  return { ids: presentIds, byId, widths, xs, total: left };
}

/**
 * The slot a dragged tab would land in, from the ghost's left edge.
 *
 * @param {number} ghostLeft
 * @param {import("herdr").TabInfo[]} tabs
 * @param {(tab: import("herdr").TabInfo) => number} widthOf
 * @returns {number}
 */
export function slotIndexFor(ghostLeft, tabs, widthOf) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  let left = 0;
  for (let index = 0; index <= tabs.length; index += 1) {
    if (index > 0) {
      left += widthOf(tabs[index - 1]);
    }
    const distance = Math.abs(ghostLeft - left);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}
