import seedState from "@/app-state.json";

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  color: string;
};

export type ToppingItem = {
  id: string;
  name: string;
  price: number;
  active: boolean;
};

export type PaymentSettings = {
  shopName: string;
  promptpayId: string;
};

export type OrderLine = {
  id: string;
  name: string;
  unitPrice: number;
  qty: number;
  type: "menu" | "topping";
};

export type CurrentOrder = {
  items: OrderLine[];
  toppings: OrderLine[];
};

export type SaleLine = {
  menuId: string;
  cupsSold: number;
  unitPriceAtSale: number;
};

export type DailySale = {
  date: string;
  items: SaleLine[];
  toppings: SaleLine[];
};

export type OrderRecord = {
  orderNumber: string;
  createdAt: string;
  total: number;
  items: OrderLine[];
  toppings: OrderLine[];
};

export type PosState = {
  menus: MenuItem[];
  toppings: ToppingItem[];
  sales: DailySale[];
  payment: PaymentSettings;
  currentOrder: CurrentOrder;
  orders: OrderRecord[];
  lastOrder: OrderRecord | null;
};

export const STORAGE_KEY = "gote-pos-next-v1";
export const STATE_API_ENDPOINT = "/api/state";

export const defaultMenus: MenuItem[] = (seedState.menus as MenuItem[]).map((menu) => ({
  ...menu,
  color: normalizeHexColor(menu.color),
}));

export const defaultToppings: ToppingItem[] = structuredClone(seedState.toppings as ToppingItem[]);

export const defaultPayment: PaymentSettings = {
  shopName: seedState.payment?.shopName || "gote",
  promptpayId: seedState.payment?.promptpayId || "0849755392",
};

export function createEmptyOrder(): CurrentOrder {
  return { items: [], toppings: [] };
}

export function createDefaultState(): PosState {
  return {
    menus: structuredClone(defaultMenus),
    toppings: structuredClone(defaultToppings),
    sales: structuredClone((seedState.sales ?? []) as DailySale[]),
    payment: { ...defaultPayment },
    currentOrder: structuredClone((seedState.currentOrder ?? createEmptyOrder()) as CurrentOrder),
    orders: structuredClone((seedState.orders ?? []) as OrderRecord[]),
    lastOrder: structuredClone((seedState.lastOrder ?? null) as OrderRecord | null),
  };
}

export function getToday() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(amount: number) {
  return new Intl.NumberFormat("th-TH").format(amount);
}

export function normalizeHexColor(color: string, fallback = "#d3a992") {
  const normalized = color.trim();
  return /^#([0-9a-f]{6})$/i.test(normalized) ? normalized : fallback;
}

export function normalizeState(input: unknown): PosState {
  const fallback = createDefaultState();

  if (!input || typeof input !== "object") {
    return fallback;
  }

  const raw = input as Partial<PosState>;

  return {
    menus: Array.isArray(raw.menus) && raw.menus.length > 0
      ? raw.menus.map((menu, index) => ({
          ...menu,
          color: normalizeHexColor(menu.color, fallback.menus[index % fallback.menus.length]?.color),
        }))
      : fallback.menus,
    toppings: Array.isArray(raw.toppings) && raw.toppings.length > 0 ? raw.toppings : fallback.toppings,
    sales: Array.isArray(raw.sales)
      ? raw.sales.map((sale) => ({
          date: sale.date,
          items: Array.isArray(sale.items) ? sale.items : [],
          toppings: Array.isArray(sale.toppings) ? sale.toppings : [],
        }))
      : [],
    payment: {
      shopName: raw.payment?.shopName || fallback.payment.shopName,
      promptpayId: raw.payment?.promptpayId || fallback.payment.promptpayId,
    },
    currentOrder: {
      items: Array.isArray(raw.currentOrder?.items) ? raw.currentOrder.items : [],
      toppings: Array.isArray(raw.currentOrder?.toppings) ? raw.currentOrder.toppings : [],
    },
    orders: Array.isArray(raw.orders) ? raw.orders : [],
    lastOrder: raw.lastOrder ?? null,
  };
}

export function createOrderNumber(count: number) {
  return `GT-${String(count).padStart(4, "0")}`;
}
