const STORAGE_KEY = "drink-sales-tracker-v1";
const CUSTOM_QR_IMAGE = "./assets/customer-payment-qr.jpg";
const STATE_API_ENDPOINT = "./api/state";

const defaultMenus = [
  { id: "ad5e3339-eea1-4507-b665-1b6ec36f79a5", name: "ชาไต้หวัน", price: 25, active: true, color: "#d3a992" },
  { id: "903f1325-e14a-4d72-be60-d36ef11236ff", name: "ชาเขียว", price: 25, active: true, color: "#679e6a" },
  { id: "045bf5b2-1a21-4d1d-824b-7712b4bf0782", name: "ชาไทย", price: 25, active: true, color: "#e59710" },
  { id: "76374c54-28d6-40fd-99c9-e9381659138f", name: "ชามะลิ ชามะลิสตอเบอรรี่", price: 25, active: true, color: "#fbffc2" },
  { id: "3d1bebe2-a49c-4563-8c8c-ca0d2f70644b", name: "โกโก้", price: 35, active: true, color: "#87421d" },
  { id: "6753cf8e-8f23-4654-a4e7-d865c3bc2590", name: "กาเเฟ", price: 35, active: true, color: "#b66c43" },
  { id: "b014e218-1b69-459d-aad3-c832bf3419ac", name: "นมชมพู", price: 35, active: true, color: "#d59acd" },
  { id: "e4d32b9f-3fba-43fa-bec5-910cd23475ec", name: "มัทฉะสตอเบอรี่", price: 59, active: true, color: "#154c30" },
  { id: "28ba1347-686e-49ac-81db-56981a02e127", name: "มัทฉะลาเต้", price: 49, active: true, color: "#40aeb0" },
  { id: "d6da1131-c2e2-48b4-a5ba-8ce879f19a94", name: "มัทฉะนมชมพู", price: 49, active: true, color: "#c291d4" },
];

const defaultToppings = [
  { id: "50b43701-5e30-444d-8edd-473417deb4fd", name: "ไข่มุก", price: 5, active: true },
  { id: "f1abbb3c-c4dd-4097-9d86-0588f3fdc097", name: "ครีมชีส", price: 15, active: true },
  { id: "be8efc94-c729-4e27-8d78-598f50837949", name: "บุก", price: 10, active: true },
  { id: "5b0d4b6e-e82c-4a90-a486-ea57bd7d25b8", name: "ซอสสตอเบอรี่", price: 10, active: true },
];

const defaultPayment = {
  shopName: "gote",
  promptpayId: "0849755392",
};

const state = loadState();

const els = {
  tabLinks: Array.from(document.querySelectorAll(".tab-link")),
  panels: Array.from(document.querySelectorAll(".panel")),
  orderQueueBadge: document.querySelector("#order-queue-badge"),
  orderMenuGrid: document.querySelector("#order-menu-grid"),
  orderToppingGrid: document.querySelector("#order-topping-grid"),
  orderCartEmpty: document.querySelector("#order-cart-empty"),
  orderCartList: document.querySelector("#order-cart-list"),
  orderLiveSummary: document.querySelector("#order-live-summary"),
  orderTotalAmount: document.querySelector("#order-total-amount"),
  checkoutOrderButton: document.querySelector("#checkout-order-button"),
  paymentTotalAmount: document.querySelector("#payment-total-amount"),
  paymentOrderRef: document.querySelector("#payment-order-ref"),
  paymentNote: document.querySelector("#payment-note"),
  dynamicPaymentCard: document.querySelector("#dynamic-payment-card"),
  paymentShopLabel: document.querySelector("#payment-shop-label"),
  paymentAccountLabel: document.querySelector("#payment-account-label"),
  paymentReferenceLabel: document.querySelector("#payment-reference-label"),
  paymentQrImage: document.querySelector("#payment-qr-image"),
  paymentQrEmpty: document.querySelector("#payment-qr-empty"),
  dashboardDate: document.querySelector("#dashboard-date"),
  summaryCards: document.querySelector("#summary-cards"),
  dashboardTableBody: document.querySelector("#dashboard-table-body"),
  dashboardEmpty: document.querySelector("#dashboard-empty"),
  dashboardToppingTableBody: document.querySelector("#dashboard-topping-table-body"),
  dashboardToppingEmpty: document.querySelector("#dashboard-topping-empty"),
  entryDate: document.querySelector("#entry-date"),
  entryMenuList: document.querySelector("#entry-menu-list"),
  entryLiveSummary: document.querySelector("#entry-live-summary"),
  entryToppingList: document.querySelector("#entry-topping-list"),
  toppingLiveSummary: document.querySelector("#topping-live-summary"),
  dailySaleForm: document.querySelector("#daily-sale-form"),
  addMenuForm: document.querySelector("#add-menu-form"),
  newMenuName: document.querySelector("#new-menu-name"),
  newMenuPrice: document.querySelector("#new-menu-price"),
  addToppingForm: document.querySelector("#add-topping-form"),
  newToppingName: document.querySelector("#new-topping-name"),
  newToppingPrice: document.querySelector("#new-topping-price"),
  paymentSettingsForm: document.querySelector("#payment-settings-form"),
  shopName: document.querySelector("#shop-name"),
  promptpayId: document.querySelector("#promptpay-id"),
  menuAdminList: document.querySelector("#menu-admin-list"),
  toppingAdminList: document.querySelector("#topping-admin-list"),
  installBanner: document.querySelector("#install-banner"),
  installButton: document.querySelector("#install-button"),
  toast: document.querySelector("#toast"),
};

