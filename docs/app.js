/* ============================================================
   PANTRY PWA — app.js
   Sections: A. Constants/helpers  B. State  C. Inventory
             D. Barcode  E. Diners  F. Plan
             G. Routing  H. PWA/install  I. Boot
   ============================================================ */

/* ============================================================
   A. CONSTANTS & HELPERS
   ============================================================ */

const STORAGE_KEYS = {
  ITEMS:    'pantry_items',
  PROFILES: 'pantry_profiles',
  SETTINGS: 'pantry_settings'
};

function generateId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Returns days until ISO date (negative = past), or null if no date. */
function daysUntilExpiry(isoDate) {
  if (!isoDate) return null;
  const ms = new Date(isoDate) - new Date();
  return Math.ceil(ms / 86400000);
}

/** Returns 'fresh' | 'expiring' | 'expired' */
function expiryStatus(days) {
  if (days === null) return 'fresh';
  if (days < 0)  return 'expired';
  if (days <= 7) return 'expiring';
  return 'fresh';
}

function formatExpiry(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Decode base64 from questionnaire (handles non-ASCII) */
function decodeQR(encoded) {
  return JSON.parse(decodeURIComponent(escape(atob(encoded))));
}

const Storage = {
  getItems:     () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ITEMS)    || '[]'); } catch { return []; } },
  saveItems:    (v) => { try { localStorage.setItem(STORAGE_KEYS.ITEMS,    JSON.stringify(v)); } catch { showToast('Storage full — could not save'); } },
  getProfiles:  () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]'); } catch { return []; } },
  saveProfiles: (v) => { try { localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(v)); } catch { showToast('Storage full — could not save'); } },
  getSettings:  () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}'); } catch { return {}; } },
  saveSettings: (v) => { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(v)); }
};

/* ============================================================
   B. STATE
   ============================================================ */

let items    = [];
let profiles = [];
let settings = {};

function loadState() {
  items    = Storage.getItems();
  profiles = Storage.getProfiles();
  settings = Storage.getSettings();
}

/* ============================================================
   G. ROUTING
   ============================================================ */

let currentTab             = 'inventory';
let currentInventoryFilter = 'all';

function showTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  const fab = document.getElementById('fab-add');
  fab.style.display = name === 'inventory' ? 'flex' : 'none';
  if (name === 'inventory') renderInventory(currentInventoryFilter);
  if (name === 'diners')    renderDiners();
  if (name === 'plan')      renderPlan();
}

/* ============================================================
   H. PWA / INSTALL
   ============================================================ */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(console.error);
  }
}

let deferredInstallPrompt = null;

function initInstallBanner() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!settings.installDismissed) {
      document.getElementById('install-banner').classList.remove('hidden');
    }
  });

  document.getElementById('btn-install').addEventListener('click', () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      document.getElementById('install-banner').classList.add('hidden');
    });
  });

  document.getElementById('btn-install-dismiss').addEventListener('click', () => {
    settings.installDismissed = true;
    Storage.saveSettings(settings);
    document.getElementById('install-banner').classList.add('hidden');
  });
}

/* ============================================================
   TOAST
   ============================================================ */

function showToast(msg, duration = 3000) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => {
    t.classList.add('removing');
    setTimeout(() => t.remove(), 220);
  }, duration);
}

/* ============================================================
   C. INVENTORY TAB
   ============================================================ */

const LOCATION_LABELS = { pantry: 'Pantry', fridge: 'Fridge', freezer: 'Freezer' };
const LOCATION_ICONS  = { pantry: '🗄️', fridge: '🧊', freezer: '❄️' };
const LOCATION_ORDER  = ['pantry', 'fridge', 'freezer'];

