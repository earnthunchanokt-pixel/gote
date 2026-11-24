"use client";

import Image from "next/image";
import { MenuImageCropper, MenuPhoto } from "@/components/menu-image-cropper";
import { usePosState } from "@/components/use-pos-state";
import { buildCupRowsForDate, getBangkokDate, getLineTotal, getOrderTotal, mergeSaleLines, summarizeSales, sumMoney } from "@/lib/order-totals";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  MAX_MENU_IMAGE_LENGTH,
  MENU_CATEGORIES,
  MENU_IMAGE_SIZE,
  type DailySale,
  type MenuCategory,
  type MenuImageCrop,
  type MenuItem,
  type PosState,
  type ToppingItem,
  createEmptyOrder,
  createOrderNumber,
  formatCurrency,
  formatNumber,
  getToday,
  normalizeHexColor,
} from "@/lib/pos-data";

type TabKey = "order" | "summary" | "catalog" | "settings";

type ToastState = { show: boolean; message: string; tone?: "dark" | "success" };

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "order", label: "ขายหน้าร้าน" },
  { key: "summary", label: "สรุปยอด" },
  { key: "catalog", label: "เมนูขาย" },
  { key: "settings", label: "ตั้งค่า" },
];

const emptyMenuDraft = {
  name: "",
  price: "",
  color: "#d3a992",
  image: null as string | null,
  imageCrop: null as MenuImageCrop | null,
  imageSize: MENU_IMAGE_SIZE.initial as number,
  category: undefined as MenuCategory | undefined,
};

