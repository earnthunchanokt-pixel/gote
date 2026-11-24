import seedState from "@/app-state.json";
import { getBangkokDate, getOrderTotal } from "./order-totals";

export const MENU_CATEGORIES = ["ชา", "นม", "มัทฉะ", "กาแฟ"] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export const MENU_IMAGE_SIZE = { min: 32, max: 240, initial: 64 } as const;

export type MenuImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  color: string;
  image?: string | null;
  imageCrop?: MenuImageCrop | null;
  imageSize?: number;
  category?: MenuCategory;
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

export type InventorySettings = {
  cupStock: number;
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
  paymentSlipImage: string | null;
};

export type PosState = {
  menus: MenuItem[];
  toppings: ToppingItem[];
  sales: DailySale[];
  payment: PaymentSettings;
  inventory: InventorySettings;
  currentOrder: CurrentOrder;
  currentPaymentSlipImage: string | null;
  orders: OrderRecord[];
  lastOrder: OrderRecord | null;
};

type SeedOrderRecord = Omit<OrderRecord, "paymentSlipImage"> & {
  paymentSlipImage?: string | null;
};

type SeedPosState = Omit<PosState, "orders" | "lastOrder" | "currentPaymentSlipImage"> & {
  orders?: SeedOrderRecord[];
  lastOrder?: SeedOrderRecord | null;
  currentPaymentSlipImage?: string | null;
};

export const STORAGE_KEY = "gote-pos-next-v1";
export const STATE_API_ENDPOINT = "/api/state";
export const MAX_MENU_IMAGE_LENGTH = 96_000;

export const defaultMenus: MenuItem[] = (seedState.menus as MenuItem[]).map((menu) => ({
  ...menu,
  color: normalizeHexColor(menu.color),
}));

export const defaultToppings: ToppingItem[] = structuredClone(seedState.toppings as ToppingItem[]);

export const defaultPayment: PaymentSettings = {
  shopName: seedState.payment?.shopName || "gote",
  promptpayId: seedState.payment?.promptpayId || "0849755392",
};

export const defaultInventory: InventorySettings = {
  cupStock:
    typeof (seedState as { inventory?: { cupStock?: number } }).inventory?.cupStock === "number"
      ? Math.max(0, (seedState as { inventory?: { cupStock?: number } }).inventory?.cupStock ?? 0)
      : 300,
};

export function createEmptyOrder(): CurrentOrder {
  return { items: [], toppings: [] };
}

export function createDefaultState(): PosState {
  const seed = seedState as unknown as SeedPosState;

  return {
    menus: structuredClone(defaultMenus),
    toppings: structuredClone(defaultToppings),
    sales: structuredClone((seed.sales ?? []) as DailySale[]),
    payment: { ...defaultPayment },
    inventory: { ...defaultInventory },
    currentOrder: structuredClone((seed.currentOrder ?? createEmptyOrder()) as CurrentOrder),
    currentPaymentSlipImage: seed.currentPaymentSlipImage ?? null,
    orders: structuredClone((seed.orders ?? []).map((order) => ({ ...order, paymentSlipImage: order.paymentSlipImage ?? null }))),
    lastOrder: seed.lastOrder ? { ...seed.lastOrder, paymentSlipImage: seed.lastOrder.paymentSlipImage ?? null } : null,
  };
}

export function getToday() {
  return getBangkokDate(new Date());
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(amount: number) {
  return new Intl.NumberFormat("th-TH").format(amount);
}

export function normalizeHexColor(color: string, fallback = "#d3a992") {
  const normalized = color.trim();
  return /^#([0-9a-f]{6})$/i.test(normalized) ? normalized : fallback;
}

function normalizeMenuImageSize(size: unknown) {
  if (typeof size !== "number" || !Number.isFinite(size)) return MENU_IMAGE_SIZE.initial;
  return Math.min(MENU_IMAGE_SIZE.max, Math.max(MENU_IMAGE_SIZE.min, Math.round(size)));
}

function normalizeMenuImageCrop(crop: MenuImageCrop | null | undefined) {
  if (!crop || ![crop.x, crop.y, crop.width, crop.height, crop.aspectRatio].every(Number.isFinite)) return null;
  const { x, y, width, height, aspectRatio } = crop;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || aspectRatio <= 0 || x + width > 1.000001 || y + height > 1.000001) return null;
  return { x, y, width, height, aspectRatio };
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
          category: MENU_CATEGORIES.find((category) => category === menu.category),
          imageSize: normalizeMenuImageSize(menu.imageSize),
          imageCrop: normalizeMenuImageCrop(menu.imageCrop),
          image: typeof menu.image === "string" &&
            menu.image.length <= MAX_MENU_IMAGE_LENGTH &&
            /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(menu.image)
            ? menu.image
            : null,
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
    inventory: {
      cupStock:
        typeof raw.inventory?.cupStock === "number" && Number.isFinite(raw.inventory.cupStock)
          ? Math.max(0, raw.inventory.cupStock)
          : fallback.inventory.cupStock,
    },
    currentOrder: {
      items: Array.isArray(raw.currentOrder?.items) ? raw.currentOrder.items : [],
      toppings: Array.isArray(raw.currentOrder?.toppings) ? raw.currentOrder.toppings : [],
    },
    currentPaymentSlipImage: typeof raw.currentPaymentSlipImage === "string" ? raw.currentPaymentSlipImage : null,
    orders: Array.isArray(raw.orders)
      ? raw.orders.map((order) => ({
          ...order,
          total: getOrderTotal(order),
          paymentSlipImage: typeof order.paymentSlipImage === "string" ? order.paymentSlipImage : null,
        }))
      : [],
    lastOrder: raw.lastOrder
      ? {
          ...raw.lastOrder,
          total: getOrderTotal(raw.lastOrder),
          paymentSlipImage: typeof raw.lastOrder.paymentSlipImage === "string" ? raw.lastOrder.paymentSlipImage : null,
        }
      : null,
  };
}

export function createOrderNumber(count: number) {
  return `GT-${String(count).padStart(4, "0")}`;
}