function renderInventory(filter) {
  if (filter !== undefined) currentInventoryFilter = filter;
  const f = currentInventoryFilter;

  // Update filter chip UI
  document.querySelectorAll('#inventory-filter-bar .filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === f);
  });

  let list = [...items];

  // Apply filter
  if (f === 'expiring') {
    list = list.filter(i => {
      const d = daysUntilExpiry(i.expiry);
      return d !== null && d <= 7;
    });
  }

  const container = document.getElementById('inventory-list');

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <p>${f === 'expiring' ? 'No items expiring soon.' : 'No items yet.<br>Tap + to add your first item.'}</p>
      </div>`;
    return;
  }

  if (f === 'category') {
    // Group by category
    const cats = {};
    list.forEach(i => {
      const c = i.category || 'other';
      if (!cats[c]) cats[c] = [];
      cats[c].push(i);
    });
    container.innerHTML = Object.entries(cats).map(([cat, catItems]) => `
      <div class="location-group">
        <div class="location-heading"><span class="location-icon">📦</span>${esc(cat.charAt(0).toUpperCase() + cat.slice(1))}</div>
        ${catItems.map(buildItemCard).join('')}
      </div>`).join('');
  } else {
    // Group by location
    const byLoc = {};
    LOCATION_ORDER.forEach(loc => { byLoc[loc] = []; });
    list.forEach(i => {
      const loc = i.location || 'pantry';
      if (!byLoc[loc]) byLoc[loc] = [];
      byLoc[loc].push(i);
    });
    container.innerHTML = LOCATION_ORDER
      .filter(loc => byLoc[loc].length > 0)
      .map(loc => `
        <div class="location-group">
          <div class="location-heading">
            <span class="location-icon">${LOCATION_ICONS[loc]}</span>${LOCATION_LABELS[loc]}
          </div>
          ${byLoc[loc].map(buildItemCard).join('')}
        </div>`).join('');
  }

  // Attach click handlers
  container.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => {
      const item = items.find(i => i.id === card.dataset.id);
      if (item) openEditItemSheet(item);
    });
  });
}

function buildItemCard(item) {
  const days   = daysUntilExpiry(item.expiry);
  const status = expiryStatus(days);
  const badgeLabel = status === 'expired'  ? 'Expired'
                   : status === 'expiring' ? 'Expiring soon'
                   : '';
  const badgeHtml = badgeLabel
    ? `<span class="badge badge-${status}">${badgeLabel}</span>`
    : `<span class="badge badge-fresh">Fresh</span>`;
  const expiryLine = item.expiry
    ? `<span>${formatExpiry(item.expiry)}</span>`
    : '';
  const qty = [item.quantity, item.unit].filter(Boolean).join(' ');
  return `
    <div class="item-card" data-id="${esc(item.id)}">
      <div class="item-card-body">
        <div class="item-name">${esc(item.name)}</div>
        <div class="item-meta">${esc(qty)}${qty && expiryLine ? ' · ' : ''}${expiryLine}</div>
      </div>
      <div class="item-card-right">${badgeHtml}</div>
    </div>`;
}

/* ---- Add / Edit item sheet ---- */

let currentEditItemId = null;

function openAddItemSheet() {
  currentEditItemId = null;
  document.getElementById('item-sheet-title').textContent = 'Add item';
  document.getElementById('item-name').value     = '';
  document.getElementById('item-location').value = 'pantry';
  document.getElementById('item-category').value = 'other';
  document.getElementById('item-quantity').value  = '';
  document.getElementById('item-unit').value      = '';
  document.getElementById('item-expiry').value    = '';
  document.getElementById('item-notes').value     = '';
  document.getElementById('item-delete-btn').style.display = 'none';
  document.getElementById('scan-attribution').style.display = 'none';
  document.getElementById('item-sheet').showModal();
}

function openEditItemSheet(item) {
  currentEditItemId = item.id;
  document.getElementById('item-sheet-title').textContent = 'Edit item';
  document.getElementById('item-name').value     = item.name     || '';
  document.getElementById('item-location').value = item.location || 'pantry';
  document.getElementById('item-category').value = item.category || 'other';
  document.getElementById('item-quantity').value  = item.quantity || '';
  document.getElementById('item-unit').value      = item.unit     || '';
  document.getElementById('item-expiry').value    = item.expiry   || '';
  document.getElementById('item-notes').value     = item.notes    || '';
  document.getElementById('item-delete-btn').style.display = '';
  document.getElementById('scan-attribution').style.display = 'none';
  document.getElementById('item-sheet').showModal();
}

function saveItem() {
  const name = document.getElementById('item-name').value.trim();
  if (!name) {
    document.getElementById('item-name').focus();
    return;
  }
  const now = new Date().toISOString();
  if (currentEditItemId) {
    const idx = items.findIndex(i => i.id === currentEditItemId);
    if (idx !== -1) {
      items[idx] = {
        ...items[idx],
        name,
        location: document.getElementById('item-location').value,
        category: document.getElementById('item-category').value,
        quantity: document.getElementById('item-quantity').value.trim(),
        unit:     document.getElementById('item-unit').value.trim(),
        expiry:   document.getElementById('item-expiry').value || null,
        notes:    document.getElementById('item-notes').value.trim(),
        updatedAt: now
      };
    }
  } else {
    items.push({
      id:        generateId(),
      name,
      location:  document.getElementById('item-location').value,
      category:  document.getElementById('item-category').value,
      quantity:  document.getElementById('item-quantity').value.trim(),
      unit:      document.getElementById('item-unit').value.trim(),
      expiry:    document.getElementById('item-expiry').value || null,
      notes:     document.getElementById('item-notes').value.trim(),
      createdAt: now,
      updatedAt: now
    });
  }
  Storage.saveItems(items);
  document.getElementById('item-sheet').close();
  renderInventory();
}

function deleteItem(id) {
  items = items.filter(i => i.id !== id);
  Storage.saveItems(items);
  document.getElementById('item-sheet').close();
  renderInventory();
}

/* ---- Import / Export ---- */

function exportJSON() {
  const data = { items, profiles };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `pantry-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.items) || !Array.isArray(data.profiles)) {
        throw new Error('Invalid format');
      }
      items    = data.items;
      profiles = data.profiles;
      Storage.saveItems(items);
      Storage.saveProfiles(profiles);
      renderInventory();
      showToast('Import successful');
    } catch {
      showToast('Import failed — invalid file');
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   D. BARCODE SCANNING
   ============================================================ */

let scanActive = false;
let scanStream = null;
let barcodeDetector = null;

function initBarcodeScanner() {
  if (!('BarcodeDetector' in window)) {
    document.getElementById('btn-scan').style.display = 'none';
    document.getElementById('barcode-unsupported').style.display = 'block';
    return;
  }
  barcodeDetector = new BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e']
  });
}

