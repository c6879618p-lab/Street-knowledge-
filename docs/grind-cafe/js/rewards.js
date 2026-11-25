(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("text-club-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("club-name").value.trim();
      const phone = document.getElementById("club-phone").value.trim();
      const consent = document.getElementById("club-consent").checked;
      const err = document.getElementById("club-error");
      if (!name || !phone) {
        err.textContent = "Please add your name and mobile number.";
        err.hidden = false;
        return;
      }
      if (!consent) {
        err.textContent = "Please check the box to agree to text messages. You can reply STOP anytime.";
        err.hidden = false;
        return;
      }
      err.hidden = true;
      document.getElementById("club-body").innerHTML = `
        <p>Welcome to the Grind text club, ${Grind.escapeHtml(name)}.</p>
        <p>In a live version, we would text this number to confirm: ${Grind.escapeHtml(
          phone
        )}.</p>
        <p class="demo-note">This is a demo. No text message was sent, and your number was not saved to a mailing list. A live program would use a text platform and honor STOP and HELP.</p>
      `;
      document.getElementById("club-modal").showModal();
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
