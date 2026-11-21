// @ts-check
import { div } from 'gpui-kit';
import { h_flex } from 'gpui-base';
import {
    TAB_HEIGHT,
    TAB_MIN_WIDTH,
    TAB_PADDING_LEFT,
    TAB_PADDING_RIGHT,
    TAB_GAP,
    TAB_FONT_SIZE,
    TAB_LABEL_MAX_WIDTH,
    TAB_ICON_SIZE,
    CLOSE_SIZE,
    CLOSE_RADIUS,
    CLOSE_GLYPH_SIZE,
    MOVE_EPSILON_PX,
    MEASURE_OFFSCREEN_PX,
    REORDER_MS,
    SETTLE_MS,
    ANIMATION_MARGIN_MS,
    GLYPH,
} from './consts.js';
import {
    zoom,
    clamp,
    activeSpace,
    tabsOf,
    programOf,
    titleOf,
    isWorking,
    attentionOf,
    codicon,
    programIcon,
    workingSpinner,
    activeLine,
    attentionDot,
    macWindowButtonsPadding,
    stopPropagation,
    colors,
} from './helpers.js';
import { estimateLabelWidth, placeTabs, tabWidth } from './math.js';
import {
    dropStaleDrag,
    onGhostDown,
    onPointerMove,
    onPointerUp,
    scrollTabs,
    trackHover,
} from './drag.js';
import { renderPaneActions, renderSettingsGear, renderWindowButtons } from './actions.js';
import { isRenaming, renderRenameInput } from './rename.js';

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").SpaceInfo | undefined} space
 */