function openScanOverlay() {
  const overlay = document.getElementById('scan-overlay');
  const video   = document.getElementById('scan-video');
  const spinner = document.getElementById('scan-spinner');

  spinner.classList.remove('visible');
  overlay.showModal();

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      scanStream  = stream;
      scanActive  = true;
      video.srcObject = stream;
      video.oncanplay = () => {
        video.play().then(() => scanLoop(video)).catch(console.error);
      };
    })
    .catch(err => {
      overlay.close();
      showToast('Camera access denied');
      console.error(err);
    });
}

function scanLoop(video) {
  if (!scanActive) return;
  barcodeDetector.detect(video)
    .then(results => {
      if (!scanActive) return;
      if (results.length > 0) {
        stopScan();
        lookupBarcode(results[0].rawValue);
      } else {
        requestAnimationFrame(() => scanLoop(video));
      }
    })
    .catch(() => {
      if (scanActive) requestAnimationFrame(() => scanLoop(video));
    });
}

function stopScan() {
  scanActive = false;
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  const overlay = document.getElementById('scan-overlay');
  if (overlay.open) overlay.close();
}

function lookupBarcode(code) {
  // Show loading state in item sheet (overlay already closed by stopScan)
  // Re-open the item sheet if it isn't open
  const itemSheet = document.getElementById('item-sheet');
  if (!itemSheet.open) itemSheet.showModal();

  // Temporarily show a note in the name field
  const nameInput = document.getElementById('item-name');
  const origPlaceholder = nameInput.placeholder;
  nameInput.placeholder = 'Looking up barcode…';
  nameInput.disabled = true;

  fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`)
    .then(r => r.json())
    .then(data => {
      nameInput.disabled = false;
      nameInput.placeholder = origPlaceholder;
      if (data.status === 1 && data.product) {
        const p = data.product;
        nameInput.value = p.product_name || code;
        const cat = inferCategory(p);
        if (cat) document.getElementById('item-category').value = cat;
        document.getElementById('scan-attribution').style.display = 'block';
        showToast('Product found!');
      } else {
        document.getElementById('item-notes').value = code;
        showToast('Product not found — please fill in manually');
      }
    })
    .catch(() => {
      nameInput.disabled = false;
      nameInput.placeholder = origPlaceholder;
      document.getElementById('item-notes').value = code;
      showToast('Could not reach Open Food Facts — barcode saved in notes');
    });
}

function inferCategory(product) {
  const tags = (product.categories_tags || []).join(' ').toLowerCase();
  if (tags.includes('dairy') || tags.includes('milk') || tags.includes('cheese') || tags.includes('yogurt')) return 'dairy';
  if (tags.includes('meat') || tags.includes('poultry') || tags.includes('beef') || tags.includes('chicken')) return 'meat';
  if (tags.includes('produce') || tags.includes('vegetable') || tags.includes('fruit') || tags.includes('fresh')) return 'produce';
  if (tags.includes('grain') || tags.includes('cereal') || tags.includes('bread') || tags.includes('pasta') || tags.includes('rice')) return 'grains';
  if (tags.includes('canned') || tags.includes('tinned') || tags.includes('preserved')) return 'canned';
  if (tags.includes('condiment') || tags.includes('sauce') || tags.includes('dressing') || tags.includes('spice')) return 'condiments';
  return null; // leave as-is
}

/* ============================================================
   E. DINERS TAB
   ============================================================ */

const SPICE_EMOJI = ['🥛','🌶️','🌶️🌶️','🌶️🌶️🌶️','🔥'];
const SPICE_LABEL = ['No spice','Mild','Medium','Hot','Bring it'];

function renderDiners() {
  const container = document.getElementById('diners-list');
  if (profiles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <p>No occasions yet.<br>Tap "+ Occasion" to create one.</p>
      </div>`;
    return;
  }
  container.innerHTML = profiles.map(profile => {
    const tagsHtml = (profile.tags || []).length
      ? profile.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')
      : '';
    const dinersHtml = (profile.diners || []).map(d => {
      const rBadges = (d.restrictions || [])
        .map(r => `<span class="restriction-badge">${esc(r)}</span>`).join('');
      return `
        <div class="diner-row" data-profile-id="${esc(profile.id)}" data-diner-id="${esc(d.id)}">
          <div class="diner-info">
            <div class="diner-name">${esc(d.name)}</div>
            <div class="diner-restrictions">${rBadges}</div>
          </div>
          <div class="spice-display">${SPICE_EMOJI[d.spice ?? 0]}</div>
        </div>`;
    }).join('');
    return `
      <div class="profile-card">
        <div class="profile-header" data-profile-id="${esc(profile.id)}">
          <div>
            <div class="profile-name">${esc(profile.name)}</div>
            ${tagsHtml ? `<div class="profile-tags">${tagsHtml}</div>` : ''}
          </div>
          <button class="btn-ghost edit-profile-btn" data-profile-id="${esc(profile.id)}" style="padding:6px">✏️</button>
        </div>
        <div class="diner-list">${dinersHtml}</div>
        <div class="profile-actions">
          <button class="btn btn-secondary add-diner-btn" data-profile-id="${esc(profile.id)}">+ Add diner</button>
        </div>
      </div>`;
  }).join('');

  // Wire diner row clicks
  container.querySelectorAll('.diner-row').forEach(row => {
    row.addEventListener('click', () => {
      const profile = profiles.find(p => p.id === row.dataset.profileId);
      const diner   = profile?.diners.find(d => d.id === row.dataset.dinerId);
      if (profile && diner) openEditDinerSheet(profile.id, diner);
    });
  });

  // Wire edit profile buttons
  container.querySelectorAll('.edit-profile-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const profile = profiles.find(p => p.id === btn.dataset.profileId);
      if (profile) openEditProfileSheet(profile);
    });
  });

  // Wire add diner buttons
  container.querySelectorAll('.add-diner-btn').forEach(btn => {
    btn.addEventListener('click', () => openAddDinerSheet(btn.dataset.profileId));
  });
}