let deferredInstallPrompt = null;
let latestPersistPromise = Promise.resolve();

initialize();

async function initialize() {
  const today = getToday();
  els.dashboardDate.value = today;

  bindEvents();
  setupAppShell();
  await hydrateStateFromServer();
  renderAll();
}

function bindEvents() {
  els.tabLinks.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  els.dashboardDate.addEventListener("change", renderDashboard);
  els.entryDate.addEventListener("change", renderEntryForm);

  els.dailySaleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDailySale();
  });

  els.addMenuForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addMenu();
  });

  els.addToppingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTopping();
  });

  els.paymentSettingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    savePaymentSettings();
  });

  els.checkoutOrderButton.addEventListener("click", checkoutCurrentOrder);

  els.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installButton.classList.add("hidden");
  });
}

function switchTab(tabName) {
  els.tabLinks.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tabName);
  });

  els.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tabName);
  });
}

function renderAll() {
  renderOrderScreen();
  renderDashboard();
  renderEntryForm();
  renderMenuAdmin();
  renderToppingAdmin();
  renderPaymentSettings();
}

function renderOrderScreen() {
  renderSelectionGrid(els.orderMenuGrid, state.menus.filter((menu) => menu.active), "menu");
  renderSelectionGrid(els.orderToppingGrid, state.toppings.filter((item) => item.active), "topping");
  renderOrderCart();
  renderPaymentPreview();
}

function renderSelectionGrid(container, items, type) {
  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">ยังไม่มี${type === "menu" ? "เมนู" : "ท็อปปิ้ง"}ที่เปิดขาย</div>
    `;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <article class="selection-card" ${buildColorStyle(type === "menu" ? item.color : "")}>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${formatCurrency(item.price)}</p>
          <button type="button" class="secondary-btn" data-order-type="${type}" data-order-id="${item.id}">
            เพิ่มลงบิล
          </button>
        </article>
      `,
    )
    .join("");

  Array.from(container.querySelectorAll("button")).forEach((button) => {
    button.addEventListener("click", () => {
      addItemToCurrentOrder(button.dataset.orderType, button.dataset.orderId);
    });
  });
}

function addItemToCurrentOrder(type, id) {
  const listKey = type === "menu" ? "items" : "toppings";
  const sourceList = type === "menu" ? state.menus : state.toppings;
  const source = sourceList.find((item) => item.id === id && item.active);

  if (!source) {
    showToast("ไม่พบรายการที่เลือก");
    return;
  }

  const existing = state.currentOrder[listKey].find((item) => item.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.currentOrder[listKey].push({
      id: source.id,
      name: source.name,
      unitPrice: source.price,
      qty: 1,
      type,
    });
  }

  saveState();
  renderOrderCart();
  showToast(`เพิ่ม ${source.name} ลงบิลแล้ว`);
}

function renderOrderCart() {
  const orderLines = [
    ...state.currentOrder.items.map((item) => ({ ...item, label: "เมนูน้ำ" })),
    ...state.currentOrder.toppings.map((item) => ({ ...item, label: "ท็อปปิ้ง" })),
  ];
  const totals = getCurrentOrderTotals();

  els.orderQueueBadge.textContent = state.lastOrder
    ? `บิลล่าสุด ${state.lastOrder.orderNumber}`
    : "บิลล่าสุดยังไม่มี";

  els.orderLiveSummary.innerHTML = `
    <div>${formatNumber(totals.units)} รายการ</div>
    <div>${formatCurrency(totals.total)}</div>
  `;
  els.orderTotalAmount.textContent = formatCurrency(totals.total);

  if (orderLines.length === 0) {
    els.orderCartEmpty.classList.remove("hidden");
    els.orderCartList.innerHTML = "";
    return;
  }

  els.orderCartEmpty.classList.add("hidden");
  els.orderCartList.innerHTML = orderLines
    .map(
      (item) => `
        <article class="order-line" data-order-type="${item.type}" data-order-id="${item.id}">
          <div class="order-line-main">
            <div>
              <div class="order-line-title">${escapeHtml(item.name)}</div>
              <div class="order-line-meta">${item.label} • ${formatCurrency(item.unitPrice)} ต่อรายการ</div>
            </div>
            <strong>${formatCurrency(item.unitPrice * item.qty)}</strong>
          </div>
          <div class="qty-stepper">
            <button type="button" data-action="decrease">-</button>
            <strong>${formatNumber(item.qty)}</strong>
            <button type="button" data-action="increase">+</button>
          </div>
        </article>
      `,
    )
    .join("");

  Array.from(els.orderCartList.querySelectorAll(".order-line")).forEach((line) => {
    const type = line.dataset.orderType;
    const id = line.dataset.orderId;
    line.querySelector('[data-action="decrease"]').addEventListener("click", () => updateOrderQty(type, id, -1));
    line.querySelector('[data-action="increase"]').addEventListener("click", () => updateOrderQty(type, id, 1));
  });
}

