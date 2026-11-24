import type { CurrentOrder, DailySale, OrderRecord, SaleLine } from "./pos-data";

const bangkokDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toSatang(amount: number) {
  return Math.round((amount + Math.abs(amount) * Number.EPSILON) * 100);
}

export function sumMoney(amounts: number[]) {
  return amounts.reduce((sum, amount) => sum + toSatang(amount), 0) / 100;
}

export function getLineTotal(unitPrice: number, quantity: number) {
  return toSatang(unitPrice) * quantity / 100;
}

export function getOrderTotal(order: CurrentOrder) {
  return sumMoney([...order.items, ...order.toppings].map((item) => getLineTotal(item.unitPrice, item.qty)));
}

export function getBangkokDate(date: string | Date) {
  const parts = bangkokDateFormatter.formatToParts(new Date(date));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function buildCupRowsForDate(orders: OrderRecord[], date: string) {
  const rows: Array<{ key: string; index: number | null; menuName: string; toppingLabel: string; total: number }> = [];
  let cupIndex = 0;

  orders.filter((order) => getBangkokDate(order.createdAt) === date).slice().reverse().forEach((order) => {
    const cupCount = order.items.reduce((sum, item) => sum + item.qty, 0);
    const toppingLabel = order.toppings.map((item) => `${item.name}${item.qty > 1 ? ` x${item.qty}` : ""}`).join(", ");
    const toppingTotal = getOrderTotal({ items: [], toppings: order.toppings });

    order.items.forEach((item, lineIndex) => {
      Array.from({ length: item.qty }).forEach((_, qtyIndex) => {
        rows.push({
          key: `${order.orderNumber}-${lineIndex}-${qtyIndex}`,
          index: ++cupIndex,
          menuName: item.name,
          toppingLabel: cupCount === 1 ? toppingLabel : "",
          total: sumMoney([item.unitPrice, cupCount === 1 ? toppingTotal : 0]),
        });
      });
    });

    // Multi-cup bills do not record which cup owns each topping.
    if (cupCount !== 1 && order.toppings.length > 0) {
      rows.push({ key: `${order.orderNumber}-toppings`, index: null, menuName: "ท็อปปิ้ง", toppingLabel, total: toppingTotal });
    }
  });
  return rows;
}

export function mergeSaleLines(existing: SaleLine[], lines: CurrentOrder["items"]) {
  const merged = existing.map((item) => ({ ...item }));
  addSaleLines(merged, lines);
  return merged;
}

function addSaleLines(merged: SaleLine[], lines: CurrentOrder["items"]) {
  for (const line of lines) {
    const found = merged.find((item) => item.menuId === line.id && item.unitPriceAtSale === line.unitPrice);
    if (found) {
      found.cupsSold += line.qty;
    } else {
      merged.push({ menuId: line.id, cupsSold: line.qty, unitPriceAtSale: line.unitPrice });
    }
  }
}

export function summarizeSales(orders: OrderRecord[], existing: DailySale[]) {
  const sales = new Map<string, DailySale>();
  for (const order of orders) {
    const date = getBangkokDate(order.createdAt);
    const sale = sales.get(date) ?? { date, items: [], toppings: [] };
    addSaleLines(sale.items, order.items);
    addSaleLines(sale.toppings, order.toppings);
    sales.set(date, sale);
  }
  for (const sale of existing) {
    if (!sales.has(sale.date)) sales.set(sale.date, sale);
  }
  return sales;
}