/* ---- Profile sheet ---- */

let currentEditProfileId = null;

function openAddProfileSheet() {
  currentEditProfileId = null;
  document.getElementById('profile-sheet-title').textContent = 'Add occasion';
  document.getElementById('profile-name').value = '';
  document.getElementById('profile-tags').value = '';
  document.getElementById('profile-delete-btn').style.display = 'none';
  document.getElementById('profile-sheet').showModal();
}

function openEditProfileSheet(profile) {
  currentEditProfileId = profile.id;
  document.getElementById('profile-sheet-title').textContent = 'Edit occasion';
  document.getElementById('profile-name').value = profile.name || '';
  document.getElementById('profile-tags').value = (profile.tags || []).join(', ');
  document.getElementById('profile-delete-btn').style.display = '';
  document.getElementById('profile-sheet').showModal();
}

function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  if (!name) { document.getElementById('profile-name').focus(); return; }
  const tags = document.getElementById('profile-tags').value
    .split(',').map(t => t.trim()).filter(Boolean);
  if (currentEditProfileId) {
    const idx = profiles.findIndex(p => p.id === currentEditProfileId);
    if (idx !== -1) {
      profiles[idx] = { ...profiles[idx], name, tags };
    }
  } else {
    profiles.push({ id: generateId(), name, tags, diners: [], createdAt: new Date().toISOString() });
  }
  Storage.saveProfiles(profiles);
  document.getElementById('profile-sheet').close();
  renderDiners();
}