function updateOrderQty(type, id, delta) {
  const listKey = type === "menu" ? "items" : "toppings";
  const item = state.currentOrder[listKey].find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  item.qty += delta;
  state.currentOrder[listKey] = state.currentOrder[listKey].filter((entry) => entry.qty > 0);
  saveState();
  renderOrderCart();
}

function getCurrentOrderTotals() {
  const allItems = [...state.currentOrder.items, ...state.currentOrder.toppings];
  return allItems.reduce(
    (acc, item) => {
      acc.units += item.qty;
      acc.total += item.qty * item.unitPrice;
      return acc;
    },
    { units: 0, total: 0 },
  );
}

function checkoutCurrentOrder() {
  const totals = getCurrentOrderTotals();
  if (totals.units === 0) {
    showToast("กรุณาเพิ่มรายการก่อนปิดบิล");
    return;
  }

  const orderNumber = createOrderNumber();
  const createdAt = new Date().toISOString();
  const date = getToday();

  mergeOrderIntoSales(date, state.currentOrder);

  const orderRecord = {
    orderNumber,
    createdAt,
    total: totals.total,
    items: structuredClone(state.currentOrder.items),
    toppings: structuredClone(state.currentOrder.toppings),
  };

  state.orders.unshift(orderRecord);
  state.lastOrder = orderRecord;
  state.currentOrder = createEmptyOrder();
  saveState();
  renderAll();
  showToast(`ปิดบิล ${orderNumber} เรียบร้อย`);
  switchTab("order");
}

function mergeOrderIntoSales(date, order) {
  const sale = getSaleByDate(date) ?? { date, items: [], toppings: [] };
  mergeOrderList(sale.items, order.items);
  mergeOrderList(sale.toppings, order.toppings);

  const existingIndex = state.sales.findIndex((entry) => entry.date === date);
  if (existingIndex >= 0) {
    state.sales[existingIndex] = sale;
  } else {
    state.sales.push(sale);
  }
}

function mergeOrderList(targetList, orderItems) {
  orderItems.forEach((item) => {
    const existing = targetList.find((entry) => entry.menuId === item.id && entry.unitPriceAtSale === item.unitPrice);
    if (existing) {
      existing.cupsSold += item.qty;
    } else {
      targetList.push({
        menuId: item.id,
        cupsSold: item.qty,
        unitPriceAtSale: item.unitPrice,
      });
    }
  });
}

function renderPaymentPreview() {
  const lastOrder = state.lastOrder;
  const amount = lastOrder?.total ?? 0;
  els.paymentTotalAmount.textContent = formatCurrency(amount);
  els.paymentOrderRef.textContent = lastOrder
    ? `${state.payment.shopName || "ร้าน"} • ${lastOrder.orderNumber}`
    : "ยังไม่มีบิลล่าสุด";
  els.paymentNote.textContent = lastOrder
    ? "ให้ลูกค้าสแกน QR นี้ แล้วโอนตามยอดรวมที่แสดงบนหน้าจอ"
    : "สร้างบิลก่อน แล้วค่อยให้ลูกค้าสแกน QR นี้";

  if (!lastOrder) {
    els.dynamicPaymentCard.classList.add("hidden");
    els.paymentQrImage.classList.add("hidden");
    els.paymentQrEmpty.classList.remove("hidden");
    els.paymentQrEmpty.textContent = "ยังไม่มีบิลล่าสุด กดสร้าง QR และปิดบิลก่อน";
    return;
  }

  els.paymentQrImage.src = CUSTOM_QR_IMAGE;
  els.paymentQrImage.classList.remove("hidden");
  els.dynamicPaymentCard.classList.remove("hidden");
  els.paymentQrEmpty.classList.add("hidden");
  els.paymentShopLabel.textContent = "ใช้ QR นี้รับเงินจากลูกค้า";
  els.paymentAccountLabel.textContent = `ยอดที่ต้องโอน ${formatCurrency(amount)}`;
  els.paymentReferenceLabel.textContent = `อ้างอิงบิล ${lastOrder.orderNumber}`;
}

