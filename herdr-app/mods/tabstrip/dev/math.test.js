import test from "node:test";
import assert from "node:assert/strict";
import { clamp, estimateLabelWidth, placeTabs, slotIndexFor, tabWidth } from "../math.js";
import { TAB_CHROME, TAB_LABEL_MAX_WIDTH, TAB_MIN_WIDTH } from "../consts.js";

/** @param {string} id */
function tab(id) {
  return {
    id,
    index: 1,
    name: id,
    named: false,
    active: false,
    status: null,
    panes: 0,
    zoomed: false,
    settled: false,
    settled_at: null,
    changed_at: null,
    working_since: null,
  };
}

test("clamp keeps values inside the range", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("a short label is measured by its characters", () => {
  assert.equal(estimateLabelWidth("abc"), Math.max(24, 3 * 7.4));
});

test("a one-character label never goes below the minimum", () => {
  assert.equal(estimateLabelWidth("a"), 24);
});

test("a long label stops at the maximum width", () => {
  assert.equal(estimateLabelWidth("x".repeat(100)), TAB_LABEL_MAX_WIDTH);
});

test("a tab is its chrome plus its label", () => {
  assert.equal(tabWidth(100), TAB_CHROME + 100);
});

test("a narrow tab stays at the minimum width", () => {
  assert.equal(tabWidth(0), TAB_MIN_WIDTH);
});

test("placeTabs stacks tabs left to right", () => {
  const tabs = [tab("a"), tab("b"), tab("c")];
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const lay = placeTabs(["a", "b", "c"], byId, () => 100);

  assert.deepEqual(lay.xs, { a: 0, b: 100, c: 200 });
  assert.equal(lay.total, 300);
});

test("placeTabs keeps per-tab widths", () => {
  const tabs = [tab("a"), tab("b")];
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const lay = placeTabs(["a", "b"], byId, (tab) => (tab.id === "a" ? 50 : 70));

  assert.deepEqual(lay.widths, { a: 50, b: 70 });
  assert.deepEqual(lay.xs, { a: 0, b: 50 });
});

test("placeTabs ignores ids missing from the tab map", () => {
  const tabs = [tab("a"), tab("b")];
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const lay = placeTabs(["a", "stale", "b"], byId, () => 100);

  assert.deepEqual(lay.ids, ["a", "b"]);
  assert.equal(lay.total, 200);
});

test("a ghost at the far left takes the first slot", () => {
  const tabs = [tab("a"), tab("b")];
  assert.equal(slotIndexFor(-50, tabs, () => 100), 0);
});

test("a ghost in the middle takes the nearest boundary", () => {
  const tabs = [tab("a"), tab("b")];
  assert.equal(slotIndexFor(120, tabs, () => 100), 1);
  assert.equal(slotIndexFor(80, tabs, () => 100), 1);
  assert.equal(slotIndexFor(40, tabs, () => 100), 0);
});

test("a ghost past the last tab takes the last slot", () => {
  const tabs = [tab("a"), tab("b")];
  assert.equal(slotIndexFor(5000, tabs, () => 100), 2);
});