function deleteProfile(id) {
  profiles = profiles.filter(p => p.id !== id);
  Storage.saveProfiles(profiles);
  document.getElementById('profile-sheet').close();
  renderDiners();
}

/* ---- Diner sheet ---- */

let currentDinerProfileId = null;
let currentEditDinerId    = null;
let currentDinerSpice     = 0;

function openAddDinerSheet(profileId) {
  currentDinerProfileId = profileId;
  currentEditDinerId    = null;
  currentDinerSpice     = 0;
  document.getElementById('diner-sheet-title').textContent = 'Add diner';
  document.getElementById('diner-name').value      = '';
  document.getElementById('diner-link-input').value = '';
  document.getElementById('diner-loves').value     = '';
  document.getElementById('diner-dislikes').value  = '';
  document.getElementById('diner-notes').value     = '';
  document.getElementById('diner-delete-btn').style.display = 'none';
  setDinerRestrictions([]);
  setDinerSpice(0);
  setDinerMultiSelect('diner-cuisines-group', []);
  setDinerMultiSelect('diner-proteins-group', []);
  setDinerMultiSelect('diner-mealformats-group', []);
  setDinerMultiSelect('diner-polarizing-group', []);
  document.getElementById('diner-sheet').showModal();
}

function openEditDinerSheet(profileId, diner) {
  currentDinerProfileId = profileId;
  currentEditDinerId    = diner.id;
  currentDinerSpice     = diner.spice ?? 0;
  document.getElementById('diner-sheet-title').textContent = 'Edit diner';
  document.getElementById('diner-name').value      = diner.name     || '';
  document.getElementById('diner-link-input').value = '';
  document.getElementById('diner-loves').value     = diner.loves    || '';
  document.getElementById('diner-dislikes').value  = diner.dislikes || '';
  document.getElementById('diner-notes').value     = diner.notes    || '';
  document.getElementById('diner-delete-btn').style.display = '';
  setDinerRestrictions(diner.restrictions || []);
  setDinerSpice(diner.spice ?? 0);
  setDinerMultiSelect('diner-cuisines-group', diner.cuisines || []);
  setDinerMultiSelect('diner-proteins-group', diner.proteins || []);
  setDinerMultiSelect('diner-mealformats-group', diner.mealFormats || []);
  setDinerMultiSelect('diner-polarizing-group', diner.polarizing || []);
  document.getElementById('diner-sheet').showModal();
}

function setDinerRestrictions(selected) {
  document.querySelectorAll('#diner-restrictions-group .pill-toggle').forEach(btn => {
    btn.classList.toggle('selected', selected.includes(btn.dataset.value));
  });
}

function setDinerMultiSelect(groupId, values) {
  document.querySelectorAll('#' + groupId + ' .pill-toggle').forEach(btn => {
    btn.classList.toggle('selected', values.includes(btn.dataset.value));
  });
}

function getSelectedDinerValues(groupId) {
  return Array.from(
    document.querySelectorAll('#' + groupId + ' .pill-toggle.selected')
  ).map(b => b.dataset.value);
}

function copySurveyLink() {
  const url = new URL('questionnaire.html', window.location.href).href;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Survey link copied!');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Survey link copied!');
  });
}

function setDinerSpice(level) {
  currentDinerSpice = level;
  document.querySelectorAll('#diner-spice-group .spice-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.level, 10) === level);
  });
}

function getSelectedRestrictions() {
  return Array.from(
    document.querySelectorAll('#diner-restrictions-group .pill-toggle.selected')
  ).map(b => b.dataset.value);
}

function saveDiner() {
  const name = document.getElementById('diner-name').value.trim();
  if (!name) { document.getElementById('diner-name').focus(); return; }
  const dinerData = {
    name,
    restrictions: getSelectedRestrictions(),
    spice:        currentDinerSpice,
    cuisines:     getSelectedDinerValues('diner-cuisines-group'),
    proteins:     getSelectedDinerValues('diner-proteins-group'),
    mealFormats:  getSelectedDinerValues('diner-mealformats-group'),
    polarizing:   getSelectedDinerValues('diner-polarizing-group'),
    loves:        document.getElementById('diner-loves').value.trim(),
    dislikes:     document.getElementById('diner-dislikes').value.trim(),
    notes:        document.getElementById('diner-notes').value.trim()
  };
  const pIdx = profiles.findIndex(p => p.id === currentDinerProfileId);
  if (pIdx === -1) return;
  if (currentEditDinerId) {
    const dIdx = profiles[pIdx].diners.findIndex(d => d.id === currentEditDinerId);
    if (dIdx !== -1) {
      profiles[pIdx].diners[dIdx] = { ...profiles[pIdx].diners[dIdx], ...dinerData };
    }
  } else {
    profiles[pIdx].diners.push({ id: generateId(), ...dinerData });
  }
  Storage.saveProfiles(profiles);
  document.getElementById('diner-sheet').close();
  renderDiners();
}

