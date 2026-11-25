(function () {
  const CART_KEY = "grind-demo-cart-v1";

  function cart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    renderCart();
  }

  function addItem(item) {
    const items = cart();
    const same = items.find(
      (i) => i.id === item.id && i.detail === item.detail
    );
    if (same) same.qty += item.qty || 1;
    else items.push({ ...item, qty: item.qty || 1 });
    saveCart(items);
  }

  function changeQty(index, delta) {
    const items = cart();
    if (!items[index]) return;
    items[index].qty += delta;
    if (items[index].qty <= 0) items.splice(index, 1);
    saveCart(items);
  }

  function total(items) {
    return items.reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  function itemButton(item, extra = "") {
    const sample = item.sample
      ? '<span class="badge badge-sample">Sample</span> '
      : "";
    return `<article class="menu-item order-item" data-id="${item.id}">
      <div class="menu-item-top">
        <h3>${sample}${Grind.escapeHtml(item.name)}</h3>
        <span class="price-pill">${Grind.money(item.price)}</span>
      </div>
      <p>${Grind.escapeHtml(item.description || "")}</p>
      ${extra}
      <button type="button" class="btn btn-small" data-add="${item.id}">Add to order</button>
    </article>`;
  }

  function renderMenu() {
    const menu = window.GRIND_MENU;
    const specials = (window.GRIND_SPECIALS && window.GRIND_SPECIALS.items) || [];
    const drinks = window.GRIND_DRINKS_SAMPLE;

    const mount = (sel, html) => {
      const el = document.querySelector(sel);
      if (el) el.innerHTML = html;
    };

    mount(
      "[data-order-specials]",
      specials.map((item) => itemButton(item)).join("") ||
        "<p class='empty-note'>No specials posted.</p>"
    );
    mount(
      "[data-order-breakfast]",
      menu.breakfast.map((item) => itemButton(item)).join("")
    );
    mount("[data-order-byo]", itemButton(menu.buildYourOwn, byoForm()));
    mount(
      "[data-order-lunch]",
      menu.lunch.map((item) => itemButton(item)).join("")
    );
    mount(
      "[data-order-veg]",
      menu.vegetarian.map((item) => itemButton(item)).join("")
    );
    mount(
      "[data-order-sides]",
      menu.sides.map((item) => itemButton(item)).join("") +
        `<p class="fine-print">${Grind.escapeHtml(menu.chipsNote)}</p>`
    );
    mount(
      "[data-order-drinks]",
      (drinks.items || []).map((item) => itemButton(item)).join("")
    );

    document.getElementById("order-menu").addEventListener("click", onAdd);
  }

  function byoForm() {
    const byo = window.GRIND_MENU.buildYourOwn;
    const opts = (arr) =>
      arr.map((v) => `<option value="${Grind.escapeHtml(v)}">${Grind.escapeHtml(v)}</option>`).join("");
    return `<div class="byo-grid">
      <label>Bread / bagel
        <select data-byo="bread">${opts(byo.breads)}</select>
      </label>
      <label>Protein
        <select data-byo="protein">${opts(byo.proteins)}</select>
      </label>
      <label>Cheese
        <select data-byo="cheese">${opts(byo.cheeses)}</select>
      </label>
      <label class="check-label">
        <input type="checkbox" data-byo="egg" />
        Add an egg (+${Grind.money(byo.addEggPrice)})
      </label>
    </div>`;
  }

  function findItem(id) {
    const specials = (window.GRIND_SPECIALS && window.GRIND_SPECIALS.items) || [];
    const drinks = (window.GRIND_DRINKS_SAMPLE && window.GRIND_DRINKS_SAMPLE.items) || [];
    const menu = window.GRIND_MENU;
    return (
      specials.find((i) => i.id === id) ||
      menu.breakfast.find((i) => i.id === id) ||
      menu.lunch.find((i) => i.id === id) ||
      menu.vegetarian.find((i) => i.id === id) ||
      menu.sides.find((i) => i.id === id) ||
      drinks.find((i) => i.id === id) ||
      (menu.buildYourOwn.id === id ? menu.buildYourOwn : null) ||
      null
    );
  }

  function onAdd(e) {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const id = btn.getAttribute("data-add");
    const item = findItem(id);
    if (!item) return;

    let name = item.name;
    let price = item.price;
    let detail = "";
    const card = btn.closest(".order-item");

    if (id === "build-your-own") {
      const bread = card.querySelector('[data-byo="bread"]').value;
      const protein = card.querySelector('[data-byo="protein"]').value;
      const cheese = card.querySelector('[data-byo="cheese"]').value;
      const egg = card.querySelector('[data-byo="egg"]').checked;
      detail = `${bread}, ${protein}, ${cheese}${egg ? ", add an egg" : ""}`;
      name = `Build Your Own (${detail})`;
      if (egg) price += item.addEggPrice;
    }

    if (item.addEgg && id !== "build-your-own") {
      // optional: no extra UI unless they use the description; skip auto add
    }

    if (id === "toasted-bagel") {
      // let them pick a bagel flavor if the select exists later; default note
    }

    if (id === "king-street-party") {
      // optional add-on could be a future enhancement
    }

    addItem({
      id,
      name,
      price,
      detail,
      sample: !!item.sample,
      qty: 1
    });
    btn.textContent = "Added";
    setTimeout(() => {
      btn.textContent = "Add to order";
    }, 900);
  }

  function renderCart() {
    const items = cart();
    const box = document.querySelector("[data-cart]");
    const countEls = document.querySelectorAll("[data-cart-count]");
    const count = items.reduce((n, i) => n + i.qty, 0);
    countEls.forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
    });
    if (!box) return;
    if (!items.length) {
      box.innerHTML = "<p class='empty-note'>Your order is empty. Add a few items from the menu.</p>";
      document.querySelector("[data-cart-total]").textContent = Grind.money(0);
      return;
    }
    box.innerHTML = items
      .map(
        (item, index) => `<div class="cart-row">
        <div>
          <strong>${Grind.escapeHtml(item.name)}</strong>
          ${item.sample ? '<span class="badge badge-sample">Sample</span>' : ""}
          <div class="cart-line-price">${Grind.money(item.price)} each</div>
        </div>
        <div class="qty-ctrl">
          <button type="button" data-qty="${index}" data-delta="-1" aria-label="Remove one">−</button>
          <span>${item.qty}</span>
          <button type="button" data-qty="${index}" data-delta="1" aria-label="Add one">+</button>
        </div>
        <div class="cart-sum">${Grind.money(item.price * item.qty)}</div>
      </div>`
      )
      .join("");
    document.querySelector("[data-cart-total]").textContent = Grind.money(
      total(items)
    );
  }

  function fillPickup() {
    const dateSel = document.getElementById("pickup-date");
    const timeSel = document.getElementById("pickup-time");
    const days = Grind.nextOpenDays(7);
    dateSel.innerHTML = days
      .map((d) => `<option value="${d.iso}">${d.label}</option>`)
      .join("");

    function refreshTimes() {
      const iso = dateSel.value;
      const slots = Grind.pickupSlots().filter((s) =>
        Grind.slotStillAvailable(iso, s.mins)
      );
      if (!slots.length) {
        timeSel.innerHTML =
          '<option value="">No pickup times left today — please pick another day</option>';
        return;
      }
      timeSel.innerHTML = slots
        .map((s) => `<option value="${s.label}">${s.label}</option>`)
        .join("");
    }
    dateSel.addEventListener("change", refreshTimes);
    refreshTimes();
  }

  function onSubmit(e) {
    e.preventDefault();
    const items = cart();
    const err = document.getElementById("order-error");
    err.hidden = true;
    if (!items.length) {
      err.textContent = "Add at least one item before placing the order.";
      err.hidden = false;
      return;
    }
    const name = document.getElementById("customer-name").value.trim();
    const phone = document.getElementById("customer-phone").value.trim();
    const date = document.getElementById("pickup-date").value;
    const time = document.getElementById("pickup-time").value;
    if (!name || !phone || !date || !time) {
      err.textContent = "Please add your name, phone, and a pickup time.";
      err.hidden = false;
      return;
    }
    const code = "GRIND-" + String(Math.floor(1000 + Math.random() * 9000));
    const hasSample = items.some((i) => i.sample);
    const list = items
      .map(
        (i) =>
          `<li>${Grind.escapeHtml(i.qty + " × " + i.name)} — ${Grind.money(
            i.price * i.qty
          )}</li>`
      )
      .join("");
    const modal = document.getElementById("confirm-modal");
    document.getElementById("confirm-body").innerHTML = `
      <p class="confirm-code">Order ${Grind.escapeHtml(code)}</p>
      <p><strong>${Grind.escapeHtml(name)}</strong> · ${Grind.escapeHtml(phone)}</p>
      <p>Pickup: ${Grind.escapeHtml(date)} at ${Grind.escapeHtml(time)}</p>
      <ul class="confirm-list">${list}</ul>
      <p class="confirm-total">Total ${Grind.money(total(items))}</p>
      ${
        hasSample
          ? "<p class='fine-print'>This order includes sample-priced drink or special items. A live menu would use the shop's real drink prices.</p>"
          : ""
      }
      <p class="demo-note">This is a demo. A live site would take payment through Square, Toast, or Stripe and send the ticket to the kitchen. No payment was taken, and no email or text was sent.</p>
    `;
    modal.showModal();
    localStorage.removeItem(CART_KEY);
    renderCart();
    e.target.reset();
    fillPickup();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("order-menu")) return;
    renderMenu();
    renderCart();
    fillPickup();
    document.getElementById("order-form").addEventListener("submit", onSubmit);
    document.querySelector("[data-cart]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-qty]");
      if (!btn) return;
      changeQty(Number(btn.getAttribute("data-qty")), Number(btn.getAttribute("data-delta")));
    });
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("confirm-modal").close();
      });
    });
  });
})();
