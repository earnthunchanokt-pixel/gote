const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/order-totals.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const { getBangkokDate, getOrderTotal, sumMoney, buildCupRowsForDate, mergeSaleLines, summarizeSales } = loaded.exports;
const line = (id, unitPrice, qty = 1) => ({ id, name: id, unitPrice, qty, type: "menu" });
const order = (items, toppings = []) => ({
  orderNumber: "GT-0001", createdAt: "2026-10-06T02:00:00Z", total: 999,
  items, toppings, paymentSlipImage: null,
});

test("uses sold quantities and prices rather than cached total", () => {
  assert.equal(getOrderTotal(order([line("tea", 25, 2)], [line("pearl", 10, 2)])), 70);
});

test("multi-cup table counts bill toppings exactly once", () => {
  const bill = order([line("tea", 25, 2), line("matcha", 59)], [line("pearl", 10, 2)]);
  const rows = buildCupRowsForDate([bill], "2026-10-06");
  assert.equal(sumMoney(rows.map((row) => row.total)), 129);
  assert.deepEqual(rows.map((row) => row.index), [1, 2, 3, null]);
});

test("includes topping-only bills and combines single-cup toppings", () => {
  const toppingOnly = order([], [line("cream", 15)]);
  const single = { ...order([line("tea", 25)], [line("pearl", 10)]), orderNumber: "GT-0002" };
  const rows = buildCupRowsForDate([single, toppingOnly], "2026-10-06");
  assert.equal(sumMoney(rows.map((row) => row.total)), 50);
  assert.deepEqual(rows.map((row) => row.index), [null, 1]);
});

test("preserves satang without floating point accumulation", () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(getOrderTotal(order([line("tea", 25.25, 3)], [line("pearl", 0.1, 3)])), 76.05);
});

test("rounds the sold unit price consistently across bill and cup rows", () => {
  const bill = order([line("tea", 10.075, 2), line("tea", 12.35)], [line("pearl", 0.105, 3)]);
  const rows = buildCupRowsForDate([bill], "2026-10-06");
  assert.equal(getOrderTotal(bill), 32.84);
  assert.equal(sumMoney(rows.map((row) => row.total)), 32.84);
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
});

test("filters bills using Bangkok midnight", () => {
  const yesterday = { ...order([line("tea", 25)]), createdAt: "2026-10-05T16:59:59Z" };
  const today = { ...order([line("tea", 25)]), createdAt: "2026-10-05T17:00:00Z" };
  assert.equal(getBangkokDate(new Date(yesterday.createdAt)), "2026-10-05");
  assert.equal(getBangkokDate(today.createdAt), "2026-10-06");
  assert.equal(buildCupRowsForDate([yesterday, today], "2026-10-06").length, 1);
});

test("reconciles daily totals with closed bills and preserves days with only a historical summary", () => {
  const legacy = { date: "2026-10-05", items: [{ menuId: "tea", cupsSold: 7, unitPriceAtSale: 25 }], toppings: [] };
  const stale = { ...legacy, date: "2026-10-06" };
  const tea = order([line("tea", 25, 2), line("tea", 30)]);
  const toppingOnly = { ...order([], [line("pearl", 10, 2)]), orderNumber: "GT-0002" };
  const sales = summarizeSales([tea, toppingOnly], [legacy, stale]);
  assert.deepEqual(sales.get("2026-10-06"), {
    date: "2026-10-06",
    items: [{ menuId: "tea", cupsSold: 2, unitPriceAtSale: 25 }, { menuId: "tea", cupsSold: 1, unitPriceAtSale: 30 }],
    toppings: [{ menuId: "pearl", cupsSold: 2, unitPriceAtSale: 10 }],
  });
  assert.deepEqual(sales.get("2026-10-05"), legacy);
  assert.equal(stale.items[0].cupsSold, 7);
});

test("replaying a state updater does not double sales or mutate prior state", () => {
  const existing = [{ menuId: "tea", cupsSold: 2, unitPriceAtSale: 25 }];
  const lines = [line("tea", 25), line("tea", 30)];
  const first = mergeSaleLines(existing, lines);
  const replay = mergeSaleLines(existing, lines);
  assert.deepEqual(first, replay);
  assert.equal(existing[0].cupsSold, 2);
  assert.deepEqual(first.map((item) => item.cupsSold), [3, 1]);
});