function renderPaymentSettings() {
  els.shopName.value = state.payment.shopName;
  els.promptpayId.value = state.payment.promptpayId;
}

function savePaymentSettings() {
  state.payment.shopName = els.shopName.value.trim() || defaultPayment.shopName;
  state.payment.promptpayId = els.promptpayId.value.trim();
  saveState();
  renderPaymentPreview();
  showToast("บันทึกการตั้งค่ารับเงินแล้ว");
}

function renderDashboard() {
  const selectedDate = els.dashboardDate.value || getToday();
  const sale = getSaleByDate(selectedDate);
  const rows = enrichSaleItems(sale?.items ?? [], state.menus, "เมนูที่ถูกลบ");
  const toppingRows = enrichSaleItems(sale?.toppings ?? [], state.toppings, "ท็อปปิ้งที่ถูกลบ");

  const totals = rows.reduce(
    (acc, row) => {
      acc.cups += row.cupsSold;
      acc.revenue += row.revenue;
      return acc;
    },
    { cups: 0, revenue: 0 },
  );

  const toppingTotals = toppingRows.reduce(
    (acc, row) => {
      acc.cups += row.cupsSold;
      acc.revenue += row.revenue;
      return acc;
    },
    { cups: 0, revenue: 0 },
  );
  const netRevenue = totals.revenue + toppingTotals.revenue;

  const activeMenuCount = state.menus.filter((menu) => menu.active).length;
  const soldMenuCount = rows.length;
  const activeToppingCount = state.toppings.filter((item) => item.active).length;

  els.summaryCards.innerHTML = `
    <article class="stat-card">
      <p>จำนวนแก้วรวม</p>
      <strong>${formatNumber(totals.cups)}</strong>
    </article>
    <article class="stat-card">
      <p>รายได้รวม</p>
      <strong>${formatCurrency(totals.revenue)}</strong>
    </article>
    <article class="stat-card">
      <p>เมนูที่ขาย / เมนูที่เปิดขาย</p>
      <strong>${soldMenuCount} / ${activeMenuCount}</strong>
    </article>
    <article class="stat-card">
      <p>ท็อปปิ้งที่ขาย / ท็อปปิ้งที่เปิดขาย</p>
      <strong>${toppingRows.length} / ${activeToppingCount}</strong>
    </article>
    <article class="stat-card">
      <p>รายได้จากท็อปปิ้ง</p>
      <strong>${formatCurrency(toppingTotals.revenue)}</strong>
    </article>
    <article class="stat-card">
      <p>รายได้สุทธิ</p>
      <strong>${formatCurrency(netRevenue)}</strong>
    </article>
  `;

  if (rows.length === 0) {
    els.dashboardEmpty.classList.remove("hidden");
    els.dashboardTableBody.innerHTML = "";
  } else {
    els.dashboardEmpty.classList.add("hidden");
    const sortedRows = [...rows].sort((a, b) => {
      if (b.cupsSold !== a.cupsSold) {
        return b.cupsSold - a.cupsSold;
      }
      return b.revenue - a.revenue;
    });

    els.dashboardTableBody.innerHTML = sortedRows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${formatCurrency(row.unitPriceAtSale)}</td>
            <td>${formatNumber(row.cupsSold)}</td>
            <td>${formatCurrency(row.revenue)}</td>
          </tr>
        `,
      )
      .join("");
  }

  if (toppingRows.length === 0) {
    els.dashboardToppingEmpty.classList.remove("hidden");
    els.dashboardToppingTableBody.innerHTML = "";
  } else {
    els.dashboardToppingEmpty.classList.add("hidden");
    const sortedToppings = [...toppingRows].sort((a, b) => {
      if (b.cupsSold !== a.cupsSold) {
        return b.cupsSold - a.cupsSold;
      }
      return b.revenue - a.revenue;
    });

    els.dashboardToppingTableBody.innerHTML = sortedToppings
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${formatCurrency(row.unitPriceAtSale)}</td>
            <td>${formatNumber(row.cupsSold)}</td>
            <td>${formatCurrency(row.revenue)}</td>
          </tr>
        `,
      )
      .join("");
  }
}