function deleteDiner() {
  const pIdx = profiles.findIndex(p => p.id === currentDinerProfileId);
  if (pIdx === -1) return;
  profiles[pIdx].diners = profiles[pIdx].diners.filter(d => d.id !== currentEditDinerId);
  Storage.saveProfiles(profiles);
  document.getElementById('diner-sheet').close();
  renderDiners();
}

function handleDinerLinkPaste(val) {
  if (!val) return;
  try {
    const url  = new URL(val);
    const hash = url.hash;
    if (!hash.startsWith('#r=')) return;
    const data = decodeQR(hash.slice(3));
    prefillDinerForm(data);
    showToast('Response loaded!');
  } catch { /* ignore bad input */ }
}

function prefillDinerForm(data) {
  if (data.name)     document.getElementById('diner-name').value     = data.name;
  if (data.loves)    document.getElementById('diner-loves').value    = data.loves;
  if (data.dislikes) document.getElementById('diner-dislikes').value = data.dislikes;
  if (data.notes)    document.getElementById('diner-notes').value    = data.notes;
  setDinerRestrictions(data.restrictions || []);
  setDinerSpice(data.spice ?? 0);
  setDinerMultiSelect('diner-cuisines-group', data.cuisines || []);
  setDinerMultiSelect('diner-proteins-group', data.proteins || []);
  setDinerMultiSelect('diner-mealformats-group', data.mealFormats || []);
  setDinerMultiSelect('diner-polarizing-group', data.polarizing || []);
}

/* ============================================================
   F. PLAN TAB
   ============================================================ */

const MEAL_PLAN_PROMPT =
  'Here is my pantry inventory and diner preferences as JSON. Please suggest ' +
  '3\u20135 meal ideas using what I have on hand, respecting everyone\u2019s ' +
  'dietary needs, and prioritizing items expiring soon. For each meal include ' +
  'a brief ingredient list and any substitutions needed.\n\n';

let currentPlanFilter = 'all';
let currentPlanDays   = 7;

function renderPlan() {
  // Populate profile dropdown
  const sel = document.getElementById('plan-profile-select');
  const prevId = sel.value;
  sel.innerHTML = profiles.length === 0
    ? '<option value="">— No occasions yet —</option>'
    : profiles.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  // Try to restore previous selection
  if (prevId && profiles.some(p => p.id === prevId)) sel.value = prevId;

  // Update plan filter chips
  document.querySelectorAll('#plan-filter-bar .filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.planFilter === currentPlanFilter);
  });
  document.getElementById('days-filter-row').style.display =
    currentPlanFilter === 'days' ? 'flex' : 'none';

  // Preview
  const preview  = document.getElementById('plan-preview');
  const profileId = sel.value;
  const profile   = profiles.find(p => p.id === profileId);

  if (!profile) {
    preview.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Select an occasion above to preview.</p>';
    document.getElementById('btn-copy-prompt').disabled  = true;
    document.getElementById('btn-open-claude').disabled  = true;
    document.getElementById('char-count').textContent    = '';
    return;
  }

  document.getElementById('btn-copy-prompt').disabled = false;

  const dinersHtml = (profile.diners || []).map(d => {
    const rBadges = (d.restrictions || [])
      .map(r => `<span class="restriction-badge">${esc(r)}</span>`).join('');
    return `
      <div class="plan-preview-diner">
        <span class="plan-preview-diner-name">${esc(d.name)}</span>
        <div class="diner-restrictions">${rBadges || '<span style="color:var(--text-muted);font-size:0.8rem">No restrictions</span>'}</div>
        <span class="spice-display" style="margin-left:4px">${SPICE_EMOJI[d.spice ?? 0]}</span>
      </div>`;
  }).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">No diners in this occasion.</p>';

  const totalItems    = items.length;
  const expiringItems = items.filter(i => { const d = daysUntilExpiry(i.expiry); return d !== null && d <= 7; }).length;
  const filteredItems = buildInventoryForPayload(currentPlanFilter, currentPlanDays).length;

  preview.innerHTML = `
    <div class="plan-preview-diners">${dinersHtml}</div>
    <div class="plan-stats">
      <div><strong>${filteredItems}</strong> item${filteredItems !== 1 ? 's' : ''} in filter</div>
      <div><strong>${expiringItems}</strong> expiring soon</div>
      <div><strong>${totalItems}</strong> total</div>
    </div>`;

  updateCharCount(profileId);
}

