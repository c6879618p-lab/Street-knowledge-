(function () {
  const TZ = "America/New_York";
  const PHONE_DISPLAY = "(828) 430-4343";
  const PHONE_TEL = "tel:+18284304343";
  const ADDRESS = "136 W Union St, Morganton, NC 28655";
  const MAPS =
    "https://maps.google.com/?q=136+W+Union+St,+Morganton,+NC+28655";
  const EMAIL = "hello@grindcafenc.com";

  function nowInShop() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23"
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get("weekday")
    );
    return {
      weekday,
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      hour: Number(get("hour")),
      minute: Number(get("minute"))
    };
  }

  function isOpenAt(info) {
    if (info.weekday === 0) return false;
    const mins = info.hour * 60 + info.minute;
    return mins >= 7 * 60 + 30 && mins < 15 * 60;
  }

  function money(n) {
    return Number(n).toLocaleString("en-US", {
      style: "currency",
      currency: "USD"
    });
  }

  function setOpenStatus() {
    const info = nowInShop();
    const open = isOpenAt(info);
    document.querySelectorAll("[data-open-status]").forEach((el) => {
      el.textContent = open ? "Open now" : "Closed now";
      el.classList.toggle("is-open", open);
      el.classList.toggle("is-closed", !open);
    });
  }

  function setupNav() {
    const btn = document.querySelector(".nav-toggle");
    const nav = document.querySelector("#site-nav");
    if (!btn || !nav) return;
    btn.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("nav-open", open);
    });
  }

  function renderSpecials() {
    const data = window.GRIND_SPECIALS;
    if (!data) return;
    document.querySelectorAll("[data-specials]").forEach((root) => {
      const compact = root.getAttribute("data-specials") === "compact";
      const items = data.items || [];
      if (!items.length) {
        root.innerHTML = "<p class='empty-note'>No specials posted yet.</p>";
        return;
      }
      const badge = data.sample
        ? '<span class="badge badge-sample">Sample specials</span>'
        : "";
      const label = data.updatedLabel
        ? `<p class="specials-meta">${escapeHtml(data.updatedLabel)}</p>`
        : "";
      root.innerHTML =
        badge +
        label +
        items
          .map((item) => {
            if (compact) {
              return `<div class="special-compact">
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  <p>${escapeHtml(item.description || "")}</p>
                </div>
                <span class="price-pill">${money(item.price)}</span>
              </div>`;
            }
            return `<article class="menu-item">
              <div class="menu-item-top">
                <h3>${escapeHtml(item.name)} ${
              item.sample ? '<span class="badge badge-sample">Sample</span>' : ""
            }</h3>
                <span class="price-pill">${money(item.price)}</span>
              </div>
              <p>${escapeHtml(item.description || "")}</p>
            </article>`;
          })
          .join("");
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nextOpenDays(count) {
    const info = nowInShop();
    const days = [];
    // Build date objects in shop TZ by using noon UTC offset carefully.
    // Start from today's Y-M-D in shop TZ.
    let d = new Date(Date.UTC(info.year, info.month - 1, info.day, 17, 0, 0));
    // 17:00 UTC is noon ET during standard time; good enough as a date anchor.
    for (let i = 0; i < 14 && days.length < count; i++) {
      const dt = new Date(d.getTime() + i * 24 * 60 * 60 * 1000);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(dt);
      const get = (t) => parts.find((p) => p.type === t).value;
      const weekday = get("weekday");
      if (weekday === "Sun") continue;
      const iso = `${get("year")}-${get("month")}-${get("day")}`;
      days.push({ iso, weekday, label: `${weekday}, ${get("month")}/${get("day")}` });
    }
    return days;
  }

  function pickupSlots() {
    const slots = [];
    // 7:45 AM through 2:45 PM, every 15 minutes
    for (let mins = 7 * 60 + 45; mins <= 14 * 60 + 45; mins += 15) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const ampm = h >= 12 ? "PM" : "AM";
      const hr = ((h + 11) % 12) + 1;
      const label = `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      slots.push({ value, label, mins });
    }
    return slots;
  }

  function slotStillAvailable(isoDate, slotMins) {
    const info = nowInShop();
    const today = `${info.year}-${String(info.month).padStart(2, "0")}-${String(
      info.day
    ).padStart(2, "0")}`;
    if (isoDate !== today) return true;
    const nowMins = info.hour * 60 + info.minute;
    // Need at least 15 minutes of lead time
    return slotMins >= nowMins + 15;
  }

  window.Grind = {
    TZ,
    PHONE_DISPLAY,
    PHONE_TEL,
    ADDRESS,
    MAPS,
    EMAIL,
    nowInShop,
    isOpenAt,
    money,
    escapeHtml,
    nextOpenDays,
    pickupSlots,
    slotStillAvailable
  };

  document.addEventListener("DOMContentLoaded", () => {
    setOpenStatus();
    setupNav();
    renderSpecials();
  });
})();