function renderEntryForm() {
  const selectedDate = els.entryDate.value || getToday();
  const sale = getSaleByDate(selectedDate);
  const activeMenus = state.menus.filter((menu) => menu.active);
  const activeToppings = state.toppings.filter((item) => item.active);

  if (activeMenus.length === 0) {
    els.entryMenuList.innerHTML = `
      <div class="empty-state">
        ยังไม่มีเมนูที่เปิดขาย กรุณาไปเพิ่มเมนูในแท็บ "จัดการเมนู"
      </div>
    `;
    els.entryLiveSummary.textContent = "";
    return;
  }

  const existingItems = new Map((sale?.items ?? []).map((item) => [item.menuId, item]));

  els.entryMenuList.innerHTML = activeMenus
    .map((menu) => {
      const savedCups = existingItems.get(menu.id)?.cupsSold ?? 0;
      return `
        <label class="menu-row" ${buildColorStyle(menu.color)}>
          <div class="menu-row-header">
            <div>
              <div class="menu-row-name">${escapeHtml(menu.name)}</div>
              <div class="menu-row-meta">ราคา ${formatCurrency(menu.price)} ต่อแก้ว</div>
            </div>
            <div class="status-pill active">เปิดขาย</div>
          </div>
          <input
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            data-menu-id="${menu.id}"
            value="${savedCups}"
            aria-label="จำนวนแก้วของ ${escapeHtml(menu.name)}"
          />
        </label>
      `;
    })
    .join("");

  Array.from(els.entryMenuList.querySelectorAll("input")).forEach((input) => {
    input.addEventListener("input", updateEntrySummary);
  });

  if (activeToppings.length === 0) {
    els.entryToppingList.innerHTML = `
      <div class="empty-state">
        ยังไม่มีท็อปปิ้งที่เปิดขาย กรุณาไปเพิ่มท็อปปิ้งในแท็บ "จัดการเมนู"
      </div>
    `;
    els.toppingLiveSummary.textContent = "";
  } else {
    const existingToppings = new Map((sale?.toppings ?? []).map((item) => [item.menuId, item]));

    els.entryToppingList.innerHTML = activeToppings
      .map((item) => {
        const savedCount = existingToppings.get(item.id)?.cupsSold ?? 0;
        return `
          <label class="menu-row">
            <div class="menu-row-header">
              <div>
                <div class="menu-row-name">${escapeHtml(item.name)}</div>
                <div class="menu-row-meta">ราคา ${formatCurrency(item.price)} ต่อรายการ</div>
              </div>
              <div class="status-pill active">เปิดขาย</div>
            </div>
            <input
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              data-topping-id="${item.id}"
              value="${savedCount}"
              aria-label="จำนวนของ ${escapeHtml(item.name)}"
            />
          </label>
        `;
      })
      .join("");

    Array.from(els.entryToppingList.querySelectorAll("input")).forEach((input) => {
      input.addEventListener("input", updateToppingSummary);
    });
  }

  updateEntrySummary();
  updateToppingSummary();
}

function updateEntrySummary() {
  const activeMenus = state.menus.filter((menu) => menu.active);
  const valuesById = new Map(
    Array.from(els.entryMenuList.querySelectorAll("input")).map((input) => [
      input.dataset.menuId,
      sanitizeCups(input.value),
    ]),
  );

  const totals = activeMenus.reduce(
    (acc, menu) => {
      const cups = valuesById.get(menu.id) ?? 0;
      acc.cups += cups;
      acc.revenue += cups * menu.price;
      return acc;
    },
    { cups: 0, revenue: 0 },
  );

  els.entryLiveSummary.innerHTML = `
    <div>${formatNumber(totals.cups)} แก้ว</div>
    <div>${formatCurrency(totals.revenue)}</div>
  `;
}

function updateToppingSummary() {
  const activeToppings = state.toppings.filter((item) => item.active);
  const valuesById = new Map(
    Array.from(els.entryToppingList.querySelectorAll("input")).map((input) => [
      input.dataset.toppingId,
      sanitizeCups(input.value),
    ]),
  );

  const totals = activeToppings.reduce(
    (acc, item) => {
      const cups = valuesById.get(item.id) ?? 0;
      acc.cups += cups;
      acc.revenue += cups * item.price;
      return acc;
    },
    { cups: 0, revenue: 0 },
  );

  els.toppingLiveSummary.innerHTML = `
    <div>${formatNumber(totals.cups)} รายการ</div>
    <div>${formatCurrency(totals.revenue)}</div>
  `;
}

function saveDailySale() {
  const selectedDate = els.entryDate.value || getToday();
  const items = Array.from(els.entryMenuList.querySelectorAll("input"))
    .map((input) => {
      const menu = state.menus.find((item) => item.id === input.dataset.menuId);
      const cupsSold = sanitizeCups(input.value);
      if (!menu || cupsSold <= 0) {
        return null;
      }

      return {
        menuId: menu.id,
        cupsSold,
        unitPriceAtSale: menu.price,
      };
    })
    .filter(Boolean);

  const toppings = Array.from(els.entryToppingList.querySelectorAll("input"))
    .map((input) => {
      const item = state.toppings.find((entry) => entry.id === input.dataset.toppingId);
      const cupsSold = sanitizeCups(input.value);
      if (!item || cupsSold <= 0) {
        return null;
      }

      return {
        menuId: item.id,
        cupsSold,
        unitPriceAtSale: item.price,
      };
    })
    .filter(Boolean);

  const nextSale = { date: selectedDate, items, toppings };
  const existingIndex = state.sales.findIndex((sale) => sale.date === selectedDate);

  if (existingIndex >= 0) {
    state.sales[existingIndex] = nextSale;
  } else {
    state.sales.push(nextSale);
  }

  saveState();
  renderDashboard();
  renderEntryForm();
  showToast("บันทึกยอดขายเรียบร้อย");
}

