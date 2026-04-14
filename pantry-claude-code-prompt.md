# Pantry PWA — Claude Code Prompt

Build a Progressive Web App called "Pantry" deployable to GitHub Pages,
installable on Android as a standalone app via Add to Home Screen.

## Tech stack
- Vanilla HTML/CSS/JS, no frameworks, no build step
- All files in /docs for GitHub Pages
- localStorage for all persistence
- manifest.json + service-worker.js for PWA installability

## File structure
docs/
  index.html          ← main app
  questionnaire.html  ← standalone form for guests
  styles.css
  app.js
  manifest.json
  service-worker.js
  icon.svg

---

## Main app (index.html)

### Navigation
Bottom tab bar with three tabs: Inventory · Diners · Plan

---

### Tab 1: Inventory

Items have: name, category (pantry / fridge / freezer), quantity +
unit, expiry date (optional), notes.

Expiry status badges:
- Fresh (> 7 days out or no date): green
- Expiring soon (≤ 7 days): amber
- Expired: red

Default view groups items by location. Filter/sort by: location,
expiring soon first, category. Tap an item to edit or delete.

Floating "+" button opens an Add Item sheet with:
- Name field
- "Scan barcode" button (see barcode section below)
- Location selector (pantry / fridge / freezer)
- Category (produce, dairy, meat, grains, canned, condiments, other)
- Quantity + unit (free text)
- Expiry date picker
- Notes

Import/export full catalog as JSON file via a settings menu.

---

### Tab 2: Diners

Manage named occasions/profiles, e.g. "Just me", "Parents visit",
"Camden + me".

Each profile contains one or more diners. Each diner record stores:
  name, restrictions[], spice (0–4), loves, dislikes, notes

Diner responses come from the questionnaire (see below). To add a
diner, the user either:
  a) Fills in details manually, or
  b) Pastes a response link from questionnaire.html and the app
     parses the #r= hash fragment to populate the record

Profiles can be tagged: "weeknight solo", "hosting", "date night"
(user-defined tags, stored as strings)

---

### Tab 3: Plan

1. Select a profile/occasion from a dropdown
2. Choose item filter:
   - All items
   - Prioritize expiring soon (sort by expiry ascending)
   - Only expiring within N days (user sets N, default 7)
3. Preview shows: selected diners with their restriction badges,
   and item count / expiring soon count
4. Two action buttons:

   "Copy prompt" — builds a text block:
     [Pre-written meal planning prompt] + JSON payload (pretty-printed)
     Copies to clipboard.

   "Open in Claude" — same payload but compressed:
     - Serialize payload to JSON
     - Compress with LZ-string (load from
       https://cdn.jsdelivr.net/npm/lz-string/libs/lz-string.min.js)
     - Build URL: https://claude.ai/new?q=ENCODED_PROMPT_AND_PAYLOAD
     - If URL length < 6000 chars: window.open(url, '_blank')
     - If >= 6000 chars: show inline warning "Inventory too large for
       direct link — use Copy prompt instead" and disable button
     - Show a live character count beneath the buttons so the user
       can see how large their payload is

   The pre-written prompt text to use:
   "Here is my pantry inventory and diner preferences as JSON. Please
   suggest 3–5 meal ideas using what I have on hand, respecting
   everyone's dietary needs, and prioritizing items expiring soon.
   For each meal include a brief ingredient list and any substitutions
   needed.\n\n"

   JSON payload shape:
   {
     "generated": "ISO timestamp",
     "occasion": "profile name",
     "diners": [
       { "name": "", "restrictions": [], "spice": 0,
         "loves": "", "dislikes": "", "notes": "" }
     ],
     "inventory": [
       { "name": "", "location": "", "category": "",
         "quantity": "", "unit": "", "expiry": "YYYY-MM-DD or null",
         "daysUntilExpiry": number or null }
     ]
   }

---

## Questionnaire (questionnaire.html)

A fully self-contained page (no shared JS with the main app).
When someone opens this page normally (no hash), they see the form.
When they open it with #r=BASE64 in the URL, it shows a "thank you /
your response" summary view instead of the form (so the link is
shareable as a receipt).

Form fields:
1. Name (text input)
2. Dietary restrictions (multi-select pill/chip toggles):
   vegetarian, vegan, gluten-free, dairy-free, nut allergy,
   shellfish allergy, halal, kosher, none
3. Spice tolerance — 5 buttons: 🥛 🌶️ 🌶️🌶️ 🌶️🌶️🌶️ 🔥
   (levels 0–4, labels: no spice / mild / medium / hot / bring it)
4. "Foods I love" (textarea)
5. "Hard nos" (textarea, label it this way — gets more honest answers)
6. Anything else? (textarea)

"Generate my response link" button:
- Encodes all answers as base64(JSON) into the URL hash:
  https://YOURSITE.github.io/pantry/questionnaire.html#r=BASE64
- Displays the link with a Copy button
- Friendly copy: "Send this link back to Madison"

The page should be warm, friendly, and mobile-optimized. No app
chrome — no bottom nav, no inventory stuff. Just the form.
The header shows "Madison's dinner questionnaire" with a
"Takes 2 minutes · helps me cook something you'll actually love"
subhead. (These strings can be configured at the top of the JS.)

---

## Barcode scanning

On the Add Item form, include a "Scan barcode" button.

On tap:
1. Check window.BarcodeDetector — if undefined, hide the button and
   show a small note "barcode scanning not supported on this device"
2. Request camera via getUserMedia({ video: { facingMode: 'environment' }})
3. Show a full-screen overlay with:
   - Live video feed
   - Centered scan-target reticle (simple rounded rect outline)
   - "Point at a barcode" hint text
   - X button to cancel
4. Run BarcodeDetector.detect(videoFrame) on a requestAnimationFrame
   loop, checking for EAN-13, EAN-8, UPC-A, UPC-E formats
5. On a hit, stop the loop and call:
   https://world.openfoodfacts.org/api/v0/product/{barcode}.json
6. Show a brief loading spinner during the fetch
7. If product found: close overlay, pre-fill Add Item form with
   product_name, infer category from categories_tags if possible,
   leave quantity/unit for user to fill. Show a small "Found via
   Open Food Facts" attribution note.
8. If not found: close overlay, show toast "Product not found —
   please fill in manually", put barcode in the notes field
9. The service worker must NOT cache openfoodfacts.org requests

---

## PWA requirements
- manifest.json: name "Pantry", short_name "Pantry",
  display: standalone, theme_color: a warm neutral,
  background_color matching, icons referencing icon.svg
- service-worker.js: cache-first for app shell files
  (index.html, questionnaire.html, styles.css, app.js,
  manifest.json, icon.svg); network-only for openfoodfacts.org
- meta viewport + theme-color meta in both HTML files
- Add to Home Screen prompt handling: listen for
  beforeinstallprompt, show a subtle install banner if the
  user hasn't installed yet

---

## Visual design
- Mobile-first, comfortable on 390px wide screens
- Warm neutral palette: off-white background, warm gray borders,
  a muted purple or teal as the accent color
- Bottom tab bar stays fixed; content area scrolls
- Expiring soon items are visually prominent
- Cards for items, generous tap targets (min 44px)
- Smooth but minimal transitions (no heavy animations)
