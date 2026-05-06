# Pantry

A mobile-first PWA for tracking pantry inventory and planning meals around the people eating them. Runs entirely in the browser — no backend, no account required. Data syncs to a GitHub repo of your choice.

**Live app:** https://mrerving.github.io/groceriestheycallthem/

---

## Installation

Open the URL above on your phone and tap **Add to Home Screen** (iOS: Share → Add to Home Screen; Android: the install banner appears automatically). The app works offline once installed.

---

## Inventory

The **Inventory** tab is your pantry, fridge, freezer, and spice cabinet in one list.

- Tap **+** to add an item manually — set name, location, category, quantity, unit, and optional expiry date
- Tap any item to edit or delete it
- Use the **Scan** button inside the add-item sheet to scan a barcode; product name and category are filled in automatically via [Open Food Facts](https://world.openfoodfacts.org)
- Filter by **Expiring soon** (within 7 days) or **By category** using the chips at the top

### Receipt scanning

Tap **⚙ → Scan receipt**, then photograph a grocery receipt. The app sends the image to Claude (via your Anthropic API key) and presents a checklist of detected items — uncheck anything you don't want, then tap **Add items**.

To set your Anthropic API key: **⚙ → API settings**.

---

## Diners

The **Diners** tab manages the people who eat with you and the occasions you cook for.

### People

Each person has a full preference profile: dietary restrictions, spice tolerance, cuisine preferences, protein preferences, meal formats, polarizing foods they actually like, and free-text loves/dislikes/notes.

- Tap **+ Diner** to create a person
- Tap any person to edit their profile
- Profiles are shared — one person can appear in many occasions

**Filling in a profile from a survey link:** when editing a diner, paste a questionnaire response link into the "Paste questionnaire link" field and the form auto-fills. To get a shareable survey link, tap **Share survey** — send that URL to a guest and they fill it in on their own device.

### Occasions

An occasion groups people together for a specific meal or event (e.g. "Friday dinner", "Holiday party").

- Tap **+ Occasion** to create one, optionally adding comma-separated tags
- Tap **+ Add diners** on any occasion card to pick which people are coming from your global diners list
- Tap ✏️ to rename or delete an occasion

---

## Meal Plan

The **Plan** tab builds a Claude prompt from your selected occasion and current inventory.

1. Choose an **Occasion** from the dropdown — the diners and their restrictions are shown as a preview
2. Set an **Item filter**: all inventory, expiring soon, or items expiring within N days
3. Tap **Copy prompt** to copy the full JSON payload, then paste it into any Claude conversation
4. Or tap **Open in Claude** to launch Claude with the prompt pre-loaded (works for smaller inventories)

---

## GitHub sync

Your data (inventory, diners, occasions) can be synced to a file in any GitHub repository. Each sync creates a real git commit, so you get full history.

### Setup

1. Create a GitHub [personal access token](https://github.com/settings/tokens) with **Contents** read/write scope on the target repo
2. In the app: **⚙ → GitHub sync**
3. Fill in:
   - **Token** — your PAT (`ghp_...`)
   - **Repository** — `owner/repo` (e.g. `mrerving/groceriestheycallthem`)
   - **Data file path** — defaults to `data/pantry-data.json`
4. Tap **Save settings**

### Usage

- The app **pulls automatically on every launch** — if the file exists, local data is replaced with the repo version
- Every save (adding/editing/deleting items, diners, or occasions) **pushes automatically**
- Use **Pull from GitHub** / **Push to GitHub** in the settings sheet to sync manually at any time

The token is stored only in your browser's localStorage and is never written to the repo file.

---

## Import / Export

**⚙ → Export JSON** downloads a `pantry-export-YYYY-MM-DD.json` file containing all items, diners, and occasions. **⚙ → Import JSON** loads that file back — useful for moving data between browsers or backing up locally. Old exports (with diners nested inside occasions) are migrated automatically on import.

---

## Development

The app is a single-page PWA with no build step:

```
docs/
  index.html        # shell + all dialogs
  app.js            # all application logic (~1400 lines)
  styles.css        # mobile-first styles
  service-worker.js # cache-first PWA shell, network-only for external APIs
  questionnaire.html # standalone guest survey page
  manifest.json
```

GitHub Pages serves the `docs/` folder from the `main` branch. Feature development happens on `development`.