function renderMenuAdmin() {
  if (state.menus.length === 0) {
    els.menuAdminList.innerHTML = `
      <div class="empty-state">ยังไม่มีเมนูในระบบ กรุณาเพิ่มเมนูใหม่ด้านบน</div>
    `;
    return;
  }

  const sortedMenus = [...state.menus].sort((a, b) => Number(b.active) - Number(a.active));

  els.menuAdminList.innerHTML = sortedMenus
    .map(
      (menu) => `
        <article class="menu-admin-item" data-menu-id="${menu.id}">
          <div class="menu-admin-header">
            <div>
              <div class="menu-admin-title">${escapeHtml(menu.name)}</div>
              <div class="menu-admin-meta">ราคาเดิม ${formatCurrency(menu.price)}</div>
            </div>
            <div class="status-pill ${menu.active ? "active" : "inactive"}">
              ${menu.active ? "เปิดขาย" : "ปิดขาย"}
            </div>
          </div>
          <div class="menu-admin-fields">
            <input type="text" value="${escapeHtml(menu.name)}" data-field="name" aria-label="ชื่อเมนู" />
            <input type="number" min="0" step="1" value="${menu.price}" data-field="price" aria-label="ราคา" />
            <input type="color" value="${normalizeMenuColor(menu.color)}" data-field="color" aria-label="สีเมนู" />
            <label class="toggle-wrap">
              <input type="checkbox" data-field="active" ${menu.active ? "checked" : ""} />
              <span>เปิดขาย</span>
            </label>
            <button type="button" class="secondary-btn" data-action="save">บันทึก</button>
          </div>
        </article>
      `,
    )
    .join("");

  Array.from(els.menuAdminList.querySelectorAll('[data-action="save"]')).forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".menu-admin-item");
      updateMenu(item.dataset.menuId, item);
    });
  });
}

function renderToppingAdmin() {
  if (state.toppings.length === 0) {
    els.toppingAdminList.innerHTML = `
      <div class="empty-state">ยังไม่มีท็อปปิ้งในระบบ กรุณาเพิ่มท็อปปิ้งใหม่ด้านบน</div>
    `;
    return;
  }

  const sortedToppings = [...state.toppings].sort((a, b) => Number(b.active) - Number(a.active));

  els.toppingAdminList.innerHTML = sortedToppings
    .map(
      (item) => `
        <article class="menu-admin-item" data-topping-id="${item.id}">
          <div class="menu-admin-header">
            <div>
              <div class="menu-admin-title">${escapeHtml(item.name)}</div>
              <div class="menu-admin-meta">ราคาเดิม ${formatCurrency(item.price)}</div>
            </div>
            <div class="status-pill ${item.active ? "active" : "inactive"}">
              ${item.active ? "เปิดขาย" : "ปิดขาย"}
            </div>
          </div>
          <div class="menu-admin-fields">
            <input type="text" value="${escapeHtml(item.name)}" data-field="name" aria-label="ชื่อท็อปปิ้ง" />
            <input type="number" min="0" step="1" value="${item.price}" data-field="price" aria-label="ราคา" />
            <label class="toggle-wrap">
              <input type="checkbox" data-field="active" ${item.active ? "checked" : ""} />
              <span>เปิดขาย</span>
            </label>
            <button type="button" class="secondary-btn" data-action="save">บันทึก</button>
          </div>
        </article>
      `,
    )
    .join("");

  Array.from(els.toppingAdminList.querySelectorAll('[data-action="save"]')).forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".menu-admin-item");
      updateTopping(item.dataset.toppingId, item);
    });
  });
}

function addMenu() {
  const name = els.newMenuName.value.trim();
  const price = Number(els.newMenuPrice.value);

  if (!name || Number.isNaN(price) || price < 0) {
    showToast("กรุณากรอกชื่อเมนูและราคาให้ถูกต้อง");
    return;
  }

  state.menus.push({
    id: crypto.randomUUID(),
    name,
    price,
    active: true,
  });

  els.addMenuForm.reset();
  saveState();
  renderAll();
  showToast("เพิ่มเมนูเรียบร้อย");
}