export function PosApp() {
  const { state, setState, loadedState, status: syncStatus, cacheError, retrySync } = usePosState();
  const hydrated = loadedState !== null;
  const [activeTab, setActiveTab] = useState<TabKey>("order");
  const cartDialogRef = useRef<HTMLDialogElement>(null);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [menuDraft, setMenuDraft] = useState(emptyMenuDraft);
  const [preparingDraftImage, setPreparingDraftImage] = useState(false);
  const [toppingDraft, setToppingDraft] = useState({ name: "", price: "" });
  const [shopName, setShopName] = useState(state.payment.shopName);
  const [promptpayId, setPromptpayId] = useState(state.payment.promptpayId);
  const [cupStockInput, setCupStockInput] = useState(String(state.inventory.cupStock));
  const [toast, setToast] = useState<ToastState>({ show: false, message: "", tone: "dark" });
  const [summaryProtectionEnabled, setSummaryProtectionEnabled] = useState(false);
  const [summaryUnlocked, setSummaryUnlocked] = useState(false);
  const [summaryAccessChecked, setSummaryAccessChecked] = useState(false);
  const [summaryPassword, setSummaryPassword] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summarySubmitting, setSummarySubmitting] = useState(false);
  const [pendingMenuId, setPendingMenuId] = useState<string | null>(null);
  const pendingMenuConfirmedRef = useRef(false);
  const [pendingToppingQty, setPendingToppingQty] = useState<Record<string, number>>({});
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!loadedState) return;
    setShopName(loadedState.payment.shopName);
    setPromptpayId(loadedState.payment.promptpayId);
    setCupStockInput(String(loadedState.inventory.cupStock));
  }, [loadedState]);

  useEffect(() => {
    let ignore = false;

    const loadSummaryAccess = async () => {
      try {
        const response = await fetch("/api/auth/summary", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load summary access");
        }

        const data = (await response.json()) as { enabled?: boolean; unlocked?: boolean };
        if (ignore) {
          return;
        }

        setSummaryProtectionEnabled(Boolean(data.enabled));
        setSummaryUnlocked(Boolean(data.unlocked));
      } catch {
        if (!ignore) {
          setSummaryProtectionEnabled(false);
          setSummaryUnlocked(true);
        }
      } finally {
        if (!ignore) {
          setSummaryAccessChecked(true);
        }
      }
    };

    void loadSummaryAccess();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!toast.show) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast({ show: false, message: "", tone: "dark" });
    }, toast.tone === "success" ? 900 : 2200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeMenus = useMemo(() => state.menus.filter((item) => item.active), [state.menus]);
  const activeToppings = useMemo(() => state.toppings.filter((item) => item.active), [state.toppings]);
  const menuGroups = useMemo(() => groupMenusByCategory(activeMenus), [activeMenus]);
  const catalogMenuGroups = useMemo(() => groupMenusByCategory(state.menus), [state.menus]);
  const pendingMenu = useMemo(
    () => activeMenus.find((item) => item.id === pendingMenuId) ?? null,
    [activeMenus, pendingMenuId],
  );
  const pendingTotals = useMemo(() => {
    const menuTotal = getLineTotal(pendingMenu?.price ?? 0, 1);
    const toppingTotal = sumMoney(activeToppings.map((item) => getLineTotal(item.price, pendingToppingQty[item.id] ?? 0)));
    const existingTotal = getOrderTotal(state.currentOrder);
    return {
      menuTotal,
      toppingTotal,
      existingTotal,
      total: sumMoney([existingTotal, menuTotal, toppingTotal]),
    };
  }, [activeToppings, pendingMenu, pendingToppingQty, state.currentOrder]);

  const orderLines = useMemo(
    () => [
      ...state.currentOrder.items.map((item) => ({ ...item, label: "เมนูน้ำ" })),
      ...state.currentOrder.toppings.map((item) => ({ ...item, label: "ท็อปปิ้ง" })),
    ],
    [state.currentOrder.items, state.currentOrder.toppings],
  );

  const currentTotals = useMemo(() => ({
    units: orderLines.reduce((sum, item) => sum + item.qty, 0),
    total: getOrderTotal(state.currentOrder),
  }), [orderLines, state.currentOrder]);

  const salesByDate = useMemo(() => summarizeSales(state.orders, state.sales), [state.orders, state.sales]);
  const selectedSale = salesByDate.get(selectedDate);

  const selectedOrders = useMemo(
    () => state.orders.filter((order) => getBangkokDate(order.createdAt) === selectedDate),
    [state.orders, selectedDate],
  );
  const selectedCupCount = selectedSale?.items.reduce((sum, item) => sum + item.cupsSold, 0) ?? 0;

  const totalCupsUsed = useMemo(() => {
    return [...salesByDate.values()].reduce(
      (grandTotal, sale) => grandTotal + sale.items.reduce((sum, item) => sum + item.cupsSold, 0),
      0,
    );
  }, [salesByDate]);

  const cupsRemaining = useMemo(() => {
    return Math.max(0, state.inventory.cupStock - totalCupsUsed);
  }, [state.inventory.cupStock, totalCupsUsed]);

  const selectedCupRows = useMemo(() => {
    return buildCupRowsForDate(selectedOrders, selectedDate);
  }, [selectedOrders, selectedDate]);
  const selectedMenuCounts = useMemo(() => {
    if (selectedOrders.length === 0) {
      const counts = new Map<string, number>();
      for (const item of selectedSale?.items ?? []) {
        counts.set(item.menuId, (counts.get(item.menuId) ?? 0) + item.cupsSold);
      }
      return [...counts].filter(([, cups]) => cups > 0).map(([id, cups]) => ({
        id, name: state.menus.find((menu) => menu.id === id)?.name ?? "เมนูที่ถูกลบ", cups,
      })).sort((a, b) => b.cups - a.cups || a.name.localeCompare(b.name, "th"));
    }

    const counts = new Map<string, { id: string; name: string; cups: number }>();
    for (const order of selectedOrders) {
      for (const item of order.items) {
        if (item.qty <= 0) continue;
        const name = item.name.normalize("NFC").trim().replace(/\s+/g, " ");
        const key = name || item.id;
        const row = counts.get(key) ?? { id: key, name: name || "เมนูไม่มีชื่อ", cups: 0 };
        row.cups += item.qty;
        counts.set(key, row);
      }
    }
    return [...counts.values()].sort((a, b) => b.cups - a.cups || a.name.localeCompare(b.name, "th"));
  }, [selectedOrders, selectedSale, state.menus]);
  const selectedOrderTotal = useMemo(() => {
    return sumMoney([...(selectedSale?.items ?? []), ...(selectedSale?.toppings ?? [])]
      .map((item) => getLineTotal(item.unitPriceAtSale, item.cupsSold)));
  }, [selectedSale]);

  const summaryRows = useMemo(() => enrichSales(selectedSale?.items ?? [], state.menus, "เมนูที่ถูกลบ"), [selectedSale, state.menus]);
  const toppingRows = useMemo(
    () => enrichSales(selectedSale?.toppings ?? [], state.toppings, "ท็อปปิ้งที่ถูกลบ"),
    [selectedSale, state.toppings],
  );

  const summaryStats = useMemo(() => {
    const menuRevenue = sumMoney(summaryRows.map((item) => item.revenue));
    const toppingRevenue = sumMoney(toppingRows.map((item) => item.revenue));
    const cups = summaryRows.reduce((sum, item) => sum + item.cupsSold, 0);
    return {
      cups,
      menuRevenue,
      toppingRevenue,
      totalRevenue: sumMoney([menuRevenue, toppingRevenue]),
    };
  }, [summaryRows, toppingRows]);

  function showToast(message: string, tone: ToastState["tone"] = "dark") {
    setToast({ show: true, message, tone });
  }

  function openMenuConfirm(menuId: string) {
    pendingMenuConfirmedRef.current = false;
    setPendingMenuId(menuId);
    setPendingToppingQty({});
  }

  function closeMenuConfirm() {
    setPendingMenuId(null);
    setPendingToppingQty({});
  }

  function updatePendingTopping(toppingId: string, delta: number) {
    setPendingToppingQty((current) => {
      const nextQty = Math.max(0, (current[toppingId] ?? 0) + delta);
      const next = { ...current };
      if (nextQty === 0) {
        delete next[toppingId];
      } else {
        next[toppingId] = nextQty;
      }
      return next;
    });
  }

  function confirmMenuOrder() {
    if (!pendingMenu || pendingMenuConfirmedRef.current) {
      return;
    }
    pendingMenuConfirmedRef.current = true;

    const selectedToppings = activeToppings
      .map((item) => ({ ...item, qty: pendingToppingQty[item.id] ?? 0 }))
      .filter((item) => item.qty > 0);
    const confirmedTotal = pendingTotals.total;

    setState((current) => {
      const nextItems = upsertOrderLine(current.currentOrder.items, {
        id: pendingMenu.id,
        name: pendingMenu.name,
        unitPrice: pendingMenu.price,
        qty: 1,
        type: "menu",
      });

      const nextToppings = selectedToppings.reduce(
        (lines, topping) =>
          upsertOrderLine(lines, {
            id: topping.id,
            name: topping.name,
            unitPrice: topping.price,
            qty: topping.qty,
            type: "topping",
          }),
        current.currentOrder.toppings,
      );

      const nextOrder = {
        items: nextItems,
        toppings: nextToppings,
      };
      const date = getToday();
      const orderNumber = createOrderNumber(current.orders.length + 1);
      const orderTotal = getOrderTotal(nextOrder);
      const orderRecord = {
        orderNumber,
        createdAt: new Date().toISOString(),
        total: orderTotal,
        items: structuredClone(nextOrder.items),
        toppings: structuredClone(nextOrder.toppings),
        paymentSlipImage: current.currentPaymentSlipImage,
      };

      return {
        ...current,
        sales: mergeOrderIntoSales(current.sales, date, nextOrder),
        orders: [orderRecord, ...current.orders],
        lastOrder: orderRecord,
        currentOrder: createEmptyOrder(),
        currentPaymentSlipImage: null,
      };
    });

    cartDialogRef.current?.close();
    showToast(`✓ ปิดบิล ${formatCurrency(confirmedTotal)}`, "success");
    closeMenuConfirm();
  }

  async function unlockSummary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSummarySubmitting(true);
    setSummaryError("");

    try {
      const response = await fetch("/api/auth/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: summaryPassword }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setSummaryError(data?.message ?? "ปลดล็อกสรุปยอดไม่สำเร็จ");
        setSummarySubmitting(false);
        return;
      }

      setSummaryUnlocked(true);
      setSummaryPassword("");
      setSummarySubmitting(false);
      showToast("เปิดสรุปยอดแล้ว");
    } catch {
      setSummaryError("เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง");
      setSummarySubmitting(false);
    }
  }

  function addToOrder(type: "menu" | "topping", id: string) {
    setState((current) => {
      const sourceList = type === "menu" ? current.menus : current.toppings;
      const source = sourceList.find((item) => item.id === id && item.active);

      if (!source) {
        return current;
      }

      const key = type === "menu" ? "items" : "toppings";
      const nextLines = upsertOrderLine(current.currentOrder[key], {
        id: source.id, name: source.name, unitPrice: source.price, qty: 1, type,
      });

      showToast(`เพิ่ม ${source.name} แล้ว`);
      return {
        ...current,
        currentOrder: {
          ...current.currentOrder,
          [key]: nextLines,
        },
      };
    });
  }

  function updateOrderQty(type: "menu" | "topping", id: string, unitPrice: number, delta: number) {
    setState((current) => {
      const key = type === "menu" ? "items" : "toppings";
      const nextLines = current.currentOrder[key]
        .map((item) => (item.id === id && item.unitPrice === unitPrice ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0);

      return {
        ...current,
        currentOrder: {
          ...current.currentOrder,
          [key]: nextLines,
        },
      };
    });
  }

  function clearOrder() {
    setState((current) => ({ ...current, currentOrder: createEmptyOrder(), currentPaymentSlipImage: null }));
  }

  function onSelectSlip() {
    slipInputRef.current?.click();
  }

  function removeSlip() {
    setState((current) => ({ ...current, currentPaymentSlipImage: null }));
    if (slipInputRef.current) {
      slipInputRef.current.value = "";
    }
    showToast("ลบสลิปแล้ว");
  }

  function handleSlipFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("กรุณาเลือกรูปสลิป");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        showToast("อ่านไฟล์สลิปไม่สำเร็จ");
        return;
      }

      setState((current) => ({ ...current, currentPaymentSlipImage: result }));
      showToast("แนบสลิปแล้ว");
    };
    reader.onerror = () => {
      showToast("อัปโหลดสลิปไม่สำเร็จ");
    };
    reader.readAsDataURL(file);
  }

  function checkoutOrder() {
    if (!hydrated) return;
    if (currentTotals.units === 0) {
      showToast("กรุณาเพิ่มรายการก่อนปิดบิล");
      return;
    }

    setState((current) => {
      if (current.currentOrder.items.length === 0 && current.currentOrder.toppings.length === 0) {
        return current;
      }
      const date = getToday();
      const orderNumber = createOrderNumber(current.orders.length + 1);
      const orderRecord = {
        orderNumber,
        createdAt: new Date().toISOString(),
        total: getOrderTotal(current.currentOrder),
        items: structuredClone(current.currentOrder.items),
        toppings: structuredClone(current.currentOrder.toppings),
        paymentSlipImage: current.currentPaymentSlipImage,
      };

      const nextSales = mergeOrderIntoSales(current.sales, date, current.currentOrder);

      return {
        ...current,
        sales: nextSales,
        orders: [orderRecord, ...current.orders],
        lastOrder: orderRecord,
        currentOrder: createEmptyOrder(),
        currentPaymentSlipImage: null,
      };
    });

    setSelectedDate(getToday());
    setActiveTab("summary");
    cartDialogRef.current?.close();
    showToast("ปิดบิลเรียบร้อย");
  }

  function savePaymentSettings() {
    const parsedCupStock = Number(cupStockInput);

    if (Number.isNaN(parsedCupStock) || parsedCupStock < 0) {
      showToast("กรุณากรอกจำนวนแก้วคงเหลือให้ถูกต้อง");
      return;
    }

    setState((current) => ({
      ...current,
      payment: {
        shopName: shopName.trim() || "gote",
        promptpayId: promptpayId.trim(),
      },
      inventory: {
        cupStock: Math.floor(parsedCupStock),
      },
    }));
    showToast("บันทึกการตั้งค่าแล้ว");
  }

  function downloadBackup() {
    const file = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gote-pos-backup-${getToday()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function addMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preparingDraftImage) return;

    const price = Number(menuDraft.price);

    if (!menuDraft.name.trim() || !Number.isFinite(price) || price < 0) {
      showToast("กรอกชื่อเมนูและราคาให้ครบ");
      return;
    }

    setState((current) => ({
      ...current,
      menus: [
        ...current.menus,
        {
          id: createCatalogItemId(),
          name: menuDraft.name.trim(),
          price: getLineTotal(price, 1),
          color: normalizeHexColor(menuDraft.color),
          image: menuDraft.image,
          imageCrop: menuDraft.imageCrop,
          imageSize: menuDraft.imageSize,
          category: menuDraft.category,
          active: true,
        },
      ],
    }));

    setMenuDraft(emptyMenuDraft);
    showToast("เพิ่มเมนูแล้ว");
  }

  function addTopping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(toppingDraft.price);

    if (!toppingDraft.name.trim() || !Number.isFinite(price) || price < 0) {
      showToast("กรอกชื่อท็อปปิ้งและราคาให้ครบ");
      return;
    }

    setState((current) => ({
      ...current,
      toppings: [
        ...current.toppings,
        {
          id: createCatalogItemId(),
          name: toppingDraft.name.trim(),
          price: getLineTotal(price, 1),
          active: true,
        },
      ],
    }));

    setToppingDraft({ name: "", price: "" });
    showToast("เพิ่มท็อปปิ้งแล้ว");
  }

  function updateMenuItem(menuId: string, patch: Partial<MenuItem>) {
    setState((current) => ({
      ...current,
      menus: current.menus.map((item) => (item.id === menuId ? { ...item, ...patch } : item)),
    }));
  }

  function updateToppingItem(toppingId: string, patch: Partial<ToppingItem>) {
    setState((current) => ({
      ...current,
      toppings: current.toppings.map((item) => (item.id === toppingId ? { ...item, ...patch } : item)),
    }));
  }

  const surfaceClass = "glass-panel fade-up rounded-lg bg-[var(--surface)] p-4 sm:p-5";
  const syncMessage = {
    loading: "กำลังโหลดข้อมูลร้าน",
    local: "บันทึกเฉพาะในเบราว์เซอร์เครื่องนี้",
    saving: "กำลังบันทึกเข้าฐานกลาง",
    saved: "บันทึกในฐานกลางแล้ว",
    error: "ยังส่งข้อมูลเข้าฐานกลางไม่สำเร็จ",
    conflict: "ข้อมูลในเครื่องต่างจากฐานกลาง กรุณาดาวน์โหลดสำเนาในตั้งค่า",
  }[syncStatus];

  return (
    <main className="relative min-h-screen overflow-x-hidden pb-44 sm:pb-32 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:pb-0">
      <DesktopSidebar activeTab={activeTab} currentTotals={currentTotals} onChange={setActiveTab} />

      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
        <section className="glass-panel fade-up rounded-lg px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Gote POS</p>
                <h1 className="mt-1 text-[22px] font-extrabold leading-tight text-[var(--text)] sm:text-[26px]">
                  ขายหน้าร้าน
                </h1>
              </div>
              <div className="flex max-w-full flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-[var(--muted)]">
                  วันที่ขาย
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => {
                      if (event.target.value) setSelectedDate(event.target.value);
                    }}
                    className="min-h-11 min-w-0 max-w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-[14px] text-[var(--text)] outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedDate(getToday())}
                  className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-[13px] font-semibold text-[var(--text-body)] hover:bg-[var(--surface-soft)]"
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => cartDialogRef.current?.showModal()}
                  className="min-h-11 rounded-md bg-[var(--sky)] px-4 py-2 text-[13px] font-bold text-white"
                >
                  ดูบิล
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <StatChip label="จำนวนในบิล" value={formatNumber(currentTotals.units)} tone="sky" />
              <StatChip label="ยอดบิลรวมวันที่เลือก" value={formatCurrency(selectedOrderTotal)} tone="emerald" />
              <StatChip label="ใช้แก้ววันที่เลือก" value={`${formatNumber(selectedCupCount)} แก้ว`} tone="amber" />
              <StatChip label="จำนวนสินค้า" value={formatNumber(activeMenus.length)} tone="slate" />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              <p role="status" className={syncStatus === "saved" ? "text-[var(--emerald-deep)]" : "text-[var(--muted)]"}>
                {cacheError && syncStatus !== "saved" ? "บันทึกสำเนาในเบราว์เซอร์ไม่สำเร็จ กรุณาดาวน์โหลดสำเนาในตั้งค่า" : syncMessage}
              </p>
              {syncStatus === "error" || (syncStatus === "local" && !cacheError) ? (
                <button type="button" onClick={retrySync} className="min-h-9 font-semibold text-[var(--sky)]">
                  ลองเชื่อมต่ออีกครั้ง
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <nav className="glass-panel fade-up sticky top-2 z-30 grid grid-cols-2 gap-2 rounded-lg p-2 sm:flex sm:overflow-x-auto lg:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative min-h-11 rounded-md px-4 py-3 text-[14px] font-bold whitespace-nowrap transition ${
                activeTab === tab.key
                  ? "bg-[var(--sky)] text-white shadow-[var(--shadow-lift)]"
                  : "bg-[var(--surface-soft)] text-[var(--text-body)] hover:bg-[var(--sky-soft)] hover:text-sky-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={`grid gap-4 ${activeTab === "order" ? "lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_280px]" : "grid-cols-1"}`}>
          <div className="space-y-4">
            {activeTab === "order" ? (
              <>
                <section className={surfaceClass}>
                  <SectionHeading
                    eyebrow="เลือกเมนู"
                    title="แตะเพื่อเพิ่มลงบิล"
                    description="แยกตามประเภท เลือกหมวดแล้วกดเมนูในคอลัมน์นั้นได้เลย"
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {menuGroups.map((group) => (
                      <div key={group.label} className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h3 className="text-[18px] font-extrabold text-[var(--text)]">{group.label}</h3>
                          <span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-[var(--muted)]">
                            {formatNumber(group.items.length)}
                          </span>
                        </div>
                        <div className="grid gap-2">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              disabled={!hydrated}
                              onClick={() => openMenuConfirm(item.id)}
                              className="flex min-h-[86px] min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-[var(--line)] bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-[var(--sky-soft)] active:translate-y-0"
                              style={{ boxShadow: `inset 5px 0 0 ${item.color}` }}
                            >
                              {item.image ? (
                                <MenuPhoto image={item.image} size={item.imageSize} crop={item.imageCrop} />
                              ) : null}
                              <span className="min-w-0 grow basis-16 [overflow-wrap:anywhere]">
                                <span className="block text-[15px] font-extrabold leading-snug text-[var(--text-body)]">{item.name}</span>
                                <span className="mt-2 block text-[14px] font-bold text-[var(--sky)]">{formatCurrency(item.price)}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="col-span-full rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-[18px] font-extrabold text-[var(--text)]">ท็อปปิ้ง</h3>
                        <span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-[var(--muted)]">
                          {formatNumber(activeToppings.length)}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {activeToppings.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!hydrated}
                            onClick={() => addToOrder("topping", item.id)}
                            className="min-h-[86px] rounded-md border border-[var(--line)] bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-[var(--sky-soft)] active:translate-y-0"
                          >
                            <span className="block text-[15px] font-extrabold text-[var(--text-body)]">{item.name}</span>
                            <span className="mt-2 block text-[14px] font-bold text-[var(--sky)]">{formatCurrency(item.price)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className={surfaceClass}>
                  <SectionHeading
                    eyebrow="รายการแก้ววันที่เลือก"
                    title="ขายอะไรไปบ้าง"
                    description={selectedDate}
                  />
                  <div className="mt-4 grid gap-2">
                    {selectedCupRows.length === 0 ? (
                      <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-6 text-center text-[13px] font-semibold text-[var(--muted)]">
                        ยังไม่มีรายการขายในวันที่เลือก
                      </div>
                    ) : (
                      selectedCupRows.map((row) => (
                        <div
                          key={row.key}
                          className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-white px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-[var(--muted)]">{row.index === null ? "ท็อปปิ้งในบิล" : `แก้วที่ ${formatNumber(row.index)}`}</p>
                            <p className="mt-1 truncate text-[15px] font-extrabold text-[var(--text)]">{row.menuName}</p>
                            {row.toppingLabel ? (
                              <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">ท็อปปิ้ง: {row.toppingLabel}</p>
                            ) : null}
                          </div>
                          <p className="shrink-0 text-[14px] font-extrabold text-[var(--sky)]">{formatCurrency(row.total)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className={surfaceClass}>
                  <SectionHeading
                    eyebrow="รับเงินหน้าร้าน"
                    title="ยอดโอนและข้อมูลรับเงิน"
                    description="ยอดบิล ชื่อร้าน และข้อมูลพร้อมเพย์"
                  />
                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-md bg-[var(--surface-soft)] p-4">
                          <p className="text-[12px] font-semibold text-[var(--muted)]">ชื่อร้าน</p>
                          <p className="mt-2 text-[18px] font-extrabold text-[var(--text)]">{state.payment.shopName || "gote"}</p>
                        </div>
                        <div className="rounded-md bg-[var(--surface-soft)] p-4">
                          <p className="text-[12px] font-semibold text-[var(--muted)]">ยอดบิลปัจจุบัน</p>
                          <p className="mt-2 text-[18px] font-extrabold text-[var(--text)]">{formatCurrency(currentTotals.total)}</p>
                        </div>
                        <div className="rounded-md bg-[var(--surface-soft)] p-4">
                          <p className="text-[12px] font-semibold text-[var(--muted)]">พร้อมเพย์</p>
                          <p className="mt-2 text-[16px] font-extrabold text-[var(--text)]">{state.payment.promptpayId || "ยังไม่ได้ตั้งค่า"}</p>
                        </div>
                      </div>
                      <div className="mt-4 rounded-md bg-[var(--surface-soft)] px-4 py-3 text-[13px] text-[var(--text-body)]">
                        หลังรับเงินแล้ว แนบสลิปไว้กับบิลเพื่อเช็กย้อนหลังได้
                      </div>
                    </div>

                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
                      <p className="text-[12px] font-semibold text-[var(--muted)]">ข้อมูลรับเงิน</p>
                      <h3 className="mt-2 text-[24px] font-extrabold text-[var(--text)]">
                        {formatCurrency(currentTotals.units > 0 ? currentTotals.total : (state.lastOrder?.total ?? 0))}
                      </h3>
                      <p className="mt-1 text-[13px] text-[var(--muted)]">
                        {state.payment.shopName || "gote"} • {currentTotals.units > 0 ? "บิลปัจจุบัน" : (state.lastOrder?.orderNumber ?? "บิลปัจจุบัน")}
                      </p>
                      <PaymentInfoBox promptpayId={state.payment.promptpayId} />
                    </div>
                  </div>
                </section>

                <section className={surfaceClass}>
                  <SectionHeading
                    eyebrow="สลิปพร้อมเพย์"
                    title="แนบสลิปในหน้าขายได้ทันที"
                    description="สลิปของบิลปัจจุบันและสลิปล่าสุด"
                  />
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                      <input
                        ref={slipInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleSlipFileChange}
                      />
                      {state.currentPaymentSlipImage ? (
                        <div className="space-y-3">
                          <div className="overflow-hidden rounded-md border border-[var(--table-line)] bg-white p-2">
                            <Image
                              src={state.currentPaymentSlipImage}
                              alt="Slip preview"
                              width={900}
                              height={1200}
                              className="h-auto w-full rounded-md object-contain"
                              unoptimized
                            />
                          </div>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={onSelectSlip}
                              className="rounded-md border border-[var(--line)] bg-white px-4 py-3 text-[13px] font-semibold text-[var(--text-body)]"
                            >
                              เปลี่ยนสลิป
                            </button>
                            <button
                              type="button"
                              onClick={removeSlip}
                              className="rounded-md bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
                            >
                              ลบสลิป
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-8 text-center">
                          <p className="text-[14px] font-semibold text-[var(--text-body)]">ยังไม่มีสลิปที่แนบไว้</p>
                          <p className="mt-1 text-[12px] text-[var(--muted)]">รองรับการอัปโหลดรูปสลิปจากแกลเลอรีหรือกล้องมือถือ</p>
                          <button
                            type="button"
                            onClick={onSelectSlip}
                            className="mt-4 rounded-md bg-[var(--sky)] px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-lift)]"
                          >
                            อัปโหลดสลิป
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                      <p className="text-[12px] font-semibold text-[var(--muted)]">สลิปล่าสุดที่ปิดบิลแล้ว</p>
                      {state.lastOrder?.paymentSlipImage ? (
                        <div className="mt-3 overflow-hidden rounded-md border border-[var(--table-line)] bg-white p-2">
                          <Image
                            src={state.lastOrder.paymentSlipImage}
                            alt="Latest payment slip"
                            width={900}
                            height={1200}
                            className="h-auto w-full rounded-md object-contain"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="mt-3 rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-8 text-center text-[13px] text-[var(--muted)]">
                          ยังไม่มีสลิปจากบิลล่าสุด
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {activeTab === "summary" ? (
              <section className={surfaceClass}>
                {!summaryAccessChecked ? (
                  <div className="rounded-lg border border-dashed border-[var(--line)] bg-white/65 px-4 py-12 text-center text-[14px] font-semibold text-[var(--muted)]">
                    กำลังตรวจสอบสิทธิ์สรุปยอด...
                  </div>
                ) : summaryProtectionEnabled && !summaryUnlocked ? (
                  <div className="mx-auto max-w-2xl rounded-lg border border-[var(--line)] bg-white p-5 sm:p-6">
                    <SectionHeading
                      eyebrow="สรุปยอดถูกล็อก"
                      title="ใส่รหัสผ่านเพื่อดูยอดขาย"
                      description="หน้าอื่นของระบบเข้าใช้งานได้ตามปกติ แต่ยอดขายรวมจะถูกซ่อนไว้จนกว่าจะปลดล็อก"
                    />
                    <form onSubmit={unlockSummary} className="mt-5 space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-[13px] font-semibold text-[var(--text-body)]">รหัสผ่านสรุปยอด</span>
                        <input
                          value={summaryPassword}
                          onChange={(event) => setSummaryPassword(event.target.value)}
                          type="password"
                          autoComplete="current-password"
                          placeholder="กรอกรหัสผ่าน"
                          className="w-full rounded-md border border-[var(--line)] bg-white px-4 py-4 text-[15px] text-[var(--text)] outline-none transition"
                        />
                      </label>
                      {summaryError ? (
                        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
                          {summaryError}
                        </div>
                      ) : null}
                      <button
                        type="submit"
                        disabled={summarySubmitting}
                        className="w-full rounded-md bg-[var(--sky)] px-4 py-4 text-[15px] font-bold text-white shadow-[var(--shadow-lift)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {summarySubmitting ? "กำลังตรวจสอบ..." : "เปิดดูสรุปยอด"}
                      </button>
                    </form>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <SectionHeading
                        eyebrow="สรุปยอดรายวัน"
                        title="ดูยอดขายแบบอ่านง่าย"
                        description="เช็กจำนวนแก้ว รายได้เครื่องดื่ม และรายได้ท็อปปิ้งในวันเดียว"
                      />
                      <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--muted)]">
                        วันที่
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={(event) => {
                            if (event.target.value) setSelectedDate(event.target.value);
                          }}
                          className="rounded-md border border-[var(--line)] bg-white px-4 py-3 text-[var(--text)] outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <SummaryCard label="จำนวนแก้วรวม" value={formatNumber(summaryStats.cups)} />
                      <SummaryCard label="รายได้เมนู" value={formatCurrency(summaryStats.menuRevenue)} />
                      <SummaryCard label="รายได้ท็อปปิ้ง" value={formatCurrency(summaryStats.toppingRevenue)} />
                      <SummaryCard label="รายได้สุทธิ" value={formatCurrency(summaryStats.totalRevenue)} highlight />
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <SalesTable title="เมนูที่ขาย" rows={summaryRows} emptyLabel="ยังไม่มีข้อมูลเมนูในวันที่เลือก" />
                      <SalesTable title="ท็อปปิ้งที่ขาย" rows={toppingRows} emptyLabel="ยังไม่มีข้อมูลท็อปปิ้งในวันที่เลือก" />
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {activeTab === "catalog" ? (
              <section className={surfaceClass}>
                <SectionHeading
                  eyebrow="จัดการเมนู"
                  title="อัปเดตเมนูขาย"
                  description="ทุกอย่างอยู่ในฟอร์มเดียว เหมาะกับการแก้เร็ว ๆ หน้าร้าน"
                />

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <form onSubmit={addMenu} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                    <h3 className="text-base font-extrabold">เพิ่มเมนูใหม่</h3>
                    <div className="mt-3 grid gap-3">
                      <input
                        value={menuDraft.name}
                        onChange={(event) => setMenuDraft((current) => ({ ...current, name: event.target.value }))}
                        placeholder="ชื่อเมนู"
                        className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                      />
                      <input
                        value={menuDraft.price}
                        onChange={(event) => setMenuDraft((current) => ({ ...current, price: event.target.value }))}
                        type="number"
                        min="0"
                        placeholder="ราคา"
                        step="0.01"
                        inputMode="decimal"
                        className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                      />
                      <input
                        value={menuDraft.color}
                        onChange={(event) => setMenuDraft((current) => ({ ...current, color: event.target.value }))}
                        type="color"
                        className="h-12 rounded-md border border-[var(--line)] px-2 py-2"
                      />
                      <MenuCategorySelect
                        name={menuDraft.name}
                        category={menuDraft.category}
                        onChange={(category) => setMenuDraft((current) => ({ ...current, category }))}
                      />
                      <MenuImagePicker
                        image={menuDraft.image}
                        crop={menuDraft.imageCrop}
                        size={menuDraft.imageSize}
                        disabled={preparingDraftImage}
                        onChange={(image) => setMenuDraft((current) => ({ ...current, image, imageCrop: null }))}
                        onCropChange={(imageCrop) => setMenuDraft((current) => ({ ...current, imageCrop }))}
                        onSizeChange={(imageSize) => setMenuDraft((current) => ({ ...current, imageSize }))}
                        onPreparingChange={setPreparingDraftImage}
                      />
                      <button type="submit" disabled={preparingDraftImage} className="rounded-md bg-[var(--sky)] px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-lift)] disabled:opacity-50">
                        เพิ่มเมนู
                      </button>
                    </div>
                  </form>

                  <form onSubmit={addTopping} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                    <h3 className="text-base font-extrabold">เพิ่มท็อปปิ้งใหม่</h3>
                    <div className="mt-3 grid gap-3">
                      <input
                        value={toppingDraft.name}
                        onChange={(event) => setToppingDraft((current) => ({ ...current, name: event.target.value }))}
                        placeholder="ชื่อท็อปปิ้ง"
                        className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                      />
                      <input
                        value={toppingDraft.price}
                        onChange={(event) => setToppingDraft((current) => ({ ...current, price: event.target.value }))}
                        type="number"
                        min="0"
                        placeholder="ราคา"
                        step="0.01"
                        inputMode="decimal"
                        className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                      />
                      <button type="submit" className="rounded-md bg-[var(--sky)] px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-lift)]">
                        เพิ่มท็อปปิ้ง
                      </button>
                    </div>
                  </form>
                </div>

                <div className="mt-5">
                  <h3 className="text-[16px] font-extrabold text-[var(--text)]">เมนูตามหมวด</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                      {catalogMenuGroups.map((group) => (
                        <div key={`catalog-${group.label}`} className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="text-[16px] font-extrabold text-[var(--text)]">{group.label}</h4>
                            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-[var(--muted)]">
                              {formatNumber(group.items.length)}
                            </span>
                          </div>
                          <div className="grid gap-3">
                            {group.items.map((menu) => (
                              <EditableMenuCard key={menu.id} item={menu} onChange={updateMenuItem} />
                            ))}
                          </div>
                        </div>
                      ))}

                    <div className="col-span-full rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className="text-[16px] font-extrabold text-[var(--text)]">ท็อปปิ้ง</h4>
                        <span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-[var(--muted)]">
                          {formatNumber(state.toppings.length)}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                        {state.toppings.map((topping) => (
                          <EditableToppingCard key={topping.id} item={topping} onChange={updateToppingItem} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "settings" ? (
              <section className={surfaceClass}>
                <SectionHeading
                  eyebrow="การรับเงิน"
                  title="ตั้งค่าร้านและพร้อมเพย์"
                  description="หน้านี้ใช้เก็บชื่อร้านและเลขพร้อมเพย์สำหรับนำไปแสดงในหน้าขายหน้าร้าน"
                />
                <button
                  type="button"
                  disabled={!hydrated}
                  onClick={downloadBackup}
                  className="mt-4 min-h-11 rounded-md border border-[var(--line)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--text-body)] disabled:opacity-50"
                >
                  ดาวน์โหลดสำเนาข้อมูล
                </button>

                <div className="mt-4 max-w-2xl rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="grid gap-3">
                    <input
                      value={shopName}
                      onChange={(event) => setShopName(event.target.value)}
                      placeholder="ชื่อร้าน"
                      className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                    />
                    <input
                      value={promptpayId}
                      onChange={(event) => setPromptpayId(event.target.value)}
                      placeholder="เบอร์พร้อมเพย์หรือเลขบัญชี"
                      className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                    />
                    <input
                      value={cupStockInput}
                      onChange={(event) => setCupStockInput(event.target.value)}
                      type="number"
                      min="0"
                      placeholder="จำนวนแก้วตั้งต้น"
                      className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                    />
                    <div className="rounded-md bg-[var(--surface-soft)] px-4 py-3 text-[13px] text-[var(--text-body)]">
                      ใช้ไปแล้ว {formatNumber(totalCupsUsed)} แก้ว • คงเหลือ {formatNumber(cupsRemaining)} แก้ว
                    </div>
                    <button
                      type="button"
                      onClick={savePaymentSettings}
                      className="rounded-md bg-[var(--sky)] px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-lift)]"
                    >
                      บันทึกการตั้งค่า
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          {activeTab === "order" ? (
            <aside aria-labelledby="menu-sales-heading" className="glass-panel min-w-0 self-start rounded-lg bg-[var(--surface)] p-4">
              <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line-soft)] pb-3">
                <h2 id="menu-sales-heading" className="text-[16px] font-extrabold text-[var(--text)]">ยอดขายแยกเมนู</h2>
                <span className="shrink-0 text-[13px] font-bold text-[var(--emerald-deep)]">
                  {formatNumber(selectedCupCount)} แก้ว
                </span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--muted)]">{selectedDate}</p>
              {selectedMenuCounts.length === 0 ? (
                <p className="py-4 text-[13px] text-[var(--muted)]">ยังไม่มีรายการขายในวันที่เลือก</p>
              ) : null}
              <ul className="divide-y divide-[var(--line-soft)]">
                {selectedMenuCounts.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0 break-words text-[13px] font-semibold text-[var(--text-body)]">{row.name}</span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-[var(--emerald-deep)]">
                      {formatNumber(row.cups)} แก้ว
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </div>

      <dialog
        ref={cartDialogRef}
        aria-labelledby="cart-heading"
        className="fixed inset-x-0 bottom-3 top-auto m-auto max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-xl backdrop:bg-slate-950/45 sm:inset-y-0"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--line-soft)] bg-[var(--surface)] px-4 py-3">
          <h2 id="cart-heading" className="text-xl font-extrabold">ดูบิลและปิดการขาย</h2>
          <button
            type="button"
            aria-label="ปิดหน้าดูบิล"
            onClick={() => cartDialogRef.current?.close()}
            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-soft)] text-lg font-bold"
          >
            ×
          </button>
        </div>
        <div className="space-y-3 p-4">
          <OrderPanel
            currentTotals={currentTotals}
            lastOrderTitle={state.lastOrder ? `บิลล่าสุด ${state.lastOrder.orderNumber}` : "ยังไม่มีบิลล่าสุด"}
            orderLines={orderLines}
            onCheckout={checkoutOrder}
            onClear={clearOrder}
            onUpdateQty={updateOrderQty}
          />
        </div>
      </dialog>

      {pendingMenu ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.48)] px-3 py-5">
          <div className="glass-panel max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg bg-[var(--surface)] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line-soft)] pb-4">
              <div>
                <p className="text-[12px] font-semibold text-[var(--muted)]">ตรวจสอบก่อนเพิ่ม</p>
                <h2 className="mt-1 text-[24px] font-extrabold leading-tight text-[var(--text)]">{pendingMenu.name}</h2>
                <p className="mt-1 text-[16px] font-bold text-[var(--sky)]">{formatCurrency(pendingMenu.price)}</p>
              </div>
              <button
                type="button"
                onClick={closeMenuConfirm}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-white text-lg font-bold text-[var(--text)]"
              >
                ×
              </button>
            </div>

            <div className="mt-4 rounded-md bg-[var(--surface-soft)] px-4 py-3">
              <p className="text-[14px] font-extrabold text-[var(--text)]">จะเพิ่มท็อปปิ้งอะไรไหม?</p>
              <p className="mt-1 text-[12px] text-[var(--muted)]">ไม่เลือกท็อปปิ้งก็ยืนยันออเดอร์ได้เลย</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-md border border-[var(--line)] bg-white p-3">
                <p className="text-[11px] font-bold text-[var(--muted)]">เครื่องดื่ม</p>
                <p className="mt-1 text-[18px] font-extrabold text-[var(--text)]">{formatCurrency(pendingTotals.menuTotal)}</p>
              </div>
              <div className="rounded-md border border-[var(--line)] bg-white p-3">
                <p className="text-[11px] font-bold text-[var(--muted)]">ท็อปปิ้ง</p>
                <p className="mt-1 text-[18px] font-extrabold text-[var(--text)]">{formatCurrency(pendingTotals.toppingTotal)}</p>
              </div>
              <div className="rounded-md border border-sky-200 bg-[var(--sky-soft)] p-3">
                <p className="text-[11px] font-bold text-sky-700">ยอดรวม</p>
                <p className="mt-1 text-[18px] font-extrabold text-[var(--text)]">{formatCurrency(pendingTotals.total)}</p>
              </div>
            </div>
            {currentTotals.units > 0 ? (
              <p className="mt-2 text-right text-[13px] font-semibold text-[var(--muted)]">
                รวมรายการในบิลก่อนหน้า {formatCurrency(pendingTotals.existingTotal)} แล้ว
              </p>
            ) : null}

            <div className="mt-4 grid gap-2">
              {activeToppings.map((item) => {
                const qty = pendingToppingQty[item.id] ?? 0;
                return (
                  <div key={`pending-${item.id}`} className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-white p-3">
                    <div>
                      <p className="text-[14px] font-extrabold text-[var(--text-body)]">{item.name}</p>
                      <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">{formatCurrency(item.price)}</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-md bg-[var(--surface-soft)] px-2 py-2">
                      <button
                        type="button"
                        onClick={() => updatePendingTopping(item.id, -1)}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] bg-white text-lg font-bold text-[var(--text)]"
                      >
                        -
                      </button>
                      <span className="min-w-6 text-center text-[14px] font-extrabold text-[var(--text)]">{formatNumber(qty)}</span>
                      <button
                        type="button"
                        onClick={() => updatePendingTopping(item.id, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] bg-white text-lg font-bold text-[var(--text)]"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={closeMenuConfirm}
                className="flex-1 rounded-md border border-[var(--line)] bg-white px-4 py-3 text-[14px] font-bold text-[var(--text-body)]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmMenuOrder}
                className="flex-1 rounded-md bg-[var(--sky)] px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-lift)]"
              >
                ยืนยันและปิดบิล
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-4 z-40 px-4 sm:hidden">
        <div className="glass-panel flex items-center gap-3 rounded-lg px-3 py-3">
          <button
            type="button"
            onClick={() => cartDialogRef.current?.showModal()}
            className="flex min-w-0 flex-1 items-center justify-between rounded-md bg-white px-4 py-3 text-left"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--muted)]">ตะกร้าปัจจุบัน</p>
              <p className="truncate text-base font-extrabold text-[var(--text)]">{formatCurrency(currentTotals.total)}</p>
            </div>
            <span className="rounded-md bg-[var(--surface-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--text)]">
              {formatNumber(currentTotals.units)}
            </span>
          </button>
          <button
            type="button"
            onClick={checkoutOrder}
            className="shrink-0 rounded-md bg-[var(--sky)] px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-lift)]"
          >
            ปิดบิล
          </button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-24 z-30 px-4 sm:hidden">
        <div className="glass-panel grid grid-cols-4 gap-2 rounded-lg p-2">
          {tabs.map((tab) => (
            <button
              key={`mobile-${tab.key}`}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-md px-2 py-3 text-center text-[11px] font-bold leading-tight transition ${
                activeTab === tab.key ? "bg-[var(--sky)] text-white" : "bg-white text-[var(--text-body)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`pointer-events-none fixed bottom-40 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-3 text-[13px] font-semibold shadow-xl transition sm:bottom-24 ${
          toast.tone === "success" ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"
        } ${
          toast.show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {toast.message}
      </div>
    </main>
  );
}

function SectionHeading(props: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-[var(--muted)]">{props.eyebrow}</p>
      <h2 className="mt-1 text-[22px] font-extrabold leading-tight text-[var(--text)] sm:text-[24px]">{props.title}</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">{props.description}</p>
    </div>
  );
}

function PaymentInfoBox(props: { promptpayId: string }) {
  return (
    <div className="mt-4 rounded-md border border-[var(--table-line)] bg-white p-4">
      <div className="mx-auto flex aspect-square max-w-[260px] flex-col items-center justify-center rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-soft)] p-5 text-center">
        <p className="text-[13px] font-bold text-[var(--text)]">รูป QR ยังไม่ได้แนบ</p>
        <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">ใช้เลขพร้อมเพย์ด้านล่าง หรือเพิ่มรูป QR ในภายหลัง</p>
      </div>
      <div className="mt-4 rounded-md bg-[var(--sky-soft)] px-4 py-3 text-center">
        <p className="text-[12px] font-semibold text-[var(--muted)]">พร้อมเพย์</p>
        <p className="mt-1 text-[18px] font-extrabold text-[var(--text)]">{props.promptpayId || "ยังไม่ได้ตั้งค่า"}</p>
      </div>
    </div>
  );
}

function inferMenuCategory(name: string): MenuCategory {
  const normalizedName = name.normalize("NFC").replaceAll("เเ", "แ").toLocaleLowerCase("th-TH");
  if (/มัท|matcha/.test(normalizedName)) return "มัทฉะ";
  if (/กาแฟ|อเมริกาโน|เอสเพรสโซ|คาปูชิโน|มอคค่า|มอคคา|มัคคิอาโต|coffee|americano|espresso|cappuccino|mocha|macchiato|cold brew/.test(normalizedName)) {
    return "กาแฟ";
  }
  return normalizedName.includes("ชา") ? "ชา" : "นม";
}

function groupMenusByCategory(items: MenuItem[]) {
  const groups: Record<MenuCategory, MenuItem[]> = { ชา: [], นม: [], มัทฉะ: [], กาแฟ: [] };
  for (const item of items) {
    groups[item.category ?? inferMenuCategory(item.name)].push(item);
  }
  return MENU_CATEGORIES.map((label) => ({ label, items: groups[label] }));
}

function DesktopSidebar(props: { activeTab: TabKey; currentTotals: { units: number; total: number }; onChange: (tab: TabKey) => void }) {
  return (
    <aside className="hidden h-dvh w-full border-r border-[var(--line)] bg-white px-3 py-4 shadow-[8px_0_30px_rgba(15,23,42,0.06)] lg:sticky lg:top-0 lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--line-soft)] pb-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Gote POS</p>
          <h2 className="mt-2 text-[20px] font-extrabold leading-tight text-[var(--text)]">เมนูหลัก</h2>
        </div>

        <DesktopSideNav activeTab={props.activeTab} onChange={props.onChange} />

        <div className="mt-auto rounded-lg bg-[var(--surface-soft)] p-3">
          <p className="text-[12px] font-semibold text-[var(--muted)]">บิลปัจจุบัน</p>
          <p className="mt-2 text-[19px] font-extrabold text-[var(--text)]">{formatCurrency(props.currentTotals.total)}</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">{formatNumber(props.currentTotals.units)} รายการในบิล</p>
        </div>
      </div>
    </aside>
  );
}

function DesktopSideNav(props: { activeTab: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <nav className="mt-5">
      <div className="grid gap-2">
        {tabs.map((tab) => (
          <button
            key={`desktop-${tab.key}`}
            type="button"
            onClick={() => props.onChange(tab.key)}
            className={`flex min-h-11 items-center justify-between rounded-md px-3 py-3 text-left text-[13px] font-bold transition ${
              props.activeTab === tab.key
                ? "bg-[var(--sky)] text-white shadow-[var(--shadow-lift)]"
                : "bg-[var(--surface-soft)] text-[var(--text-body)] hover:bg-[var(--sky-soft)] hover:text-sky-800"
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-[16px]">›</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function OrderPanel(props: {
  currentTotals: { units: number; total: number };
  lastOrderTitle: string;
  orderLines: Array<{
    id: string;
    name: string;
    unitPrice: number;
    qty: number;
    type: "menu" | "topping";
    label: string;
  }>;
  onCheckout: () => void;
  onClear: () => void;
  onUpdateQty: (type: "menu" | "topping", id: string, unitPrice: number, delta: number) => void;
}) {
  return (
    <>
      <section className="glass-panel rounded-lg bg-[var(--surface)] p-3">
        <p className="text-[12px] font-semibold text-[var(--muted)]">บิลปัจจุบัน</p>
        <h2 className="mt-1 text-[18px] font-extrabold leading-tight text-[var(--text)]">{props.lastOrderTitle}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md bg-[var(--surface-soft)] p-3">
            <p className="text-[11px] font-semibold text-[var(--muted)]">จำนวน</p>
            <p className="mt-1 text-[20px] font-extrabold text-[var(--text)]">{formatNumber(props.currentTotals.units)}</p>
          </div>
          <div className="rounded-md bg-[var(--sky-soft)] p-3">
            <p className="text-[11px] font-semibold text-[var(--muted)]">ยอดรวม</p>
            <p className="mt-1 text-[20px] font-extrabold text-[var(--text)]">{formatCurrency(props.currentTotals.total)}</p>
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-lg bg-[var(--surface)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-[var(--muted)]">รายการในบิล</p>
            <h3 className="mt-1 text-[15px] font-extrabold text-[var(--text)]">เพิ่มลดจำนวนได้ทันที</h3>
          </div>
          <span className="rounded-md bg-[var(--surface-soft)] px-3 py-2 text-[12px] font-bold text-[var(--text)]">
            {formatNumber(props.orderLines.length)} แถว
          </span>
        </div>

      <div className="mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
        {props.orderLines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-4 py-8 text-center text-sm text-[var(--muted)]">
            ยังไม่มีรายการในบิล แตะเมนูเพื่อเริ่มขาย
          </div>
        ) : (
          props.orderLines.map((item) => (
            <article key={`${item.type}-${item.id}-${item.unitPrice}`} className="rounded-lg border border-[var(--table-line)] bg-[var(--surface)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-bold text-[var(--text-body)]">{item.name}</p>
                  <p className="mt-1 text-[12px] text-[var(--muted)]">
                    {item.label} • {formatCurrency(item.unitPrice)} / รายการ
                  </p>
                </div>
                <p className="text-[13px] font-bold text-[var(--text)]">{formatCurrency(getLineTotal(item.unitPrice, item.qty))}</p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-3 rounded-md bg-[var(--surface-soft)] px-2 py-2">
                  <button
                    type="button"
                    onClick={() => props.onUpdateQty(item.type, item.id, item.unitPrice, -1)}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] bg-white text-lg font-bold text-[var(--text)]"
                  >
                    -
                  </button>
                  <span className="min-w-6 text-center text-[13px] font-semibold">{formatNumber(item.qty)}</span>
                  <button
                    type="button"
                    onClick={() => props.onUpdateQty(item.type, item.id, item.unitPrice, 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] bg-white text-lg font-bold text-[var(--text)]"
                  >
                    +
                  </button>
                </div>
                <span className="inline-flex shrink-0 rounded-md bg-[var(--emerald-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--emerald-deep)] ring-1 ring-emerald-100">
                  {item.label}
                </span>
              </div>
            </article>
          ))
        )}
      </div>
      </section>

      <section className="glass-panel rounded-lg bg-[var(--surface)] p-3">
        <div className="flex items-center justify-between text-[13px] text-[var(--muted)]">
          <span>รวมทั้งหมด</span>
          <span>{formatNumber(props.currentTotals.units)} รายการ</span>
        </div>
        <div className="mt-2 text-[24px] font-extrabold text-[var(--text)]">{formatCurrency(props.currentTotals.total)}</div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={props.onClear}
            className="flex-1 rounded-md border border-[var(--line)] bg-white px-4 py-3 text-[13px] font-semibold text-[var(--text-body)]"
          >
            ล้างบิล
          </button>
          <button
            type="button"
            onClick={props.onCheckout}
            className="flex-1 rounded-md bg-[var(--sky)] px-4 py-3 text-[14px] font-bold text-white shadow-[var(--shadow-lift)]"
          >
            ปิดบิล
          </button>
        </div>
      </section>
    </>
  );
}

function StatChip(props: { label: string; value: string; tone: "sky" | "emerald" | "violet" | "slate" | "amber" | "rose" }) {
  const toneMap = {
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
  } as const;

  return (
    <div className="min-h-[64px] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5">
      <div className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ${toneMap[props.tone]}`}>{props.label}</div>
      <p className="mt-2 text-[18px] font-extrabold leading-none text-[var(--text)]">{props.value}</p>
    </div>
  );
}

function SummaryCard(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        props.highlight
          ? "border-sky-200 bg-sky-50 text-sky-900"
          : "border-[var(--line)] bg-[var(--surface)] text-[var(--text)]"
      }`}
    >
      <p className={`text-[12px] font-semibold ${props.highlight ? "text-sky-700" : "text-[var(--muted)]"}`}>
        {props.label}
      </p>
      <p className="mt-3 text-[24px] font-extrabold">{props.value}</p>
    </div>
  );
}

function SalesTable(props: {
  title: string;
  emptyLabel: string;
  rows: Array<{ name: string; cupsSold: number; unitPriceAtSale: number; revenue: number }>;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <h3 className="text-[16px] font-bold text-[var(--text)]">{props.title}</h3>
      {props.rows.length === 0 ? (
        <p className="mt-4 rounded-md bg-[var(--surface-soft)] px-4 py-6 text-center text-[13px] text-[var(--muted)]">{props.emptyLabel}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {props.rows
            .slice()
            .sort((a, b) => b.cupsSold - a.cupsSold || b.revenue - a.revenue)
            .map((row) => (
              <div key={`${props.title}-${row.name}`} className="rounded-md border border-[var(--table-line)] bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold text-[var(--text-body)]">{row.name}</p>
                    <p className="mt-1 text-[12px] text-[var(--muted)]">{formatCurrency(row.unitPriceAtSale)} / รายการ</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-[var(--text)]">{formatNumber(row.cupsSold)} ชิ้น</p>
                    <p className="mt-1 text-[12px] text-[var(--muted)]">{formatCurrency(row.revenue)}</p>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function EditableMenuCard(props: { item: MenuItem; onChange: (id: string, patch: Partial<MenuItem>) => void }) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-bold text-[var(--text-body)]">{props.item.name}</p>
          <p className="text-[13px] text-[var(--muted)]">{formatCurrency(props.item.price)}</p>
        </div>
        <span className={`inline-flex shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${props.item.active ? "bg-[var(--emerald-soft)] text-[var(--emerald-deep)] ring-emerald-100" : "bg-[var(--amber-soft)] text-[var(--amber-deep)] ring-amber-100"}`}>
          {props.item.active ? "เปิดขาย" : "ปิดขาย"}
        </span>
      </div>
      <div className="mt-3 grid gap-3">
        <MenuImagePicker
          image={props.item.image}
          crop={props.item.imageCrop}
          size={props.item.imageSize}
          menuName={props.item.name}
          onChange={(image) => props.onChange(props.item.id, { image, imageCrop: null })}
          onCropChange={(imageCrop) => props.onChange(props.item.id, { imageCrop })}
          onSizeChange={(imageSize) => props.onChange(props.item.id, { imageSize })}
        />
        <input
          value={props.item.name}
          onChange={(event) => props.onChange(props.item.id, { name: event.target.value })}
          className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={props.item.price}
          onChange={(event) => props.onChange(props.item.id, { price: getLineTotal(Math.max(0, event.currentTarget.valueAsNumber || 0), 1) })}
          className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
        />
        <MenuCategorySelect
          name={props.item.name}
          category={props.item.category}
          onChange={(category) => props.onChange(props.item.id, { category })}
        />
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={props.item.color}
            onChange={(event) => props.onChange(props.item.id, { color: normalizeHexColor(event.target.value) })}
            className="h-12 w-16 rounded-md border border-[var(--line)] p-1"
          />
          <label className="flex items-center gap-3 text-[13px] font-semibold text-[var(--text)]">
            <input
              type="checkbox"
              checked={props.item.active}
              onChange={(event) => props.onChange(props.item.id, { active: event.target.checked })}
              className="h-5 w-5 rounded"
            />
            เปิดขายเมนูนี้
          </label>
        </div>
      </div>
    </article>
  );
}

function MenuCategorySelect({ name, category, onChange }: {
  name: string;
  category?: MenuCategory;
  onChange: (category?: MenuCategory) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-[var(--text)]">
      หมวดเมนู
      <select
        value={category ?? ""}
        onChange={(event) => onChange(MENU_CATEGORIES.find((option) => option === event.target.value))}
        className="min-h-11 min-w-0 rounded-md border border-[var(--line)] bg-white px-2 text-[14px]"
      >
        <option value="">{name.trim() ? `ตามชื่อ (${inferMenuCategory(name)})` : "ตามชื่อเมนู"}</option>
        {MENU_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function MenuImagePicker({ image, crop, size = MENU_IMAGE_SIZE.initial, menuName, disabled = false, onChange, onCropChange, onSizeChange, onPreparingChange }: {
  image?: string | null;
  crop?: MenuImageCrop | null;
  size?: number;
  menuName?: string;
  disabled?: boolean;
  onChange: (image: string | null) => void;
  onCropChange: (crop: MenuImageCrop | null) => void;
  onSizeChange: (size: number) => void;
  onPreparingChange?: (preparing: boolean) => void;
}) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [cropping, setCropping] = useState(false);
  const busy = disabled || preparing;

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setPreparing(true);
    onPreparingChange?.(true);
    setError("");
    const objectUrl = URL.createObjectURL(file);

    try {
      const source = new window.Image();
      source.src = objectUrl;
      await source.decode();

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context || !source.naturalWidth || !source.naturalHeight) throw new Error("Cannot prepare menu image");

      for (const [maxSide, quality] of [[560, 0.82], [480, 0.68], [360, 0.6]]) {
        const scale = Math.min(1, maxSide / Math.max(source.naturalWidth, source.naturalHeight));
        canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        const photo = canvas.toDataURL("image/jpeg", quality);
        if (photo.startsWith("data:image/jpeg;base64,") && photo.length <= MAX_MENU_IMAGE_LENGTH) {
          onChange(photo);
          return;
        }
      }
      throw new Error("Cannot encode menu image");
    } catch {
      setError("เปิดรูปนี้ไม่ได้ ลองเลือกไฟล์ JPG หรือ PNG");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setPreparing(false);
      onPreparingChange?.(false);
    }
  }

  return (
    <div>
      {image ? <MenuPhoto image={image} size={size} crop={crop} /> : null}
      <div className={image ? "mt-2 flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-2"}>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--text-body)] focus-within:ring-2 focus-within:ring-[var(--sky)] has-[:disabled]:opacity-50">
          {busy ? "กำลังเตรียมรูป…" : image ? "เปลี่ยนรูป" : "ใส่รูปเมนู"}
          <input
            type="file"
            accept="image/*"
            aria-label={menuName ? `เลือกรูปสำหรับ ${menuName}` : "เลือกรูปสำหรับเมนูใหม่"}
            disabled={busy}
            onChange={selectImage}
            className="sr-only"
          />
        </label>
        {image ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setCropping(true)}
            className="min-h-11 rounded-md border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--sky)] disabled:opacity-50"
          >
            ครอปรูป
          </button>
        ) : null}
        {image ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              onChange(null);
            }}
            className="min-h-11 rounded-md px-2 text-[13px] font-semibold text-[var(--rose-deep)] disabled:opacity-50"
          >
            ลบรูป
          </button>
        ) : null}
      </div>
      {image ? (
        <label className="mt-2 grid min-w-0 gap-1 text-[13px] font-semibold text-[var(--text)]">
          <span>ขนาดรูป <span className="font-normal text-[var(--muted)]">{size} px</span></span>
          <input
            type="range"
            min={MENU_IMAGE_SIZE.min}
            max={MENU_IMAGE_SIZE.max}
            value={size}
            disabled={busy}
            onChange={(event) => onSizeChange(event.currentTarget.valueAsNumber)}
            className="h-8 w-full min-w-0 cursor-pointer accent-[var(--sky)]"
          />
        </label>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-[13px] text-[var(--rose-deep)]">{error}</p> : null}
      {image && cropping ? (
        <MenuImageCropper image={image} crop={crop} onSave={onCropChange} onClose={() => setCropping(false)} />
      ) : null}
    </div>
  );
}

function EditableToppingCard(props: { item: ToppingItem; onChange: (id: string, patch: Partial<ToppingItem>) => void }) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-bold text-[var(--text-body)]">{props.item.name}</p>
          <p className="text-[13px] text-[var(--muted)]">{formatCurrency(props.item.price)}</p>
        </div>
        <span className={`inline-flex shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${props.item.active ? "bg-[var(--emerald-soft)] text-[var(--emerald-deep)] ring-emerald-100" : "bg-[var(--amber-soft)] text-[var(--amber-deep)] ring-amber-100"}`}>
          {props.item.active ? "เปิดขาย" : "ปิดขาย"}
        </span>
      </div>
      <div className="mt-3 grid gap-3">
        <input
          value={props.item.name}
          onChange={(event) => props.onChange(props.item.id, { name: event.target.value })}
          className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={props.item.price}
          onChange={(event) => props.onChange(props.item.id, { price: getLineTotal(Math.max(0, event.currentTarget.valueAsNumber || 0), 1) })}
          className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
        />
        <label className="flex items-center gap-3 text-[13px] font-semibold text-[var(--text)]">
          <input
            type="checkbox"
            checked={props.item.active}
            onChange={(event) => props.onChange(props.item.id, { active: event.target.checked })}
            className="h-5 w-5 rounded"
          />
          เปิดขายท็อปปิ้งนี้
        </label>
      </div>
    </article>
  );
}

function enrichSales(
  items: DailySale["items"],
  sourceList: Array<MenuItem | ToppingItem>,
  fallbackName: string,
) {
  return items
    .map((item) => {
      const source = sourceList.find((entry) => entry.id === item.menuId);
      return {
        ...item,
        name: source?.name ?? fallbackName,
        revenue: getLineTotal(item.unitPriceAtSale, item.cupsSold),
      };
    })
    .filter((item) => item.cupsSold > 0);
}

function mergeOrderIntoSales(sales: DailySale[], date: string, order: PosState["currentOrder"]) {
  const sale = sales.find((entry) => entry.date === date) ?? { date, items: [], toppings: [] };
  const nextSale: DailySale = {
    date,
    items: mergeSaleLines(sale.items, order.items),
    toppings: mergeSaleLines(sale.toppings, order.toppings),
  };

  const existingIndex = sales.findIndex((entry) => entry.date === date);
  if (existingIndex >= 0) {
    return sales.map((entry, index) => (index === existingIndex ? nextSale : entry));
  }

  return [...sales, nextSale];
}

function createCatalogItemId() {
  const values = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
}

function upsertOrderLine(
  lines: PosState["currentOrder"]["items"],
  nextLine: PosState["currentOrder"]["items"][number],
) {
  const existing = lines.find((line) => line.id === nextLine.id && line.unitPrice === nextLine.unitPrice);
  if (existing) {
    return lines.map((line) => (line === existing ? { ...line, qty: line.qty + nextLine.qty } : line));
  }

  return [...lines, nextLine];
}