export function visibleTabs(view, space) {
    const tabs = tabsOf(space);
    const movingNewTab = view.movingNewTab;
    if (movingNewTab === null || movingNewTab.spaceId !== space?.id) {
        return tabs;
    }
    return tabs.filter((tab) => movingNewTab.knownIds.has(tab.id));
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 */
function isTabActive(view, tab) {
    if (tab.active) {
        return true;
    }
    return view.movingNewTab !== null && tab.id === view.movingNewTab.activeId;
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 */
function labelText(view, tab) {
    const title = titleOf(tab);
    return tab.zoomed ? `${title} Z` : title;
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 */
export function labelWidthOf(view, tab) {
    const text = labelText(view, tab);
    const measured = view.labelWidths[tab.id];
    const isMeasured = measured && measured.text === text;
    return isMeasured ? measured.width : estimateLabelWidth(text);
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 */
export function widthOf(view, tab) {
    return tabWidth(labelWidthOf(view, tab));
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 * @param {string} text
 * @param {number} width
 * @param {import("gpui-kit").Context} cx
 */
function measure(view, tab, text, width, cx) {
    const before = view.labelWidths[tab.id];
    if (before?.text === text && Math.abs(before.width - width) < MOVE_EPSILON_PX) {
        return;
    }
    view.labelWidths[tab.id] = { text, width };
    cx.notify();
}

/**
 * @param {import("./main.js").default} view
 * @param {Map<string, import("herdr").TabInfo>} byId
 */
export function forgetUnseenLabels(view, byId) {
    for (const id of Object.keys(view.labelWidths)) {
        if (!byId.has(id)) {
            delete view.labelWidths[id];
        }
    }
}

/**
 * @param {import("./main.js").default} view
 * @param {string[]} ids
 * @param {Map<string, import("herdr").TabInfo>} byId
 */
function orderForLayout(view, ids, byId) {
    const d = view.drag;
    if (!d) {
        return ids;
    }
    const kept = d.order.filter((id) => byId.has(id));
    for (const id of ids) {
        if (!kept.includes(id)) {
            kept.push(id);
        }
    }
    d.order = kept;
    const dragged = byId.get(d.id);
    if (dragged) {
        d.width = widthOf(view, dragged);
        d.offsetX = Math.min(d.offsetX, d.width);
    }
    return kept;
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo[]} tabs
 */
export function layoutTabs(view, tabs) {
    const byId = new Map(tabs.map((tab) => [tab.id, tab]));
    forgetUnseenLabels(view, byId);
    const orderedIds = orderForLayout(
        view,
        tabs.map((tab) => tab.id),
        byId,
    );
    return placeTabs(orderedIds, byId, (tab) => widthOf(view, tab));
}

/**
 * @param {import("./main.js").default} view
 */
export function contentTotal(view) {
    return visibleTabs(view, activeSpace()).reduce((sum, tab) => sum + widthOf(view, tab), 0);
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo[]} tabs
 */
export function targetLeft(view, tabs) {
    const d = view.drag;
    if (!d) {
        return 0;
    }
    const left = layoutTabs(view, tabs).xs[d.id];
    return left === undefined ? 0 : left - view.scrollX;
}

/**
 * @param {import("./main.js").default} view
 * @param {import("./math.js").Placement} lay
 * @param {import("herdr").TabInfo[]} tabs
 */
export function fitScroll(view, lay, tabs) {
    const max = Math.max(0, lay.total - view.rowWidth);
    view.scrollX = clamp(view.scrollX, 0, max);
    if (view.drag || view.rowWidth <= 0) {
        return;
    }
    const active = tabs.find((tab) => isTabActive(view, tab));
    if (!active) {
        return;
    }
    const left = lay.xs[active.id] - view.scrollX;
    const right = left + lay.widths[active.id];
    if (left < 0) {
        view.scrollX = clamp(view.scrollX + left, 0, max);
    } else if (right > view.rowWidth) {
        view.scrollX = clamp(view.scrollX + right - view.rowWidth, 0, max);
    }
}

/**
 * @param {import("./main.js").default} view
 * @param {import("./math.js").Placement} lay
 */
function renderMeasurements(view, lay) {
    const z = zoom();

    return h_flex()
        .id('tab-measure')
        .absolute()
        .left(MEASURE_OFFSCREEN_PX)
        .top(0)
        .h(0)
        .gap(0)
        .children(
            lay.ids.map((id) => {
                const tab = lay.byId.get(id);
                if (!tab) {
                    return div();
                }
                const text = labelText(view, tab);
                return div()
                    .id(`tab-measure-${id}`)
                    .text_size(TAB_FONT_SIZE)
                    .max_w(TAB_LABEL_MAX_WIDTH)
                    .truncate()
                    .child(text)
                    .on_size_change((size, cx) => measure(view, tab, text, size.width / z, cx));
            }),
        );
}

/**
 * @param {import("./main.js").default} view
 * @param {import("./math.js").Placement} lay
 */
function renderTabRow(view, lay) {
    const t = colors();
    const d = view.drag;
    const children = [];

    for (const id of lay.ids) {
        if (id === d?.id) {
            continue;
        }
        const tab = lay.byId.get(id);
        if (tab) {
            children.push(renderTab(view, tab, lay, t));
        }
    }

    children.push(renderMeasurements(view, lay));

    if (d) {
        const tab = lay.byId.get(d.id);
        if (tab) {
            children.push(
                renderTab(view, tab, lay, t, {
                    x: d.x,
                    width: d.width,
                    landing: d.phase === 'settle',
                }),
            );
        }
    }

    return h_flex()
        .id('tab-row')
        .relative()
        .flex_1()
        .min_w(0)
        .h_full()
        .overflow_hidden()
        .on_size_change((size, cx) => {
            const width = size.width / zoom();
            if (Math.abs(width - view.rowWidth) > MOVE_EPSILON_PX) {
                view.rowWidth = width;
                cx.notify();
            }
        })
        .on_mouse_move((event, cx) => onPointerMove(view, event, cx))
        .on_mouse_up('left', (_event, cx) => onPointerUp(view, cx))
        .on_mouse_down('left', (event, cx) => {
            if (view.drag || Date.now() < view.animatingUntil) {
                cx.stop_propagation();
            }
            dropStaleDrag(view, cx);
        })
        .children(children);
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 * @param {import("./math.js").Placement} lay
 * @param {import("./state.js").Palette} t
 * @param {{ x: number, width: number, landing: boolean } | null} ghost
 */
function renderTab(view, tab, lay, t, ghost = null) {
    const active = isTabActive(view, tab);
    const labelColor = active ? t.foreground : t.dim;
    const background = active ? t.surface : t.chrome;
    const x = ghost ? ghost.x : (lay.xs[tab.id] ?? 0) - view.scrollX;
    const width = ghost ? ghost.width : (lay.widths[tab.id] ?? TAB_MIN_WIDTH);
    const landing = ghost?.landing ?? false;
    const hovering = !ghost && view.hoveredTabId === tab.id && !view.drag;

    return h_flex()
        .id(ghost ? 'tab-ghost' : `tab-${tab.id}`)
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
        .when(ghost, (el) =>
            el
                .cursor_grabbing()
                .when(landing, (g) =>
                    g.transition('left', { duration: SETTLE_MS, easing: 'ease-in-out' }),
                ),
        )
        .when(!ghost, (el) =>
            el
                .cursor_pointer()
                .transition('left', { duration: REORDER_MS, easing: 'ease-in-out' })
                .on_hover((isHovered, cx) => trackHover(view, tab, isHovered, cx)),
        )
        .when(active, (el) => el.child(activeLine(t)))
        .on_mouse_down('left', (event, cx) =>
            ghost ? onGhostDown(view, event, cx) : view.onTabDown(tab, event, cx),
        )
        .child(renderTabIcon(view, tab, labelColor))
        .child(
            h_flex()
                .flex_1()
                .min_w(0)
                .justify_between()
                .items_center()
                .child(renderTabLabel(view, tab))
                .child(renderTabAction(view, tab, labelColor, t, hovering)),
        )
        .when(isRenaming(view, tab), (el) => el.child(renderRenameInput(view, tab, background)));
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 */
function renderTabLabel(view, tab) {
    return div()
        .max_w(TAB_LABEL_MAX_WIDTH)
        .truncate()
        .opacity(isRenaming(view, tab) ? 0 : 1)
        .child(labelText(view, tab));
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 * @param {import("gpui-kit").Color} labelColor
 * @param {import("./state.js").Palette} t
 * @param {boolean} hovering
 */
function renderTabAction(view, tab, labelColor, t, hovering) {
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
        .on_mouse_down('left', stopPropagation)
        .on_mouse_up('left', (_event, cx) => {
            cx.stop_propagation();
            view.grab = null;
            if (view.drag) {
                onPointerUp(view, cx);
                return;
            }
            view.closeTab(tab);
        })
        .child(
            showsDot
                ? attentionDot(attention === 'blocked' ? t.blocked : t.done)
                : codicon(GLYPH.close, CLOSE_GLYPH_SIZE, labelColor),
        );
}

/**
 * @param {import("./main.js").default} view
 * @param {import("herdr").TabInfo} tab
 * @param {import("gpui-kit").Color} color
 */
function renderTabIcon(view, tab, color) {
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

/**
 * @param {import("./main.js").default} view
 * @param {import("./math.js").Placement} lay
 */
export function trackSlotMovement(view, lay) {
    view.slotX = {};
    let slid = false;
    for (const id of lay.ids) {
        const left = lay.xs[id] - view.scrollX;
        view.slotX[id] = left;
        const before = view.lastSlotX[id];
        if (before !== undefined && Math.abs(before - left) > MOVE_EPSILON_PX) {
            slid = true;
        }
    }
    view.lastSlotX = { ...view.slotX };
    const reordered = slid && !view.drag;
    if (reordered) {
        view.animatingUntil = Math.max(
            view.animatingUntil,
            Date.now() + REORDER_MS + ANIMATION_MARGIN_MS,
        );
    }
}

/**
 * @param {import("./main.js").default} view
 * @param {{ platform: string, maximized: boolean, buttons?: boolean }} win
 * @param {import("./math.js").Placement} lay
 */
export function renderStripBody(view, win, lay) {
    const focus = view.focus;
    if (!focus) {
        return div();
    }
    const t = colors();

    return h_flex()
        .id('tab-strip')
        .relative()
        .size_full()
        .min_w(0)
        .gap(0)
        .items_center()
        .pl(macWindowButtonsPadding())
        .bg(t.canvas)
        .border_b(1)
        .border_color(t.border)
        .track_focus(focus)
        .on_key_down((event, cx) => view.onKey(event, cx))
        .on_mouse_down_out((_event, cx) => dropStaleDrag(view, cx))
        .on_scroll_wheel((event) => scrollTabs(view, event))
        .child(renderTabRow(view, lay))
        .child(renderPaneActions(view))
        .child(renderSettingsGear(view))
        .when(Boolean(win?.buttons), (strip) => strip.child(renderWindowButtons(view, win)));
}