function addTopping() {
  const name = els.newToppingName.value.trim();
  const price = Number(els.newToppingPrice.value);

  if (!name || Number.isNaN(price) || price < 0) {
    showToast("กรุณากรอกชื่อท็อปปิ้งและราคาให้ถูกต้อง");
    return;
  }

  state.toppings.push({
    id: crypto.randomUUID(),
    name,
    price,
    active: true,
  });

  els.addToppingForm.reset();
  saveState();
  renderAll();
  showToast("เพิ่มท็อปปิ้งเรียบร้อย");
}

function updateMenu(menuId, container) {
  const menu = state.menus.find((item) => item.id === menuId);
  if (!menu) {
    return;
  }

  const name = container.querySelector('[data-field="name"]').value.trim();
  const price = Number(container.querySelector('[data-field="price"]').value);
  const color = normalizeMenuColor(container.querySelector('[data-field="color"]').value);
  const active = container.querySelector('[data-field="active"]').checked;

  if (!name || Number.isNaN(price) || price < 0) {
    showToast("ข้อมูลเมนูไม่ถูกต้อง");
    return;
  }

  menu.name = name;
  menu.price = price;
  menu.color = color;
  menu.active = active;

  saveState();
  renderAll();
  showToast("อัปเดตเมนูแล้ว");
}

function updateTopping(toppingId, container) {
  const item = state.toppings.find((entry) => entry.id === toppingId);
  if (!item) {
    return;
  }

  const name = container.querySelector('[data-field="name"]').value.trim();
  const price = Number(container.querySelector('[data-field="price"]').value);
  const active = container.querySelector('[data-field="active"]').checked;

  if (!name || Number.isNaN(price) || price < 0) {
    showToast("ข้อมูลท็อปปิ้งไม่ถูกต้อง");
    return;
  }

  item.name = name;
  item.price = price;
  item.active = active;

  saveState();
  renderAll();
  showToast("อัปเดตท็อปปิ้งแล้ว");
}

function enrichSaleItems(items, sourceList, fallbackName) {
  return items
    .map((item) => {
      const source = sourceList.find((entry) => entry.id === item.menuId);
      const name = source?.name ?? fallbackName;
      const revenue = item.cupsSold * item.unitPriceAtSale;
      return { ...item, name, revenue };
    })
    .filter((item) => item.cupsSold > 0);
}

function getSaleByDate(date) {
  return state.sales.find((sale) => sale.date === date) ?? null;
}

function loadState() {
  const fallback = {
    menus: defaultMenus,
    toppings: defaultToppings,
    sales: [],
    payment: defaultPayment,
    currentOrder: createEmptyOrder(),
    orders: [],
    lastOrder: null,
  };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return structuredClone(fallback);
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      menus:
        Array.isArray(parsed.menus) && parsed.menus.length > 0
          ? parsed.menus.map((menu, index) => ({
              ...menu,
              color: normalizeMenuColor(menu.color || fallback.menus[index % fallback.menus.length].color),
            }))
          : fallback.menus,
      toppings:
        Array.isArray(parsed.toppings) && parsed.toppings.length > 0 ? parsed.toppings : fallback.toppings,
      payment: {
        shopName: parsed.payment?.shopName || fallback.payment.shopName,
        promptpayId: parsed.payment?.promptpayId || "",
      },
      currentOrder: normalizeCurrentOrder(parsed.currentOrder),
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      lastOrder: parsed.lastOrder ?? null,
      sales: Array.isArray(parsed.sales)
        ? parsed.sales.map((sale) => ({
            date: sale.date,
            items: Array.isArray(sale.items) ? sale.items : [],
            toppings: Array.isArray(sale.toppings) ? sale.toppings : [],
          }))
        : [],
    };
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return structuredClone(fallback);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  latestPersistPromise = persistStateToServer();
}

async function hydrateStateFromServer() {
  try {
    const response = await fetch(STATE_API_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      syncFormFieldsFromState();
      return;
    }

    const remoteState = normalizeState(await response.json());
    Object.assign(state, remoteState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Fall back to the latest browser copy when the server state is unavailable.
  }

  syncFormFieldsFromState();
}

function persistStateToServer() {
  return fetch(STATE_API_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  }).catch(() => {
    // Keep local usage working even if the file write fails temporarily.
  });
}

function syncFormFieldsFromState() {
  els.entryDate.value = getToday();
  els.shopName.value = state.payment.shopName;
  els.promptpayId.value = state.payment.promptpayId;
}