function buildInventoryForPayload(filter, nDays) {
  let inv = [...items];
  if (filter === 'expiring') {
    inv = inv.filter(i => { const d = daysUntilExpiry(i.expiry); return d !== null && d <= 7; });
    inv.sort((a, b) => (daysUntilExpiry(a.expiry) ?? 9999) - (daysUntilExpiry(b.expiry) ?? 9999));
  } else if (filter === 'days') {
    inv = inv.filter(i => { const d = daysUntilExpiry(i.expiry); return d !== null && d <= nDays; });
    inv.sort((a, b) => (daysUntilExpiry(a.expiry) ?? 9999) - (daysUntilExpiry(b.expiry) ?? 9999));
  }
  return inv;
}

function buildPayload(profileId, filter, nDays) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return null;
  const inv = buildInventoryForPayload(filter, nDays);
  return {
    generated: new Date().toISOString(),
    occasion:  profile.name,
    diners: (profile.diners || []).map(d => ({
      name: d.name, restrictions: d.restrictions,
      spice: d.spice, loves: d.loves, dislikes: d.dislikes, notes: d.notes
    })),
    inventory: inv.map(i => ({
      name: i.name, location: i.location, category: i.category,
      quantity: i.quantity, unit: i.unit,
      expiry: i.expiry || null,
      daysUntilExpiry: daysUntilExpiry(i.expiry)
    }))
  };
}

function buildPromptText(profileId) {
  const payload = buildPayload(profileId, currentPlanFilter, currentPlanDays);
  if (!payload) return null;
  return MEAL_PLAN_PROMPT + JSON.stringify(payload, null, 2);
}

function copyPrompt() {
  const profileId = document.getElementById('plan-profile-select').value;
  const text = buildPromptText(profileId);
  if (!text) { showToast('Select an occasion first'); return; }
  navigator.clipboard.writeText(text)
    .then(() => showToast('Prompt copied to clipboard!'))
    .catch(() => showToast('Could not copy — try again'));
}

function openInClaude() {
  if (typeof LZString === 'undefined') {
    showToast('Compression library not loaded — try refreshing');
    return;
  }
  const profileId = document.getElementById('plan-profile-select').value;
  const text = buildPromptText(profileId);
  if (!text) { showToast('Select an occasion first'); return; }

  const compressed = LZString.compressToEncodedURIComponent(text);
  const url = 'https://claude.ai/new?q=' + compressed;

  const warning = document.getElementById('plan-warning');
  if (url.length >= 6000) {
    warning.textContent = 'Inventory too large for direct link — use Copy prompt instead';
    warning.classList.add('visible');
    document.getElementById('btn-open-claude').disabled = true;
    return;
  }
  warning.classList.remove('visible');
  window.open(url, '_blank');
}

function updateCharCount(profileId) {
  const ccEl = document.getElementById('char-count');
  if (!profileId) { ccEl.textContent = ''; return; }

  let len = 0;
  if (typeof LZString !== 'undefined') {
    const text = buildPromptText(profileId);
    if (text) {
      const compressed = LZString.compressToEncodedURIComponent(text);
      len = ('https://claude.ai/new?q=' + compressed).length;
    }
  } else {
    const text = buildPromptText(profileId);
    len = text ? text.length : 0;
  }

  ccEl.textContent = `Estimated URL length: ${len.toLocaleString()} chars`;
  ccEl.className   = 'char-count' + (len >= 6000 ? ' over' : len >= 4000 ? ' warning' : '');

  const btn     = document.getElementById('btn-open-claude');
  const warning = document.getElementById('plan-warning');
  if (len >= 6000) {
    btn.disabled = true;
    warning.textContent = 'Inventory too large for direct link — use Copy prompt instead';
    warning.classList.add('visible');
  } else {
    btn.disabled = false;
    warning.classList.remove('visible');
  }
}

/* ============================================================
   INIT EVENT LISTENERS
   ============================================================ */

