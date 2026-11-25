# The Grind Cafe — demo site

A pitch/demo website for The Grind Cafe, 136 W Union St, Morganton, NC 28655, designed by **Payneless Services**.

Live (GitHub Pages): https://c6879618p-lab.github.io/grind-cafe-demo/

## Pages

- `index.html` — Home, hours, address, tap-to-call, directions, today’s specials, and links to order / events / text club.
- `menu.html` — Full menu. Breakfast and lunch are transcribed from the official printed menu at [grindcafenc.com/menu](https://www.grindcafenc.com/menu) (dated 6/1/24). Drinks are marked as sample content because that printed page is not posted online.
- `order.html` — Order-ahead for pickup, with a cart and pickup-time picker. Demo only: no payments, no emails.
- `events.html` — Example live-music and special-dinner listings, plus a catering request form (demo submit).
- `rewards.html` — Text-club signup with SMS opt-in language and a buy-ten-get-one punch card.

## Editing daily specials

Update **`js/specials.js`** only. Those items appear on the home page, the menu, and in Order Ahead. Set `sample` to `false` once they are the real board.

## Hours and contact

- Monday–Saturday 7:30 AM–3:00 PM, closed Sunday (matching Google, as requested for this demo).
- Phone: (828) 430-4343
- Proposed email: hello@grindcafenc.com (replacing grindcafemorganton@att.net)

## Local preview

Open `index.html` in a browser, or from this folder run:

```bash
python3 -m http.server 8080
```
