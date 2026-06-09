"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  STATE_API_ENDPOINT,
  STORAGE_KEY,
  type DailySale,
  type MenuItem,
  type PosState,
  type ToppingItem,
  createDefaultState,
  createEmptyOrder,
  createOrderNumber,
  formatCurrency,
  formatNumber,
  getToday,
  normalizeHexColor,
  normalizeState,
} from "@/lib/pos-data";

type TabKey = "order" | "summary" | "catalog" | "settings";

type ToastState = { show: boolean; message: string };

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "order", label: "ขายหน้าร้าน" },
  { key: "summary", label: "สรุปยอด" },
  { key: "catalog", label: "เมนูขาย" },
  { key: "settings", label: "ตั้งค่า" },
];

export function PosApp() {
  const [state, setState] = useState<PosState>(createDefaultState);
  const [activeTab, setActiveTab] = useState<TabKey>("order");
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [menuDraft, setMenuDraft] = useState({ name: "", price: "", color: "#d3a992" });
  const [toppingDraft, setToppingDraft] = useState({ name: "", price: "" });
  const [shopName, setShopName] = useState(state.payment.shopName);
  const [promptpayId, setPromptpayId] = useState(state.payment.promptpayId);
  const [hydrated, setHydrated] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: "" });
  const persistTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let ignore = false;

    const loadState = async () => {
      try {
        const response = await fetch(STATE_API_ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load state from server");
        }

        const normalized = normalizeState(await response.json());
        if (ignore) {
          return;
        }

        setState(normalized);
        setShopName(normalized.payment.shopName);
        setPromptpayId(normalized.payment.promptpayId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        setServerReady(true);
      } catch {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            const normalized = normalizeState(parsed);
            if (ignore) {
              return;
            }

            setState(normalized);
            setShopName(normalized.payment.shopName);
            setPromptpayId(normalized.payment.promptpayId);
          }
        } catch {
          // Keep the default seed state when both server and cache are unavailable.
        }
      } finally {
        if (!ignore) {
          setHydrated(true);
        }
      }
    };

    void loadState();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!serverReady) {
      return;
    }

    if (persistTimeoutRef.current) {
      window.clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      void fetch(STATE_API_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      }).catch(() => {
        // Keep local cache usable even if the network write fails temporarily.
      });
    }, 250);

    return () => {
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [hydrated, serverReady, state]);

  useEffect(() => {
    if (!toast.show) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast({ show: false, message: "" });
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeMenus = useMemo(() => state.menus.filter((item) => item.active), [state.menus]);
  const activeToppings = useMemo(() => state.toppings.filter((item) => item.active), [state.toppings]);

  const orderLines = useMemo(
    () => [
      ...state.currentOrder.items.map((item) => ({ ...item, label: "เมนูน้ำ" })),
      ...state.currentOrder.toppings.map((item) => ({ ...item, label: "ท็อปปิ้ง" })),
    ],
    [state.currentOrder.items, state.currentOrder.toppings],
  );

  const currentTotals = useMemo(() => {
    return [...state.currentOrder.items, ...state.currentOrder.toppings].reduce(
      (acc, item) => {
        acc.units += item.qty;
        acc.total += item.qty * item.unitPrice;
        return acc;
      },
      { units: 0, total: 0 },
    );
  }, [state.currentOrder.items, state.currentOrder.toppings]);

  const selectedSale = useMemo(() => {
    return state.sales.find((entry) => entry.date === selectedDate) ?? null;
  }, [selectedDate, state.sales]);

  const summaryRows = useMemo(() => enrichSales(selectedSale?.items ?? [], state.menus, "เมนูที่ถูกลบ"), [selectedSale, state.menus]);
  const toppingRows = useMemo(
    () => enrichSales(selectedSale?.toppings ?? [], state.toppings, "ท็อปปิ้งที่ถูกลบ"),
    [selectedSale, state.toppings],
  );

  const summaryStats = useMemo(() => {
    const menuRevenue = summaryRows.reduce((sum, item) => sum + item.revenue, 0);
    const toppingRevenue = toppingRows.reduce((sum, item) => sum + item.revenue, 0);
    const cups = summaryRows.reduce((sum, item) => sum + item.cupsSold, 0);
    return {
      cups,
      menuRevenue,
      toppingRevenue,
      totalRevenue: menuRevenue + toppingRevenue,
    };
  }, [summaryRows, toppingRows]);

  function showToast(message: string) {
    setToast({ show: true, message });
  }

  function addToOrder(type: "menu" | "topping", id: string) {
    setState((current) => {
      const sourceList = type === "menu" ? current.menus : current.toppings;
      const source = sourceList.find((item) => item.id === id && item.active);

      if (!source) {
        return current;
      }

      const key = type === "menu" ? "items" : "toppings";
      const existing = current.currentOrder[key].find((line) => line.id === id);
      const nextLines = existing
        ? current.currentOrder[key].map((line) => (line.id === id ? { ...line, qty: line.qty + 1 } : line))
        : [...current.currentOrder[key], { id: source.id, name: source.name, unitPrice: source.price, qty: 1, type }];

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

  function updateOrderQty(type: "menu" | "topping", id: string, delta: number) {
    setState((current) => {
      const key = type === "menu" ? "items" : "toppings";
      const nextLines = current.currentOrder[key]
        .map((item) => (item.id === id ? { ...item, qty: item.qty + delta } : item))
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
    setState((current) => ({ ...current, currentOrder: createEmptyOrder() }));
  }

  function checkoutOrder() {
    if (currentTotals.units === 0) {
      showToast("กรุณาเพิ่มรายการก่อนปิดบิล");
      return;
    }

    setState((current) => {
      const date = getToday();
      const orderNumber = createOrderNumber(current.orders.length + 1);
      const orderRecord = {
        orderNumber,
        createdAt: new Date().toISOString(),
        total: currentTotals.total,
        items: structuredClone(current.currentOrder.items),
        toppings: structuredClone(current.currentOrder.toppings),
      };

      const nextSales = mergeOrderIntoSales(current.sales, date, current.currentOrder);

      return {
        ...current,
        sales: nextSales,
        orders: [orderRecord, ...current.orders],
        lastOrder: orderRecord,
        currentOrder: createEmptyOrder(),
      };
    });

    setSelectedDate(getToday());
    setActiveTab("summary");
    setIsMobileCartOpen(false);
    showToast("ปิดบิลเรียบร้อย");
  }

  function savePaymentSettings() {
    setState((current) => ({
      ...current,
      payment: {
        shopName: shopName.trim() || "gote",
        promptpayId: promptpayId.trim(),
      },
    }));
    showToast("บันทึกการตั้งค่าแล้ว");
  }

  function addMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(menuDraft.price);

    if (!menuDraft.name.trim() || Number.isNaN(price) || price < 0) {
      showToast("กรอกชื่อเมนูและราคาให้ครบ");
      return;
    }

    setState((current) => ({
      ...current,
      menus: [
        ...current.menus,
        {
          id: crypto.randomUUID(),
          name: menuDraft.name.trim(),
          price,
          color: normalizeHexColor(menuDraft.color),
          active: true,
        },
      ],
    }));

    setMenuDraft({ name: "", price: "", color: "#d3a992" });
    showToast("เพิ่มเมนูแล้ว");
  }

  function addTopping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(toppingDraft.price);

    if (!toppingDraft.name.trim() || Number.isNaN(price) || price < 0) {
      showToast("กรอกชื่อท็อปปิ้งและราคาให้ครบ");
      return;
    }

    setState((current) => ({
      ...current,
      toppings: [
        ...current.toppings,
        {
          id: crypto.randomUUID(),
          name: toppingDraft.name.trim(),
          price,
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

  const surfaceClass = "glass-panel fade-up rounded-lg bg-[var(--surface)] p-3 sm:p-4";

  return (
    <main className="relative min-h-screen overflow-x-hidden pb-44 sm:pb-32">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
        <section className="glass-panel fade-up rounded-lg px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Gote Sales Dashboard</p>
              <h1 className="mt-2 text-[28px] font-extrabold leading-tight text-[var(--text)] sm:text-[32px]">
                ระบบขายสินค้าและสรุปยอดประจำวัน
              </h1>
              <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--muted)]">
                จัดการออเดอร์หน้าร้าน คำนวณจำนวนสินค้า และตรวจยอดขายได้เร็วในหน้าจอเดียว โดยเน้นการใช้งานจริงทุกวัน
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:min-w-[420px] lg:max-w-[520px]">
              <StatChip label="จำนวนในบิล" value={formatNumber(currentTotals.units)} tone="sky" />
              <StatChip label="ยอดบิลปัจจุบัน" value={formatCurrency(currentTotals.total)} tone="emerald" />
              <StatChip label="จำนวนสินค้า" value={formatNumber(activeMenus.length)} tone="violet" />
              <StatChip label="จำนวนท็อปปิ้ง" value={formatNumber(activeToppings.length)} tone="slate" />
            </div>
          </div>
        </section>

        <nav className="glass-panel fade-up grid grid-cols-2 gap-2 rounded-lg p-2 sm:flex sm:overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative min-h-10 rounded-md px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition ${
                activeTab === tab.key
                  ? "bg-sky-50 text-sky-700"
                  : "bg-transparent text-slate-600 hover:bg-sky-50 hover:text-sky-700"
              }`}
            >
              {activeTab === tab.key ? <span className="absolute inset-y-1 left-0 w-1 rounded-r-md bg-sky-600" /> : null}
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="glass-panel fade-up rounded-lg p-4 sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[var(--muted)]">บิลปัจจุบัน</p>
              <p className="mt-1 text-[24px] font-extrabold text-[var(--text)]">{formatCurrency(currentTotals.total)}</p>
              <p className="mt-1 text-[13px] text-[var(--muted)]">{formatNumber(currentTotals.units)} รายการในตะกร้า</p>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(true)}
              className="rounded-md bg-sky-600 px-4 py-3 text-[13px] font-semibold text-white"
            >
              ดูบิล
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]">
          <div className="space-y-4">
            {activeTab === "order" ? (
              <>
                <section className={surfaceClass}>
                  <SectionHeading
                    eyebrow="เลือกเมนู"
                    title="แตะเพื่อเพิ่มลงบิล"
                    description="หน้าเมนูถูกออกแบบให้กดง่ายบนมือถือ แม้ตอนคนต่อคิวเยอะ"
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {activeMenus.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addToOrder("menu", item.id)}
                        className="min-h-[96px] rounded-lg border border-[var(--line)] bg-white px-4 py-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
                        style={{ boxShadow: `inset 4px 0 0 ${item.color}` }}
                      >
                        <span className="block text-[15px] font-bold leading-snug text-[var(--text-body)]">{item.name}</span>
                        <span className="mt-3 block text-[13px] font-semibold text-[var(--muted)]">{formatCurrency(item.price)}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className={surfaceClass}>
                  <SectionHeading
                    eyebrow="เพิ่มท็อปปิ้ง"
                    title="ตัวเลือกเสริม"
                    description="แตะเพิ่มได้ทันทีโดยไม่ต้องออกจากหน้าขาย"
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {activeToppings.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addToOrder("topping", item.id)}
                        className="rounded-lg border border-[var(--line)] bg-white px-4 py-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
                      >
                        <span className="block text-[14px] font-bold text-[var(--text-body)]">{item.name}</span>
                        <span className="mt-2 block text-[13px] text-[var(--muted)]">{formatCurrency(item.price)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {activeTab === "summary" ? (
              <section className={surfaceClass}>
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
                      onChange={(event) => setSelectedDate(event.target.value)}
                      className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-[var(--text)] outline-none"
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
              </section>
            ) : null}

            {activeTab === "catalog" ? (
              <section className={surfaceClass}>
                <SectionHeading
                  eyebrow="จัดการเมนู"
                  title="อัปเดตราคาและสถานะขาย"
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
                        className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                      />
                      <input
                        value={menuDraft.color}
                        onChange={(event) => setMenuDraft((current) => ({ ...current, color: event.target.value }))}
                        type="color"
                        className="h-12 rounded-md border border-[var(--line)] px-2 py-2"
                      />
                      <button type="submit" className="rounded-md bg-sky-600 px-4 py-3 text-[13px] font-semibold text-white">
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
                        className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
                      />
                      <button type="submit" className="rounded-md bg-sky-600 px-4 py-3 text-[13px] font-semibold text-white">
                        เพิ่มท็อปปิ้ง
                      </button>
                    </div>
                  </form>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    {state.menus.map((menu) => (
                      <EditableMenuCard key={menu.id} item={menu} onChange={updateMenuItem} />
                    ))}
                  </div>
                  <div className="space-y-3">
                    {state.toppings.map((topping) => (
                      <EditableToppingCard key={topping.id} item={topping} onChange={updateToppingItem} />
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "settings" ? (
              <section className={surfaceClass}>
                <SectionHeading
                  eyebrow="การรับเงิน"
                  title="ตั้งค่าร้านและพร้อมเพย์"
                  description="ข้อมูลนี้จะใช้แสดงข้าง QR เพื่อให้ลูกค้าเช็กยอดได้ง่าย"
                />

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
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
                      <button
                        type="button"
                        onClick={savePaymentSettings}
                        className="rounded-md bg-sky-600 px-4 py-3 text-[13px] font-semibold text-white"
                      >
                        บันทึกการตั้งค่า
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
                    <p className="text-[12px] font-semibold text-[var(--muted)]">ข้อมูลรับเงิน</p>
                    <h3 className="mt-2 text-[24px] font-extrabold text-[var(--text)]">
                      {formatCurrency(state.lastOrder?.total ?? currentTotals.total)}
                    </h3>
                    <p className="mt-1 text-[13px] text-[var(--muted)]">
                      {state.payment.shopName || "gote"} • {state.lastOrder?.orderNumber ?? "บิลยังไม่ถูกปิด"}
                    </p>
                    <div className="mt-4 overflow-hidden rounded-md border border-[var(--table-line)] bg-white p-3">
                      <Image
                        src="/assets/customer-payment-qr.jpg"
                        alt="Customer payment QR"
                        width={600}
                        height={600}
                        className="h-auto w-full rounded-md object-cover"
                        priority
                      />
                    </div>
                    <div className="mt-4 rounded-md bg-[var(--surface-soft)] px-4 py-3 text-[13px] text-[var(--text-body)]">
                      ใช้ QR นี้สำหรับรับเงินจากลูกค้า โดยยอดอ้างอิงจากบิลล่าสุดหรือยอดที่กำลังจัดอยู่
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          <aside className="hidden space-y-4 lg:block">
            <section className={`${surfaceClass} sticky top-4`}>
              <OrderPanel
                currentTotals={currentTotals}
                lastOrderTitle={state.lastOrder ? `บิลล่าสุด ${state.lastOrder.orderNumber}` : "ยังไม่มีบิลล่าสุด"}
                orderLines={orderLines}
                onCheckout={checkoutOrder}
                onClear={clearOrder}
                onUpdateQty={updateOrderQty}
              />
            </section>
          </aside>
        </div>
      </div>

      {isMobileCartOpen ? (
        <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.45)] px-3 py-3 sm:hidden">
          <div className="flex h-full flex-col justify-end">
            <div className="glass-panel max-h-[85vh] overflow-hidden rounded-lg bg-[var(--surface)]">
              <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-4">
                <div>
                  <p className="text-[12px] font-semibold text-[var(--muted)]">บิลปัจจุบัน</p>
                  <h3 className="mt-1 text-xl font-extrabold text-[var(--text)]">ดูบิลและปิดการขาย</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileCartOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-soft)] text-lg font-bold text-[var(--text)]"
                >
                  ×
                </button>
              </div>
              <div className="max-h-[calc(85vh-88px)] overflow-y-auto p-4">
                <OrderPanel
                  currentTotals={currentTotals}
                  lastOrderTitle={state.lastOrder ? `บิลล่าสุด ${state.lastOrder.orderNumber}` : "ยังไม่มีบิลล่าสุด"}
                  orderLines={orderLines}
                  onCheckout={checkoutOrder}
                  onClear={clearOrder}
                  onUpdateQty={updateOrderQty}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-4 z-40 px-4 sm:hidden">
        <div className="glass-panel flex items-center gap-3 rounded-lg px-3 py-3">
          <button
            type="button"
            onClick={() => setIsMobileCartOpen(true)}
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
            className="shrink-0 rounded-md bg-sky-600 px-4 py-3 text-[13px] font-semibold text-white"
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
              className={`rounded-md px-2 py-3 text-center text-[11px] font-semibold leading-tight transition ${
                activeTab === tab.key ? "bg-sky-50 text-sky-700" : "bg-white text-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`pointer-events-none fixed bottom-40 left-1/2 z-50 -translate-x-1/2 rounded-md bg-slate-900 px-4 py-3 text-[13px] font-semibold text-white shadow-xl transition sm:bottom-24 ${
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
      <h2 className="mt-1 text-[24px] font-extrabold leading-tight text-[var(--text)]">{props.title}</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">{props.description}</p>
    </div>
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
  onUpdateQty: (type: "menu" | "topping", id: string, delta: number) => void;
}) {
  return (
    <>
      <SectionHeading
        eyebrow="บิลปัจจุบัน"
        title={props.lastOrderTitle}
        description="รายการที่เพิ่มจะขึ้นทันทีตรงนี้ พร้อมปุ่มเพิ่มลดจำนวนแบบกดง่าย"
      />

      <div className="mt-4 space-y-3">
        {props.orderLines.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-white/70 px-4 py-8 text-center text-sm text-[var(--muted)]">
            ยังไม่มีรายการในบิล แตะเมนูเพื่อเริ่มขาย
          </div>
        ) : (
          props.orderLines.map((item) => (
            <article key={`${item.type}-${item.id}`} className="rounded-lg border border-[var(--table-line)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-bold text-[var(--text-body)]">{item.name}</p>
                  <p className="mt-1 text-[12px] text-[var(--muted)]">
                    {item.label} • {formatCurrency(item.unitPrice)} / รายการ
                  </p>
                </div>
                <p className="text-[13px] font-bold text-[var(--text)]">{formatCurrency(item.unitPrice * item.qty)}</p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-3 rounded-md bg-[var(--surface-soft)] px-2 py-2">
                  <button
                    type="button"
                    onClick={() => props.onUpdateQty(item.type, item.id, -1)}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-white text-lg font-bold text-[var(--text)]"
                  >
                    -
                  </button>
                  <span className="min-w-6 text-center text-[13px] font-semibold">{formatNumber(item.qty)}</span>
                  <button
                    type="button"
                    onClick={() => props.onUpdateQty(item.type, item.id, 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-white text-lg font-bold text-[var(--text)]"
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

      <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-4">
        <div className="flex items-center justify-between text-[13px] text-[var(--muted)]">
          <span>รวมทั้งหมด</span>
          <span>{formatNumber(props.currentTotals.units)} รายการ</span>
        </div>
        <div className="mt-2 text-[28px] font-extrabold text-[var(--text)]">{formatCurrency(props.currentTotals.total)}</div>
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
            className="flex-1 rounded-md bg-sky-600 px-4 py-3 text-[13px] font-semibold text-white"
          >
            ปิดบิล
          </button>
        </div>
      </div>
    </>
  );
}

function StatChip(props: { label: string; value: string; tone: "sky" | "emerald" | "violet" | "slate" }) {
  const toneMap = {
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  } as const;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${toneMap[props.tone]}`}>{props.label}</div>
      <p className="mt-3 text-[24px] font-extrabold text-[var(--text)]">{props.value}</p>
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
        <input
          value={props.item.name}
          onChange={(event) => props.onChange(props.item.id, { name: event.target.value })}
          className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
        />
        <input
          type="number"
          min="0"
          value={props.item.price}
          onChange={(event) => props.onChange(props.item.id, { price: Number(event.target.value) || 0 })}
          className="rounded-md border border-[var(--line)] px-4 py-3 text-[14px] outline-none"
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
          value={props.item.price}
          onChange={(event) => props.onChange(props.item.id, { price: Number(event.target.value) || 0 })}
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
        revenue: item.cupsSold * item.unitPriceAtSale,
      };
    })
    .filter((item) => item.cupsSold > 0);
}

function mergeOrderIntoSales(sales: DailySale[], date: string, order: PosState["currentOrder"]) {
  const sale = sales.find((entry) => entry.date === date) ?? { date, items: [], toppings: [] };
  const nextSale: DailySale = {
    date,
    items: mergeLineList(sale.items, order.items),
    toppings: mergeLineList(sale.toppings, order.toppings),
  };

  const existingIndex = sales.findIndex((entry) => entry.date === date);
  if (existingIndex >= 0) {
    return sales.map((entry, index) => (index === existingIndex ? nextSale : entry));
  }

  return [...sales, nextSale];
}

function mergeLineList(existing: DailySale["items"], lines: PosState["currentOrder"]["items"]) {
  const merged = [...existing];

  lines.forEach((line) => {
    const found = merged.find((item) => item.menuId === line.id && item.unitPriceAtSale === line.unitPrice);
    if (found) {
      found.cupsSold += line.qty;
      return;
    }

    merged.push({
      menuId: line.id,
      cupsSold: line.qty,
      unitPriceAtSale: line.unitPrice,
    });
  });

  return merged;
}