function normalizeState(parsed) {
  const fallback = {
    menus: defaultMenus,
    toppings: defaultToppings,
    sales: [],
    payment: defaultPayment,
    currentOrder: createEmptyOrder(),
    orders: [],
    lastOrder: null,
  };

  return {
    menus:
      Array.isArray(parsed.menus) && parsed.menus.length > 0
        ? parsed.menus.map((menu, index) => ({
            ...menu,
            color: normalizeMenuColor(menu.color || fallback.menus[index % fallback.menus.length].color),
          }))
        : structuredClone(fallback.menus),
    toppings:
      Array.isArray(parsed.toppings) && parsed.toppings.length > 0 ? parsed.toppings : structuredClone(fallback.toppings),
    payment: {
      shopName: parsed.payment?.shopName || fallback.payment.shopName,
      promptpayId: parsed.payment?.promptpayId || "",
    },
    currentOrder: normalizeCurrentOrder(parsed.currentOrder),
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    lastOrder: parsed.lastOrder ?? null,
    sales: Array.isArray(parsed.sales)
      ? parsed.sales.map((sale) => ({
          date: sale.date,
          items: Array.isArray(sale.items) ? sale.items : [],
          toppings: Array.isArray(sale.toppings) ? sale.toppings : [],
        }))
      : [],
  };
}

function setupAppShell() {
  registerServiceWorker();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installButton.classList.remove("hidden");
  });

  if (window.matchMedia("(display-mode: standalone)").matches) {
    els.installBanner.classList.add("hidden");
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const isSupportedProtocol =
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (!isSupportedProtocol) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      showToast("ยังไม่สามารถเปิดโหมดใช้งานออฟไลน์ได้");
    });
  });
}

function sanitizeCups(value) {
  const cups = Math.max(0, Number(value) || 0);
  return Math.floor(cups);
}

function createEmptyOrder() {
  return { items: [], toppings: [] };
}

function normalizeCurrentOrder(currentOrder) {
  if (!currentOrder || typeof currentOrder !== "object") {
    return createEmptyOrder();
  }

  return {
    items: Array.isArray(currentOrder.items) ? currentOrder.items : [],
    toppings: Array.isArray(currentOrder.toppings) ? currentOrder.toppings : [],
  };
}

function normalizeMenuColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(String(color || "").trim()) ? String(color).trim() : "#c96f3d";
}

function buildColorStyle(color) {
  const normalized = normalizeMenuColor(color);
  return `style="--menu-accent:${normalized}; --menu-accent-soft:${hexToRgba(normalized, 0.18)};"`;
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeMenuColor(hex).slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(amount) {
  return new Intl.NumberFormat("th-TH").format(amount);
}

function getToday() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function createOrderNumber() {
  const count = state.orders.length + 1;
  return `ORD-${getToday().replaceAll("-", "")}-${String(count).padStart(3, "0")}`;
}

function createPromptPayPayload(id, amount) {
  const targetInfo = normalizePromptPayId(id);
  if (!targetInfo) {
    return "";
  }

  const merchantInfo = buildPromptPayMerchantInfo(targetInfo);
  const formattedAmount = amount > 0 ? Number(amount).toFixed(2) : "";
  const merchantName = toPromptPayText(state.payment.shopName || "DRINK SALES", 25);
  const merchantCity = "BANGKOK";

  let payload = "";
  payload += encodeQrField("00", "01");
  payload += encodeQrField("01", "11");
  payload += encodeQrField("29", merchantInfo);
  payload += encodeQrField("53", "764");
  if (formattedAmount) {
    payload += encodeQrField("54", formattedAmount);
  }
  payload += encodeQrField("58", "TH");
  payload += encodeQrField("59", merchantName);
  payload += encodeQrField("60", merchantCity);
  payload += "6304";
  return `${payload}${calculateCrc16(payload)}`;
}

function buildPromptPayMerchantInfo(targetInfo) {
  const appId = "0016A000000677010111";
  const subFieldId = targetInfo.type === "nationalId" ? "02" : "01";
  const accountField = `${subFieldId}${String(targetInfo.value.length).padStart(2, "0")}${targetInfo.value}`;
  return `${appId}${accountField}`;
}

function encodeQrField(id, value) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function normalizePromptPayId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return {
      type: "phone",
      value: `0066${digits.slice(1)}`,
    };
  }
  if (digits.length === 13) {
    return {
      type: "nationalId",
      value: digits,
    };
  }
  if (digits.length === 15 && digits.startsWith("0066")) {
    return {
      type: "phone",
      value: digits,
    };
  }
  return "";
}

function toPromptPayText(value, maxLength) {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (!cleaned) {
    return "DRINK SALES";
  }

  return cleaned.slice(0, maxLength);
}

function maskPromptPayId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-x${digits.slice(4, 5)}${digits.slice(5, 8)}${digits.slice(8, 9)}-x`;
  }
  if (digits.length === 13) {
    return `${digits.slice(0, 3)}-x-${digits.slice(8, 12)}-x`;
  }
  return value || "-";
}

function calculateCrc16(input) {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");

  window.clearTimeout(showToast.timerId);
  showToast.timerId = window.setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 2200);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
