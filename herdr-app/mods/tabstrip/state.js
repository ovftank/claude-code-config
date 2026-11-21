/** The theme's colors, as gpui's Color values. */
/**
 * @typedef {Record<string, import("gpui-kit").Color>} Palette
 */

/** A tab being dragged, from mouse down until it lands. */
/**
 * @typedef {object} Drag
 * @property {string} id
 * @property {string | null} spaceId
 * @property {number} width
 * @property {number} offsetX
 * @property {number} pointerX
 * @property {number} x
 * @property {number | null} targetX
 * @property {number} index
 * @property {string[]} order
 * @property {number | null} lastCommitX
 * @property {"drag" | "settle"} phase
 * @property {{ cancel: () => void } | null} timer
 */

/** A tab's name being typed in the strip. */
/**
 * @typedef {object} Rename
 * @property {string} tabId
 * @property {import("gpui-base").InputState} input
 */

/** A label width measured by the hidden measuring row. */
/**
 * @typedef {object} MeasuredLabel
 * @property {string} text
 * @property {number} width
 */

/** A tab waiting for its move to the end of the strip. */
/**
 * @typedef {object} NewTabPlacement
 * @property {Set<string>} knownIds
 * @property {string | null} activeId
 * @property {string | null} spaceId
 */

export {};
