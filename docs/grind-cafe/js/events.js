(function () {
  // Example events for the demo, clearly labeled. Dates start after Nov 25, 2026.
  const EVENTS = [
    {
      date: "2026-11-28",
      weekday: "Saturday",
      title: "Live music on Union Street",
      time: "Evening set — time to be announced",
      blurb: "Example event. Replace this with the actual weekend lineup from the shop."
    },
    {
      date: "2026-12-05",
      weekday: "Saturday",
      title: "Holiday weekend live music",
      time: "Evening set — time to be announced",
      blurb: "Example event. A live calendar would list the real performer and start time."
    },
    {
      date: "2026-12-11",
      weekday: "Friday",
      title: "Special dinner night",
      time: "Evening — time to be announced",
      blurb: "Example event. Use this slot for a prix fixe or holiday dinner once the owner sets the date."
    }
  ];

  function formatDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 17));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(dt);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector("[data-events]");
    if (root) {
      root.innerHTML = EVENTS.map(
        (ev) => `<article class="event-card">
          <div class="event-date">
            <span class="event-dow">${Grind.escapeHtml(ev.weekday)}</span>
            <span class="event-day">${Grind.escapeHtml(formatDate(ev.date))}</span>
          </div>
          <div>
            <span class="badge badge-sample">Example event</span>
            <h3>${Grind.escapeHtml(ev.title)}</h3>
            <p class="event-time">${Grind.escapeHtml(ev.time)}</p>
            <p>${Grind.escapeHtml(ev.blurb)}</p>
          </div>
        </article>`
      ).join("");
    }

    const form = document.getElementById("catering-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const required = ["name", "phone", "email", "date", "headcount", "type"];
      const err = document.getElementById("catering-error");
      if (required.some((k) => !String(data[k] || "").trim())) {
        err.textContent = "Please fill in your name, phone, email, event date, headcount, and event type.";
        err.hidden = false;
        return;
      }
      err.hidden = true;
      document.getElementById("catering-body").innerHTML = `
        <p>Thanks, ${Grind.escapeHtml(data.name)}. We have your catering request for ${Grind.escapeHtml(
          data.headcount
        )} guests on ${Grind.escapeHtml(data.date)}.</p>
        <ul class="confirm-list">
          <li>Event type: ${Grind.escapeHtml(data.type)}</li>
          <li>Budget: ${Grind.escapeHtml(data.budget || "Not given")}</li>
          <li>Phone: ${Grind.escapeHtml(data.phone)}</li>
          <li>Email: ${Grind.escapeHtml(data.email)}</li>
        </ul>
        ${
          data.notes
            ? `<p>${Grind.escapeHtml(data.notes)}</p>`
            : ""
        }
        <p class="demo-note">This is a demo. A live site would email this request to hello@grindcafenc.com. No email was sent.</p>
      `;
      document.getElementById("catering-modal").showModal();
      form.reset();
    });
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dlg = btn.closest("dialog");
        if (dlg) dlg.close();
      });
    });
  });
})();
