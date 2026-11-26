(function () {
  "use strict";

  var EMAIL = "Prodetails512@gmail.com";
  var PHONE_DISPLAY = "(828) 974-6178";
  var TIME_SLOTS = ["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM", "5:00 PM"];
  var STORAGE_KEY = "proDetailsReviews";
  var MAX_PHOTOS = 4;
  var SERVICE_LABELS = {
    "silver-package": "Silver Package (Starting at $200)",
    "gold-package": "Gold Package (Starting at $250)",
    "platinum-package": "Platinum Package (Starting at $300)",
    "custom": "Custom / Not Sure Yet"
  };

  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  var lastBooking = null;
  var selectedFiles = [];

  function $(id) { return document.getElementById(id); }

  function todayDate() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function toISODate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function parseISODate(iso) {
    var p = iso.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function formatLongDate(iso) {
    var d = parseISODate(iso);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  function parseSlot(label) {
    var parts = label.split(" ");
    var hm = parts[0].split(":");
    var h = Number(hm[0]);
    var m = Number(hm[1]);
    if (parts[1] === "PM" && h !== 12) h += 12;
    if (parts[1] === "AM" && h === 12) h = 0;
    return { hours: h, minutes: m };
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function mailto(subject, body) {
    return "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  /* Header nav */
  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = $("site-nav");
    if (!toggle || !nav) return;
    function closeNav() {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    }
    function openNav() {
      nav.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
    }
    toggle.addEventListener("click", function () {
      if (nav.classList.contains("open")) closeNav();
      else openNav();
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeNav);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });
  }

  /* Calendar */
  function initCalendar() {
    var view = todayDate();
    view.setDate(1);
    var selectedDate = "";
    var selectedTime = "";

    var monthEl = $("cal-month");
    var grid = $("cal-grid");
    var prev = $("cal-prev");
    var next = $("cal-next");
    var selectedLabel = $("cal-selected");
    var slotsWrap = $("time-slots");
    var timeList = $("time-list");
    var dateInput = $("book-date");
    var timeInput = $("book-time");

    function isPastTime(iso, label) {
      var now = new Date();
      if (iso !== toISODate(now)) return false;
      var t = parseSlot(label);
      var slot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.hours, t.minutes, 0, 0);
      return slot.getTime() <= now.getTime();
    }

    function renderSlots() {
      timeList.innerHTML = "";
      if (!selectedDate) {
        slotsWrap.hidden = true;
        return;
      }
      slotsWrap.hidden = false;
      TIME_SLOTS.forEach(function (label) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "time-slot";
        btn.textContent = label;
        var past = isPastTime(selectedDate, label);
        btn.disabled = past;
        btn.setAttribute("aria-pressed", selectedTime === label && !past ? "true" : "false");
        if (past) btn.title = "This time has already passed";
        btn.addEventListener("click", function () {
          selectedTime = label;
          timeInput.value = label;
          renderSlots();
          updateSelectedLabel();
        });
        timeList.appendChild(btn);
      });
      if (selectedTime && isPastTime(selectedDate, selectedTime)) {
        selectedTime = "";
        timeInput.value = "";
      }
    }

    function updateSelectedLabel() {
      if (!selectedDate) {
        selectedLabel.textContent = "Select a date to see available time slots.";
        return;
      }
      var text = "Selected: " + formatLongDate(selectedDate);
      if (selectedTime) text += " at " + selectedTime;
      else text += " — now pick a time";
      selectedLabel.textContent = text;
    }

    function render() {
      var year = view.getFullYear();
      var month = view.getMonth();
      monthEl.textContent = MONTHS[month] + " " + year;
      var firstDow = new Date(year, month, 1).getDay();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var today = todayDate();
      var startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      prev.disabled = view.getTime() <= startOfThisMonth.getTime();

      grid.innerHTML = "";
      var i;
      for (i = 0; i < firstDow; i++) {
        var empty = document.createElement("div");
        empty.className = "cal-empty";
        empty.setAttribute("aria-hidden", "true");
        grid.appendChild(empty);
      }
      for (var day = 1; day <= daysInMonth; day++) {
        var dateObj = new Date(year, month, day);
        var iso = toISODate(dateObj);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cal-day";
        btn.textContent = String(day);
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("aria-label", formatLongDate(iso));
        var isPast = dateObj.getTime() < today.getTime();
        btn.disabled = isPast;
        if (dateObj.getTime() === today.getTime()) btn.classList.add("is-today");
        if (iso === selectedDate) {
          btn.classList.add("is-selected");
          btn.setAttribute("aria-selected", "true");
        } else {
          btn.setAttribute("aria-selected", "false");
        }
        btn.addEventListener("click", function (isoCopy) {
          return function () {
            selectedDate = isoCopy;
            dateInput.value = isoCopy;
            render();
            renderSlots();
            updateSelectedLabel();
          };
        }(iso));
        grid.appendChild(btn);
      }
    }

    prev.addEventListener("click", function () {
      view.setMonth(view.getMonth() - 1);
      render();
    });
    next.addEventListener("click", function () {
      view.setMonth(view.getMonth() + 1);
      render();
    });

    render();
    renderSlots();
  }

  function initServiceButtons() {
    document.querySelectorAll(".book-service").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var value = btn.getAttribute("data-service");
        var select = $("book-service");
        if (select && value) select.value = value;
        var book = $("book");
        if (book) book.scrollIntoView({ behavior: "smooth", block: "start" });
        if (select) {
          select.focus({ preventScroll: true });
        }
      });
    });
  }

  function validateBooking(data) {
    if (!data.name) return "Please enter your name.";
    if (!data.phone) return "Please enter your phone number.";
    if (!data.email) return "Please enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Please enter a valid email address.";
    if (!data.vehicle) return "Please enter your vehicle year, make, and model.";
    if (!data.service) return "Please choose a package.";
    if (!data.date) return "Please select a date on the calendar.";
    if (!data.time) return "Please select a time slot.";
    return "";
  }

  function bookingBody(data) {
    return [
      "Hello Pro Details,",
      "",
      "I would like to request an appointment.",
      "",
      "Name: " + data.name,
      "Phone: " + data.phone,
      "Email: " + data.email,
      "Vehicle: " + data.vehicle,
      "Package: " + (SERVICE_LABELS[data.service] || data.service),
      "Requested date: " + formatLongDate(data.date),
      "Requested time: " + data.time,
      "Notes: " + (data.notes || "(none)"),
      "",
      "Please confirm this appointment by phone or email. Thank you."
    ].join("\r\n");
  }

  function buildICS(data) {
    var t = parseSlot(data.time);
    var start = data.date.replace(/-/g, "") + "T" + pad(t.hours) + pad(t.minutes) + "00";
    var endHour = t.hours + 1;
    var endDate = data.date.replace(/-/g, "");
    if (endHour >= 24) {
      endHour = endHour - 24;
      var d = parseISODate(data.date);
      d.setDate(d.getDate() + 1);
      endDate = toISODate(d).replace(/-/g, "");
    }
    var end = endDate + "T" + pad(endHour) + pad(t.minutes) + "00";
    var stamp = new Date();
    var dtstamp = stamp.getUTCFullYear() + pad(stamp.getUTCMonth() + 1) + pad(stamp.getUTCDate()) + "T" +
      pad(stamp.getUTCHours()) + pad(stamp.getUTCMinutes()) + pad(stamp.getUTCSeconds()) + "Z";
    var uid = "prodetails-" + data.date + "-" + start + "@pro-details-preview";
    var desc = "Appointment REQUEST with Pro Details. This time is not confirmed until Pro Details replies by phone or email. Phone: " + PHONE_DISPLAY + ". Email: " + EMAIL + ".";
    var summary = "Pro Details appointment request — " + (SERVICE_LABELS[data.service] || data.service);
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Pro Details//Appointment Request//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + dtstamp,
      "DTSTART;TZID=America/New_York:" + start,
      "DTEND;TZID=America/New_York:" + end,
      "SUMMARY:" + summary.replace(/[,\\;]/g, " "),
      "DESCRIPTION:" + desc.replace(/[,\\;]/g, " "),
      "LOCATION:Serving Western NC",
      "STATUS:TENTATIVE",
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return lines.join("\r\n") + "\r\n";
  }

  function showSummary(data) {
    var box = $("booking-summary");
    var list = $("summary-list");
    var emailLink = $("summary-email");
    if (!box || !list || !emailLink) return;
    var rows = [
      ["Name", data.name],
      ["Phone", data.phone],
      ["Email", data.email],
      ["Vehicle", data.vehicle],
      ["Package", SERVICE_LABELS[data.service] || data.service],
      ["Requested date", formatLongDate(data.date)],
      ["Requested time", data.time],
      ["Notes", data.notes || "—"]
    ];
    list.innerHTML = rows.map(function (row) {
      return "<dt>" + escapeHtml(row[0]) + "</dt><dd>" + escapeHtml(row[1]) + "</dd>";
    }).join("");
    var subject = "Appointment request — " + (SERVICE_LABELS[data.service] || "Pro Details") + " on " + formatLongDate(data.date);
    emailLink.href = mailto(subject, bookingBody(data));
    box.hidden = false;
    box.focus();
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function initBooking() {
    var form = $("booking-form");
    var error = $("booking-error");
    var icsBtn = $("download-ics");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {
        name: $("book-name").value.trim(),
        phone: $("book-phone").value.trim(),
        email: $("book-email").value.trim(),
        vehicle: $("book-vehicle").value.trim(),
        service: $("book-service").value,
        notes: $("book-notes").value.trim(),
        date: $("book-date").value,
        time: $("book-time").value
      };
      var msg = validateBooking(data);
      if (msg) {
        error.hidden = false;
        error.textContent = msg;
        error.focus();
        return;
      }
      error.hidden = true;
      error.textContent = "";
      lastBooking = data;
      showSummary(data);
      var subject = "Appointment request — " + (SERVICE_LABELS[data.service] || "Pro Details") + " on " + formatLongDate(data.date);
      window.location.href = mailto(subject, bookingBody(data));
    });

    if (icsBtn) {
      icsBtn.addEventListener("click", function () {
        if (!lastBooking) return;
        var blob = new Blob([buildICS(lastBooking)], { type: "text/calendar;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "pro-details-appointment-request.ics";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }
  }

  /* Reviews */
  function loadReviews() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveReviews(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      try {
        var smaller = list.map(function (r) {
          return {
            id: r.id,
            name: r.name,
            vehicle: r.vehicle,
            rating: r.rating,
            text: r.text,
            createdAt: r.createdAt,
            photos: (r.photos || []).slice(0, 2)
          };
        }).slice(0, 10);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(smaller));
        return true;
      } catch (err2) {
        return false;
      }
    }
  }

  function starString(n) {
    var s = "";
    var i;
    for (i = 1; i <= 5; i++) s += i <= n ? "★" : "☆";
    return s;
  }

  function reviewMailto(review) {
    var subject = "Customer review (" + review.rating + "/5) from " + review.name;
    var body = [
      "Hello Pro Details,",
      "",
      "I just left a review on the website.",
      "",
      "Name: " + review.name,
      "Rating: " + review.rating + " / 5",
      "Vehicle / Service: " + (review.vehicle || "(not provided)"),
      "",
      "Review:",
      review.text,
      "",
      "If I selected photos, I will attach them in this email. (The website cannot attach files automatically.)",
      "",
      "Thank you."
    ].join("\r\n");
    return mailto(subject, body);
  }

  function renderReviews() {
    var mount = $("reviews-list");
    if (!mount) return;
    var reviews = loadReviews().slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    if (!reviews.length) {
      mount.innerHTML = '<div class="review-empty"><h3>Be the first to leave a review</h3><p>Share a note about the work and add photos if you have them. Your review will appear here on this device, and you can email it to Pro Details in one tap.</p></div>';
      return;
    }
    mount.innerHTML = reviews.map(function (r) {
      var photos = (r.photos || []).map(function (src, i) {
        return '<img src="' + src + '" alt="Photo ' + (i + 1) + ' from ' + escapeHtml(r.name) + '\'s review">';
      }).join("");
      var when = r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
      var meta = [r.vehicle, when].filter(Boolean).join(" · ");
      return (
        '<article class="review-card">' +
          '<div class="review-top">' +
            "<h3>" + escapeHtml(r.name) + "</h3>" +
            '<div class="review-stars" aria-label="' + r.rating + ' out of 5 stars">' + starString(r.rating) + "</div>" +
          "</div>" +
          (meta ? '<p class="review-meta">' + escapeHtml(meta) + "</p>" : "") +
          "<p>" + escapeHtml(r.text) + "</p>" +
          (photos ? '<div class="review-photos">' + photos + "</div>" : "") +
          '<p><a class="btn btn-text" href="' + reviewMailto(r) + '">Email Review &amp; Photos to Pro Details</a></p>' +
        "</article>"
      );
    }).join("");
  }

  function initStars() {
    var picker = $("star-picker");
    var input = $("rev-rating");
    if (!picker || !input) return;
    var buttons = Array.prototype.slice.call(picker.querySelectorAll("button"));

    function paint(value, hover) {
      buttons.forEach(function (btn) {
        var v = Number(btn.getAttribute("data-value"));
        btn.classList.toggle("is-on", v <= value && !hover);
        btn.classList.toggle("is-hover", hover && v <= hover);
        btn.setAttribute("aria-checked", v === value ? "true" : "false");
      });
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = Number(btn.getAttribute("data-value"));
        input.value = String(v);
        paint(v, 0);
      });
      btn.addEventListener("mouseenter", function () {
        paint(Number(input.value || 0), Number(btn.getAttribute("data-value")));
      });
      btn.addEventListener("focus", function () {
        paint(Number(input.value || 0), Number(btn.getAttribute("data-value")));
      });
    });
    picker.addEventListener("mouseleave", function () {
      paint(Number(input.value || 0), 0);
    });
  }

  function revokeAll(files) {
    files.forEach(function (f) {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
  }

  function renderPhotoPreviews() {
    var mount = $("photo-previews");
    if (!mount) return;
    mount.innerHTML = "";
    selectedFiles.forEach(function (item, index) {
      var wrap = document.createElement("div");
      wrap.className = "thumb-wrap";
      var img = document.createElement("img");
      img.className = "thumb";
      img.alt = "Selected photo " + (index + 1);
      img.src = item.previewUrl;
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "thumb-remove";
      rm.setAttribute("aria-label", "Remove photo " + (index + 1));
      rm.textContent = "×";
      rm.addEventListener("click", function () {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        selectedFiles.splice(index, 1);
        renderPhotoPreviews();
        var input = $("rev-photos");
        if (input) input.value = "";
      });
      wrap.appendChild(img);
      wrap.appendChild(rm);
      mount.appendChild(wrap);
    });
  }

  function resizeImage(file) {
    return new Promise(function (resolve) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        resolve(null);
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 900;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        var data = canvas.toDataURL("image/jpeg", 0.72);
        resolve(data);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  function initPhotos() {
    var input = $("rev-photos");
    if (!input) return;
    input.addEventListener("change", function () {
      var incoming = Array.prototype.slice.call(input.files || []);
      incoming.forEach(function (file) {
        if (selectedFiles.length >= MAX_PHOTOS) return;
        selectedFiles.push({
          file: file,
          previewUrl: URL.createObjectURL(file)
        });
      });
      if (selectedFiles.length > MAX_PHOTOS) {
        revokeAll(selectedFiles.slice(MAX_PHOTOS));
        selectedFiles = selectedFiles.slice(0, MAX_PHOTOS);
      }
      renderPhotoPreviews();
    });
  }

  function initReviewForm() {
    var form = $("review-form");
    var error = $("review-error");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("rev-name").value.trim();
      var vehicle = $("rev-vehicle").value.trim();
      var rating = Number($("rev-rating").value || 0);
      var text = $("rev-text").value.trim();
      var msg = "";
      if (!name) msg = "Please enter your name.";
      else if (!(rating >= 1 && rating <= 5)) msg = "Please choose a star rating.";
      else if (!text) msg = "Please write a short review.";
      if (msg) {
        error.hidden = false;
        error.textContent = msg;
        return;
      }
      error.hidden = true;

      var files = selectedFiles.slice();
      Promise.all(files.map(function (item) { return resizeImage(item.file); })).then(function (photos) {
        var review = {
          id: "r-" + Date.now(),
          name: name,
          vehicle: vehicle,
          rating: rating,
          text: text,
          photos: photos.filter(Boolean),
          createdAt: Date.now()
        };
        var list = loadReviews();
        list.push(review);
        var saved = saveReviews(list);
        if (!saved) {
          review.photos = [];
          saveReviews(list.map(function (r) {
            if (r.id === review.id) {
              return { id: r.id, name: r.name, vehicle: r.vehicle, rating: r.rating, text: r.text, createdAt: r.createdAt, photos: [] };
            }
            return { id: r.id, name: r.name, vehicle: r.vehicle, rating: r.rating, text: r.text, createdAt: r.createdAt, photos: [] };
          }));
        }
        revokeAll(selectedFiles);
        selectedFiles = [];
        form.reset();
        $("rev-rating").value = "";
        document.querySelectorAll("#star-picker button").forEach(function (btn) {
          btn.classList.remove("is-on", "is-hover");
          btn.setAttribute("aria-checked", "false");
        });
        renderPhotoPreviews();
        renderReviews();
        var note = document.createElement("p");
        note.className = "fine-print";
        note.id = "review-thanks";
        note.innerHTML = "Thanks — your review is now shown above on this device. Use <a href=\"" + reviewMailto(review) + "\">Email Review &amp; Photos to Pro Details</a> and attach any photos in your email app. Public reviews for every visitor will need a free backend later.";
        var existing = $("review-thanks");
        if (existing) existing.remove();
        form.appendChild(note);
        var listEl = $("reviews-list");
        if (listEl) listEl.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var year = $("year");
    if (year) year.textContent = String(new Date().getFullYear());
    initNav();
    initCalendar();
    initServiceButtons();
    initBooking();
    initStars();
    initPhotos();
    initReviewForm();
    renderReviews();
  });
})();
