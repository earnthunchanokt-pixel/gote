"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
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
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [menuDraft, setMenuDraft] = useState({ name: "", price: "", color: "#d3a992" });
  const [toppingDraft, setToppingDraft] = useState({ name: "", price: "" });
  const [shopName, setShopName] = useState(state.payment.shopName);
  const [promptpayId, setPromptpayId] = useState(state.payment.promptpayId);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: "" });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const normalized = normalizeState(parsed);
        setState(normalized);
        setShopName(normalized.payment.shopName);
        setPromptpayId(normalized.payment.promptpayId);
      }
    } catch {
      // Keep the default seed state when the browser copy is not readable.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

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

  const surfaceClass =
    "glass-panel rounded-[28px] border border-white/40 bg-[var(--surface)] p-4 sm:p-5 fade-up";

  return (
    <main className="relative min-h-screen overflow-x-hidden pb-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_60%)]" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <section className="hero-glow fade-up overflow-hidden rounded-[34px] bg-[linear-gradient(135deg,#ffbb5d_0%,#f57b51_60%,#dd6b38_100%)] px-5 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Gote Mobile POS</p>
              <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">ขายหน้าร้านง่ายขึ้นบนมือถือ</h1>
              <p className="mt-3 max-w-lg text-sm leading-6 text-white/85 sm:text-base">
                รับออเดอร์, ปิดบิล, เช็กยอดรายวัน และดู QR รับเงินได้ในหน้าเดียว ออกแบบให้ใช้งานนิ้วเดียวได้สบาย
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-[26px] bg-white/14 p-3 backdrop-blur">
              <StatChip label="รายการในบิล" value={formatNumber(currentTotals.units)} />
              <StatChip label="ยอดรวมตอนนี้" value={formatCurrency(currentTotals.total)} />
              <StatChip label="เมนูขายอยู่" value={formatNumber(activeMenus.length)} />
              <StatChip label="ท็อปปิ้งขายอยู่" value={formatNumber(activeToppings.length)} />
            </div>
          </div>
        </section>

        <nav className="fade-up flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-3 text-sm font-bold whitespace-nowrap transition ${
                activeTab === tab.key
                  ? "bg-[#2f241f] text-white shadow-lg"
                  : "glass-panel bg-white/60 text-[var(--text)] hover:bg-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

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
                        className="min-h-28 rounded-[24px] px-4 py-4 text-left text-white shadow-lg transition hover:-translate-y-0.5"
                        style={{ background: `linear-gradient(135deg, ${item.color}, ${mixColor(item.color)})` }}
                      >
                        <span className="block text-base font-extrabold leading-snug">{item.name}</span>
                        <span className="mt-3 block text-sm font-semibold text-white/85">{formatCurrency(item.price)}</span>
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
                        className="rounded-[22px] border border-[var(--line)] bg-white px-4 py-4 text-left shadow-sm transition hover:border-[#f2a161]"
                      >
                        <span className="block text-sm font-bold text-[var(--text)]">{item.name}</span>
                        <span className="mt-2 block text-sm text-[var(--muted)]">{formatCurrency(item.price)}</span>
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
                  <form onSubmit={addMenu} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                    <h3 className="text-base font-extrabold">เพิ่มเมนูใหม่</h3>
                    <div className="mt-3 grid gap-3">
                      <input
                        value={menuDraft.name}
                        onChange={(event) => setMenuDraft((current) => ({ ...current, name: event.target.value }))}
                        placeholder="ชื่อเมนู"
                        className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
                      />
                      <input
                        value={menuDraft.price}
                        onChange={(event) => setMenuDraft((current) => ({ ...current, price: event.target.value }))}
                        type="number"
                        min="0"
                        placeholder="ราคา"
                        className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
                      />
                      <input
                        value={menuDraft.color}
                        onChange={(event) => setMenuDraft((current) => ({ ...current, color: event.target.value }))}
                        type="color"
                        className="h-12 rounded-2xl border border-[var(--line)] px-2 py-2"
                      />
                      <button type="submit" className="rounded-2xl bg-[#2f241f] px-4 py-3 font-bold text-white">
                        เพิ่มเมนู
                      </button>
                    </div>
                  </form>

                  <form onSubmit={addTopping} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                    <h3 className="text-base font-extrabold">เพิ่มท็อปปิ้งใหม่</h3>
                    <div className="mt-3 grid gap-3">
                      <input
                        value={toppingDraft.name}
                        onChange={(event) => setToppingDraft((current) => ({ ...current, name: event.target.value }))}
                        placeholder="ชื่อท็อปปิ้ง"
                        className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
                      />
                      <input
                        value={toppingDraft.price}
                        onChange={(event) => setToppingDraft((current) => ({ ...current, price: event.target.value }))}
                        type="number"
                        min="0"
                        placeholder="ราคา"
                        className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
                      />
                      <button type="submit" className="rounded-2xl bg-[#2f241f] px-4 py-3 font-bold text-white">
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
                  <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                    <div className="grid gap-3">
                      <input
                        value={shopName}
                        onChange={(event) => setShopName(event.target.value)}
                        placeholder="ชื่อร้าน"
                        className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
                      />
                      <input
                        value={promptpayId}
                        onChange={(event) => setPromptpayId(event.target.value)}
                        placeholder="เบอร์พร้อมเพย์หรือเลขบัญชี"
                        className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
                      />
                      <button
                        type="button"
                        onClick={savePaymentSettings}
                        className="rounded-2xl bg-[#2f241f] px-4 py-3 font-bold text-white"
                      >
                        บันทึกการตั้งค่า
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[28px] bg-[linear-gradient(180deg,#fff6e7_0%,#fffdf8_100%)] p-4 shadow-[var(--shadow-soft)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Payment Preview</p>
                    <h3 className="mt-2 text-2xl font-black">{formatCurrency(state.lastOrder?.total ?? currentTotals.total)}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {state.payment.shopName || "gote"} • {state.lastOrder?.orderNumber ?? "บิลยังไม่ถูกปิด"}
                    </p>
                    <div className="mt-4 overflow-hidden rounded-[22px] bg-white p-3">
                      <Image
                        src="/assets/customer-payment-qr.jpg"
                        alt="Customer payment QR"
                        width={600}
                        height={600}
                        className="h-auto w-full rounded-[16px] object-cover"
                        priority
                      />
                    </div>
                    <div className="mt-4 rounded-[20px] bg-[#fff1dd] px-4 py-3 text-sm text-[var(--text)]">
                      ใช้ QR นี้สำหรับรับเงินจากลูกค้า โดยยอดอ้างอิงจากบิลล่าสุดหรือยอดที่กำลังจัดอยู่
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-4">
            <section className={`${surfaceClass} sticky top-4`}>
              <SectionHeading
                eyebrow="บิลปัจจุบัน"
                title={state.lastOrder ? `บิลล่าสุด ${state.lastOrder.orderNumber}` : "ยังไม่มีบิลล่าสุด"}
                description="รายการที่เพิ่มจะขึ้นทันทีตรงนี้ พร้อมปุ่มเพิ่มลดจำนวนแบบกดง่าย"
              />

              <div className="mt-4 space-y-3">
                {orderLines.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-white/70 px-4 py-8 text-center text-sm text-[var(--muted)]">
                    ยังไม่มีรายการในบิล แตะเมนูทางซ้ายเพื่อเริ่มขาย
                  </div>
                ) : (
                  orderLines.map((item) => (
                    <article key={`${item.type}-${item.id}`} className="rounded-[22px] border border-[var(--line)] bg-white/85 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-[var(--text)]">{item.name}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {item.label} • {formatCurrency(item.unitPrice)} / รายการ
                          </p>
                        </div>
                        <p className="text-sm font-black text-[var(--text)]">{formatCurrency(item.unitPrice * item.qty)}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="inline-flex items-center gap-3 rounded-full bg-[#f5ebde] px-2 py-2">
                          <button
                            type="button"
                            onClick={() => updateOrderQty(item.type, item.id, -1)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-black text-[var(--text)]"
                          >
                            -
                          </button>
                          <span className="min-w-6 text-center text-sm font-bold">{formatNumber(item.qty)}</span>
                          <button
                            type="button"
                            onClick={() => updateOrderQty(item.type, item.id, 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-black text-[var(--text)]"
                          >
                            +
                          </button>
                        </div>
                        <span className="rounded-full bg-[#eef7ef] px-3 py-2 text-xs font-bold text-[var(--mint-deep)]">{item.label}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="mt-5 rounded-[24px] bg-[#2f241f] p-4 text-white">
                <div className="flex items-center justify-between text-sm text-white/70">
                  <span>รวมทั้งหมด</span>
                  <span>{formatNumber(currentTotals.units)} รายการ</span>
                </div>
                <div className="mt-2 text-3xl font-black">{formatCurrency(currentTotals.total)}</div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={clearOrder}
                    className="flex-1 rounded-2xl bg-white/14 px-4 py-3 text-sm font-bold text-white"
                  >
                    ล้างบิล
                  </button>
                  <button
                    type="button"
                    onClick={checkoutOrder}
                    className="flex-1 rounded-2xl bg-[#f7ba67] px-4 py-3 text-sm font-black text-[#3f2518]"
                  >
                    ปิดบิล
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-4 z-40 px-4 sm:hidden">
        <div className="glass-panel flex items-center justify-between rounded-full px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">ยอดปัจจุบัน</p>
            <p className="text-lg font-black">{formatCurrency(currentTotals.total)}</p>
          </div>
          <button
            type="button"
            onClick={checkoutOrder}
            className="rounded-full bg-[#2f241f] px-5 py-3 text-sm font-black text-white"
          >
            ปิดบิลทันที
          </button>
        </div>
      </div>

      <div
        className={`pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#2f241f] px-4 py-3 text-sm font-bold text-white shadow-xl transition ${
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
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">{props.eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-[var(--text)]">{props.title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{props.description}</p>
    </div>
  );
}

function StatChip(props: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-white/14 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">{props.label}</p>
      <p className="mt-2 text-base font-black text-white">{props.value}</p>
    </div>
  );
}

function SummaryCard(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-[24px] p-4 ${
        props.highlight
          ? "bg-[linear-gradient(135deg,#2f241f_0%,#573626_100%)] text-white"
          : "border border-[var(--line)] bg-white/80 text-[var(--text)]"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${props.highlight ? "text-white/60" : "text-[var(--muted)]"}`}>
        {props.label}
      </p>
      <p className="mt-3 text-2xl font-black">{props.value}</p>
    </div>
  );
}

function SalesTable(props: {
  title: string;
  emptyLabel: string;
  rows: Array<{ name: string; cupsSold: number; unitPriceAtSale: number; revenue: number }>;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
      <h3 className="text-lg font-black text-[var(--text)]">{props.title}</h3>
      {props.rows.length === 0 ? (
        <p className="mt-4 rounded-[18px] bg-[#fff8ef] px-4 py-6 text-center text-sm text-[var(--muted)]">{props.emptyLabel}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {props.rows
            .slice()
            .sort((a, b) => b.cupsSold - a.cupsSold || b.revenue - a.revenue)
            .map((row) => (
              <div key={`${props.title}-${row.name}`} className="rounded-[20px] border border-[var(--line)] bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[var(--text)]">{row.name}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{formatCurrency(row.unitPriceAtSale)} / รายการ</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[var(--text)]">{formatNumber(row.cupsSold)} ชิ้น</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{formatCurrency(row.revenue)}</p>
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
    <article className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black">{props.item.name}</p>
          <p className="text-sm text-[var(--muted)]">{formatCurrency(props.item.price)}</p>
        </div>
        <span className={`rounded-full px-3 py-2 text-xs font-bold ${props.item.active ? "bg-[#e8f7ea] text-[#1f8a53]" : "bg-[#f6e8e2] text-[#9a5a31]"}`}>
          {props.item.active ? "เปิดขาย" : "ปิดขาย"}
        </span>
      </div>
      <div className="mt-3 grid gap-3">
        <input
          value={props.item.name}
          onChange={(event) => props.onChange(props.item.id, { name: event.target.value })}
          className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
        />
        <input
          type="number"
          min="0"
          value={props.item.price}
          onChange={(event) => props.onChange(props.item.id, { price: Number(event.target.value) || 0 })}
          className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
        />
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={props.item.color}
            onChange={(event) => props.onChange(props.item.id, { color: normalizeHexColor(event.target.value) })}
            className="h-12 w-16 rounded-2xl border border-[var(--line)] p-1"
          />
          <label className="flex items-center gap-3 text-sm font-semibold text-[var(--text)]">
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
    <article className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black">{props.item.name}</p>
          <p className="text-sm text-[var(--muted)]">{formatCurrency(props.item.price)}</p>
        </div>
        <span className={`rounded-full px-3 py-2 text-xs font-bold ${props.item.active ? "bg-[#e8f7ea] text-[#1f8a53]" : "bg-[#f6e8e2] text-[#9a5a31]"}`}>
          {props.item.active ? "เปิดขาย" : "ปิดขาย"}
        </span>
      </div>
      <div className="mt-3 grid gap-3">
        <input
          value={props.item.name}
          onChange={(event) => props.onChange(props.item.id, { name: event.target.value })}
          className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
        />
        <input
          type="number"
          min="0"
          value={props.item.price}
          onChange={(event) => props.onChange(props.item.id, { price: Number(event.target.value) || 0 })}
          className="rounded-2xl border border-[var(--line)] px-4 py-3 outline-none"
        />
        <label className="flex items-center gap-3 text-sm font-semibold text-[var(--text)]">
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

function mixColor(hex: string) {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const lighten = (value: number) => Math.min(255, Math.round(value + (255 - value) * 0.24));
  return `rgb(${lighten(r)} ${lighten(g)} ${lighten(b)})`;
}