function initEventListeners() {
  /* ---- Tab bar ---- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  /* ---- FAB ---- */
  document.getElementById('fab-add').addEventListener('click', openAddItemSheet);

  /* ---- Settings menu ---- */
  document.getElementById('btn-settings').addEventListener('click', e => {
    e.stopPropagation();
    const menu = document.getElementById('settings-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => {
    document.getElementById('settings-menu').style.display = 'none';
  });

  /* ---- Export / Import ---- */
  document.getElementById('btn-export').addEventListener('click', () => {
    document.getElementById('settings-menu').style.display = 'none';
    exportJSON();
  });
  document.getElementById('btn-import-trigger').addEventListener('click', () => {
    document.getElementById('settings-menu').style.display = 'none';
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', e => {
    if (e.target.files[0]) {
      importJSON(e.target.files[0]);
      e.target.value = '';
    }
  });

  /* ---- Inventory filter chips ---- */
  document.getElementById('inventory-filter-bar').addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (chip) renderInventory(chip.dataset.filter);
  });

  /* ---- Item sheet ---- */
  document.getElementById('item-save-btn').addEventListener('click', saveItem);
  document.getElementById('item-delete-btn').addEventListener('click', () => deleteItem(currentEditItemId));
  document.getElementById('item-cancel-btn').addEventListener('click', () => document.getElementById('item-sheet').close());

  // Backdrop click closes
  document.getElementById('item-sheet').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });

  /* ---- Scan button ---- */
  document.getElementById('btn-scan').addEventListener('click', openScanOverlay);
  document.getElementById('scan-close').addEventListener('click', stopScan);
  document.getElementById('scan-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) stopScan();
  });

  /* ---- Share survey button ---- */
  document.getElementById('btn-share-survey').addEventListener('click', copySurveyLink);

  /* ---- Profile sheet ---- */
  document.getElementById('btn-add-profile').addEventListener('click', openAddProfileSheet);
  document.getElementById('profile-save-btn').addEventListener('click', saveProfile);
  document.getElementById('profile-delete-btn').addEventListener('click', () => deleteProfile(currentEditProfileId));
  document.getElementById('profile-cancel-btn').addEventListener('click', () => document.getElementById('profile-sheet').close());
  document.getElementById('profile-sheet').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });

  /* ---- Diner sheet ---- */
  document.getElementById('diner-save-btn').addEventListener('click', saveDiner);
  document.getElementById('diner-delete-btn').addEventListener('click', deleteDiner);
  document.getElementById('diner-cancel-btn').addEventListener('click', () => document.getElementById('diner-sheet').close());
  document.getElementById('diner-sheet').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });

  // Restriction pills
  document.getElementById('diner-restrictions-group').addEventListener('click', e => {
    const btn = e.target.closest('.pill-toggle');
    if (!btn) return;
    if (btn.dataset.value === 'none') {
      document.querySelectorAll('#diner-restrictions-group .pill-toggle').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    } else {
      document.querySelector('#diner-restrictions-group .pill-toggle[data-value="none"]').classList.remove('selected');
      btn.classList.toggle('selected');
    }
  });

  // Spice buttons
  document.getElementById('diner-spice-group').addEventListener('click', e => {
    const btn = e.target.closest('.spice-btn');
    if (btn) setDinerSpice(parseInt(btn.dataset.level, 10));
  });

  // Generic multi-select pill groups
  ['diner-cuisines-group', 'diner-proteins-group', 'diner-mealformats-group', 'diner-polarizing-group'].forEach(groupId => {
    document.getElementById(groupId).addEventListener('click', e => {
      const btn = e.target.closest('.pill-toggle');
      if (btn) btn.classList.toggle('selected');
    });
  });

  // Paste questionnaire link
  document.getElementById('diner-link-input').addEventListener('blur', e => {
    handleDinerLinkPaste(e.target.value);
  });
  document.getElementById('diner-link-input').addEventListener('paste', e => {
    // Small delay so value is populated after paste
    setTimeout(() => handleDinerLinkPaste(e.target.value), 50);
  });

  /* ---- Plan tab ---- */
  document.getElementById('plan-profile-select').addEventListener('change', () => renderPlan());

  document.getElementById('plan-filter-bar').addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    currentPlanFilter = chip.dataset.planFilter;
    renderPlan();
  });

  document.getElementById('plan-days-input').addEventListener('input', e => {
    currentPlanDays = parseInt(e.target.value, 10) || 7;
    renderPlan();
  });

  document.getElementById('btn-copy-prompt').addEventListener('click', copyPrompt);
  document.getElementById('btn-open-claude').addEventListener('click', openInClaude);
}

/* ============================================================
   I. BOOT
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  registerServiceWorker();
  initInstallBanner();
  initBarcodeScanner();
  initEventListeners();
  showTab('inventory');
});
