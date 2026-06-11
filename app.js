/**
 * Noelle West Laundry Calculator — app.js
 * Weight-only categories: BGI, BGS, PGI, PGS, PGC, FIL, MG, CD, MS, CS, PET, S-UPPER
 * Quantity categories:    BCPO, BOY, BPSC, BPO, BPOL, BPS, COAT BARONG, BCC, BPOC, VST, POLO, ACC, PEN, PANTS
 */

// ─────────────────────────────────────────────
//  Category mode config
// ─────────────────────────────────────────────
const WEIGHT_ONLY_CATS = new Set([
  'BGI','BGS','PGI','PGS','PGC','FIL','MG','CD','MS','CS','PET','S-UPPER'
]);
const QUANTITY_CATS = new Set([
  'BCPO','BOY','BPSC','BPO','BPOL','BPS','COAT BARONG','BCC','BPOC','VST','POLO','ACC','PEN','PANTS'
]);

function getCatMode(cat) {
  if (WEIGHT_ONLY_CATS.has(cat)) return 'weight-only';
  if (QUANTITY_CATS.has(cat))    return 'quantity';
  return 'weight-only'; // fallback
}

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
let INVENTORY = {};
let laundryItems = [];   // { key, displayName, weightPerItem, quantity, totalWeight, isManual, category }
let usedKeys   = new Set();
let tomItem    = null;

window.latestSubmissionText = '';

// ─────────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadInventory();
  buildCategoryDropdown();
  bindEvents();
  initBagSection();
  setupJotform();
  renderAll();
});

// ─────────────────────────────────────────────
//  Load Inventory
// ─────────────────────────────────────────────
async function loadInventory() {
  try {
    const res = await fetch('master-items.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    INVENTORY = await res.json();
  } catch (e) {
    showAlert('⚠️ Could not load inventory data. Make sure master-items.json is present.', 'error');
    console.error('Inventory load failed:', e);
  }
}

// ─────────────────────────────────────────────
//  Category Dropdown
// ─────────────────────────────────────────────
function buildCategoryDropdown() {
  const sel = document.getElementById('catSelect');
  Object.keys(INVENTORY).sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });
}

// ─────────────────────────────────────────────
//  Bind Events
// ─────────────────────────────────────────────
function bindEvents() {
  document.getElementById('catSelect').addEventListener('change', onCategoryChange);
  document.getElementById('componentSelect').addEventListener('change', onComponentChange);
  document.getElementById('weightInput').addEventListener('input', onWeightInput);
  document.getElementById('qtySelect').addEventListener('change', onQtyChange);
  document.getElementById('btnAdd').addEventListener('click', onAddItem);
  document.getElementById('bagToggle').addEventListener('change', onBagToggle);
  document.getElementById('bagMaxWeight').addEventListener('input', renderBags);
}

// ─────────────────────────────────────────────
//  Category Change
// ─────────────────────────────────────────────
function onCategoryChange() {
  const cat = document.getElementById('catSelect').value;
  clearAlert();
  resetItemDropdown();
  hideComponent();
  resetWeightArea();
  hideQuantityRow();
  updateAddButton();

  if (!cat || !INVENTORY[cat]) return;

  const catData  = INVENTORY[cat];
  const available = catData.items.filter(it => !usedKeys.has(makeKey(cat, it.name)));
  buildItemDropdown(cat, available);

  // Show quantity row immediately if this is a quantity category
  if (getCatMode(cat) === 'quantity') showQuantityRow();
}

// ─────────────────────────────────────────────
//  Item Dropdown (Tom Select)
// ─────────────────────────────────────────────
function resetItemDropdown() {
  if (tomItem) { tomItem.destroy(); tomItem = null; }
  const sel = document.getElementById('itemSelect');
  sel.innerHTML = '<option value="">— Select category first —</option>';
}

function buildItemDropdown(cat, items) {
  if (tomItem) { tomItem.destroy(); tomItem = null; }
  const sel = document.getElementById('itemSelect');
  sel.innerHTML = '<option value=""></option>';
  items.forEach(it => {
    const opt = document.createElement('option');
    opt.value = it.name;
    opt.textContent = it.name;
    sel.appendChild(opt);
  });
  tomItem = new TomSelect('#itemSelect', {
    placeholder: 'Search item…',
    maxOptions: 200,
    sortField: { field: 'text', direction: 'asc' },
    onChange(val) { onItemChange(cat, val); }
  });
}

// ─────────────────────────────────────────────
//  Item Change
// ─────────────────────────────────────────────
function onItemChange(cat, itemName) {
  hideComponent();
  resetWeightArea();
  updateAddButton();
  if (!itemName || !INVENTORY[cat]) return;

  const catData = INVENTORY[cat];
  const item    = catData.items.find(i => i.name === itemName);
  if (!item) return;

  const mode = getCatMode(cat);

  if (catData.type === 'components') {
    showComponentDropdown(catData.components, item);
  } else if (catData.type === 'auto') {
    if (item.weight !== null && item.weight !== undefined) {
      setWeightDisplay(item.weight, mode);
    } else {
      showManualWeightInput(mode);
    }
  } else {
    // manual
    showManualWeightInput(mode);
  }

  updateTotalWeightDisplay();
  updateAddButton();
}

// ─────────────────────────────────────────────
//  Component Dropdown
// ─────────────────────────────────────────────
function showComponentDropdown(componentNames, item) {
  const grp = document.getElementById('componentGroup');
  const sel  = document.getElementById('componentSelect');
  sel.innerHTML = '<option value="">— Select component —</option>';
  componentNames.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    const w = item.components[c];
    opt.textContent = c + (w !== null && w !== undefined ? ` (${w} kg)` : '');
    sel.appendChild(opt);
  });
  grp.style.display = '';
  updateAddButton();
}

function hideComponent() {
  document.getElementById('componentGroup').style.display = 'none';
  document.getElementById('componentSelect').value = '';
}

function onComponentChange() {
  const cat      = document.getElementById('catSelect').value;
  const itemName = tomItem ? tomItem.getValue() : '';
  const comp     = document.getElementById('componentSelect').value;
  resetWeightArea();
  if (!comp || !itemName || !INVENTORY[cat]) { updateAddButton(); return; }

  const item = INVENTORY[cat].items.find(i => i.name === itemName);
  if (!item) return;
  const mode = getCatMode(cat);
  const w = item.components[comp];
  if (w !== null && w !== undefined) {
    setWeightDisplay(w, mode);
  } else {
    showManualWeightInput(mode);
  }
  updateTotalWeightDisplay();
  updateAddButton();
}

// ─────────────────────────────────────────────
//  Weight Area — shared helpers
// ─────────────────────────────────────────────

/**
 * Show the read-only weight display chip.
 * mode: 'weight-only' | 'quantity'
 */
function setWeightDisplay(val, mode) {
  const disp  = document.getElementById('weightDisplay');
  const inp   = document.getElementById('weightInput');
  const label = document.getElementById('weightLabel');

  label.textContent = mode === 'quantity' ? 'Weight Per Item' : 'Weight';

  disp.classList.remove('empty');
  disp.style.display = '';
  disp.innerHTML = `<span class="weight-val">${parseFloat(val).toFixed(3)}</span><span class="weight-unit">kg</span>`;
  inp.style.display = 'none';
  inp.value = '';
  disp.dataset.weight = val;
}

function showManualWeightInput(mode) {
  const disp  = document.getElementById('weightDisplay');
  const inp   = document.getElementById('weightInput');
  const label = document.getElementById('weightLabel');

  label.textContent = mode === 'quantity' ? 'Weight Per Item' : 'Weight';

  disp.style.display = 'none';
  delete disp.dataset.weight;
  inp.style.display = '';
  inp.value = '';
  inp.placeholder = mode === 'quantity' ? 'Weight per item (kg)' : 'Enter kg (e.g. 0.30)';
  inp.focus();
}

function resetWeightArea() {
  const disp  = document.getElementById('weightDisplay');
  const inp   = document.getElementById('weightInput');
  const label = document.getElementById('weightLabel');

  label.textContent = 'Weight';
  disp.classList.add('empty');
  disp.style.display = '';
  disp.innerHTML = '<span class="weight-val">—</span><span class="weight-unit">kg</span>';
  delete disp.dataset.weight;
  inp.style.display = 'none';
  inp.value = '';

  const tw = document.getElementById('totalWeightDisplay');
  if (tw) tw.textContent = '—';
}

// ─────────────────────────────────────────────
//  Quantity Row
// ─────────────────────────────────────────────
function showQuantityRow() {
  document.getElementById('quantityRow').style.display = '';
  document.getElementById('totalWeightRow').style.display = '';
  document.getElementById('qtySelect').value = '1';
}

function hideQuantityRow() {
  document.getElementById('quantityRow').style.display = 'none';
  document.getElementById('totalWeightRow').style.display = 'none';
  document.getElementById('qtySelect').value = '1';
  const tw = document.getElementById('totalWeightDisplay');
  if (tw) tw.textContent = '—';
}

function onQtyChange() {
  updateTotalWeightDisplay();
  updateAddButton();
}

function onWeightInput() {
  updateTotalWeightDisplay();
  updateAddButton();
}

/** Reads current weight-per-item value from display or input */
function getCurrentWeightPerItem() {
  const disp = document.getElementById('weightDisplay');
  const inp  = document.getElementById('weightInput');
  // Input is visible when display is NOT 'none'
  if (inp.style.display !== 'none') {
    const v = parseFloat(inp.value);
    return (!isNaN(v) && v > 0) ? v : null;
  }
  // Otherwise read from the auto-populated display chip
  if (disp.dataset.weight) {
    return parseFloat(disp.dataset.weight);
  }
  return null;
}

function updateTotalWeightDisplay() {
  const cat = document.getElementById('catSelect').value;
  if (!cat || getCatMode(cat) !== 'quantity') return;

  const tw  = document.getElementById('totalWeightDisplay');
  if (!tw) return;
  const wpi = getCurrentWeightPerItem();
  const qty = parseInt(document.getElementById('qtySelect').value) || 1;
  if (wpi && !isNaN(wpi) && wpi > 0) {
    tw.textContent = (wpi * qty).toFixed(3) + ' kg';
  } else {
    tw.textContent = '—';
  }
}

// ─────────────────────────────────────────────
//  Add Button State
// ─────────────────────────────────────────────
function updateAddButton() {
  document.getElementById('btnAdd').disabled = !canAdd();
}

function canAdd() {
  const cat = document.getElementById('catSelect').value;
  if (!cat || !INVENTORY[cat]) return false;

  const itemName = tomItem ? tomItem.getValue() : '';
  if (!itemName) return false;

  const catData = INVENTORY[cat];

  // Components: need component selected
  if (catData.type === 'components') {
    if (!document.getElementById('componentSelect').value) return false;
  }

  // Need a valid weight
  const wpi = getCurrentWeightPerItem();
  if (wpi === null || isNaN(wpi) || wpi <= 0) return false;
  return true;
}

// ─────────────────────────────────────────────
//  Add Item
// ─────────────────────────────────────────────
function onAddItem() {
  clearAlert();

  const cat = document.getElementById('catSelect').value;
  if (!cat || !INVENTORY[cat]) return;

  const itemName = tomItem ? tomItem.getValue() : '';
  if (!itemName) return;

  const catData = INVENTORY[cat];
  const mode    = getCatMode(cat);
  let displayName = itemName;
  let isManual    = false;

  // Handle component name suffix
  if (catData.type === 'components') {
    const comp = document.getElementById('componentSelect').value;
    if (!comp) return;
    displayName = `${itemName} - ${comp}`;
  }

  const weightPerItem = getCurrentWeightPerItem();
  if (!weightPerItem || isNaN(weightPerItem) || weightPerItem <= 0) {
    showAlert('Please enter a valid weight.', 'warn');
    return;
  }

  // Determine if weight was manually entered
  const inp = document.getElementById('weightInput');
  isManual = inp.style.display !== 'none';

  const qty         = mode === 'quantity' ? (parseInt(document.getElementById('qtySelect').value) || 1) : 1;
  const totalWeight = parseFloat((weightPerItem * qty).toFixed(6));

  const key = makeKey(cat, displayName);
  if (usedKeys.has(key)) {
    showAlert(`"${displayName}" is already in the list.`, 'warn');
    return;
  }

  laundryItems.push({ key, displayName, weightPerItem, quantity: qty, totalWeight, isManual, category: cat, mode });
  usedKeys.add(key);

  // Reset form
  document.getElementById('catSelect').value = '';
  resetItemDropdown();
  hideComponent();
  resetWeightArea();
  hideQuantityRow();
  updateAddButton();

  renderAll();
}

// ─────────────────────────────────────────────
//  Remove Item
// ─────────────────────────────────────────────
function removeItem(key) {
  laundryItems = laundryItems.filter(i => i.key !== key);
  usedKeys.delete(key);
  // Also remove from any bags that contain this item
  bags.forEach(bag => bag.items.delete(key));
  renderAll();
}

// ─────────────────────────────────────────────
//  Render All
// ─────────────────────────────────────────────
function renderAll() {
  renderList();
  renderTotals();
  refreshBagUI();
  renderSummary();
  broadcastToJotform();
}

// ─────────────────────────────────────────────
//  Render Laundry List
// ─────────────────────────────────────────────
function renderList() {
  const ul    = document.getElementById('laundryList');
  const empty = document.getElementById('listEmpty');
  ul.innerHTML = '';

  if (laundryItems.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';

  laundryItems.forEach(it => {
    const li = document.createElement('li');
    li.className = 'laundry-item';

    let weightInfo;
    if (it.mode === 'quantity' && it.quantity > 1) {
      weightInfo = `
        <span class="item-qty-badge">×${it.quantity}</span>
        <span class="item-weight-per">${it.weightPerItem.toFixed(3)} kg/ea</span>
        <span class="item-dots">··</span>
        <span class="item-weight${it.isManual ? ' manual' : ''}">${it.totalWeight.toFixed(3)} kg</span>
      `;
    } else {
      weightInfo = `
        <span class="item-dots">··············</span>
        <span class="item-weight${it.isManual ? ' manual' : ''}">${it.totalWeight.toFixed(3)} kg</span>
      `;
    }

    li.innerHTML = `
      <span class="item-name">${escHtml(it.displayName)}</span>
      ${weightInfo}
      <button class="btn btn-danger" onclick="removeItem(${JSON.stringify(it.key)})">✕</button>
    `;
    ul.appendChild(li);
  });
}

// ─────────────────────────────────────────────
//  Render Totals
// ─────────────────────────────────────────────
function renderTotals() {
  const totalW = laundryItems.reduce((s, i) => s + i.totalWeight, 0);
  document.getElementById('totalItems').textContent  = laundryItems.length;
  document.getElementById('totalWeight').textContent = totalW.toFixed(3) + ' kg';
}

// ─────────────────────────────────────────────
//  Manual Bag Builder
// ─────────────────────────────────────────────

// bags[i] = { entries: [ { key, qty } ] }
let bags = [];

function initBagSection() { /* no-op — all wired via inline onclick in HTML */ }

// Called from HTML: onSetBags()
window.onSetBags = function() {
  const n = parseInt(document.getElementById('numBagsInput').value) || 1;
  const clamped = Math.max(1, Math.min(20, n));

  // Keep existing bag data if shrinking; add empties if growing
  while (bags.length < clamped) bags.push({ entries: [] });
  while (bags.length > clamped) bags.pop();

  // Clean stale entries
  bags.forEach(bag => {
    bag.entries = bag.entries.filter(e => laundryItems.some(i => i.key === e.key));
  });

  renderAllBags();
  renderSummary();
  broadcastToJotform();
};

function refreshBagUI() {
  const hasList = laundryItems.length > 0;
  document.getElementById('bagEmpty').style.display  = hasList ? 'none' : '';
  document.getElementById('bagSetup').style.display  = hasList ? '' : 'none';

  // Clean stale entries when items are removed from laundry list
  bags.forEach(bag => {
    bag.entries = bag.entries.filter(e => laundryItems.some(i => i.key === e.key));
  });

  renderAllBags();
}

function renderAllBags() {
  const container = document.getElementById('bagsOutput');
  container.innerHTML = '';
  if (bags.length === 0) return;

  const grid = document.createElement('div');
  grid.className = 'bags-grid';
  bags.forEach((bag, idx) => renderOneBag(grid, bag, idx));
  container.appendChild(grid);
}

function renderOneBag(grid, bag, idx) {
  const bagW = getBagWeight(idx);
  const card = document.createElement('div');
  card.className = 'bag-card';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'bag-header';
  const h3 = document.createElement('h3');
  h3.textContent = `Bag ${idx + 1}`;
  const wSpan = document.createElement('span');
  wSpan.className = 'bag-weight';
  wSpan.textContent = `${bagW.toFixed(3)} kg`;
  header.appendChild(h3);
  header.appendChild(wSpan);
  card.appendChild(header);

  // ── Item picker ──
  const picker = document.createElement('div');
  picker.className = 'bag-item-picker';

  const pickerLabel = document.createElement('label');
  pickerLabel.className = 'picker-label';
  pickerLabel.textContent = 'Add Item to Bag';
  picker.appendChild(pickerLabel);

  // Item select — show all items not yet fully used in this bag
  const usedKeysInBag = new Set(bag.entries.map(e => e.key));
  const sel = document.createElement('select');
  sel.size = Math.min(6, laundryItems.length + 1); // scrollable listbox

  const blankOpt = document.createElement('option');
  blankOpt.value = '';
  blankOpt.textContent = '— Select item —';
  sel.appendChild(blankOpt);

  laundryItems.forEach(it => {
    if (!usedKeysInBag.has(it.key)) {
      const opt = document.createElement('option');
      opt.value = it.key;
      const qStr = it.mode === 'quantity' && it.quantity > 1
        ? ` (up to ×${it.quantity})`
        : ` — ${it.totalWeight.toFixed(3)} kg`;
      opt.textContent = it.displayName + qStr;
      sel.appendChild(opt);
    }
  });
  picker.appendChild(sel);

  // Qty row — only for quantity-mode items
  const qtyRow = document.createElement('div');
  qtyRow.className = 'bag-qty-row';
  qtyRow.style.display = 'none';
  const qtyLabel = document.createElement('label');
  qtyLabel.className = 'picker-label';
  qtyLabel.style.marginTop = '8px';
  qtyLabel.textContent = 'Quantity for this bag';
  const qtySel = document.createElement('select');
  qtyRow.appendChild(qtyLabel);
  qtyRow.appendChild(qtySel);
  picker.appendChild(qtyRow);

  // Add to bag button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.style.cssText = 'margin-top:10px;width:100%;';
  addBtn.textContent = 'Add to Bag';
  addBtn.disabled = true;
  picker.appendChild(addBtn);
  card.appendChild(picker);

  // Wire item select
  sel.addEventListener('change', () => {
    const key = sel.value;
    if (!key) { addBtn.disabled = true; qtyRow.style.display = 'none'; return; }
    addBtn.disabled = false;
    const it = laundryItems.find(i => i.key === key);
    if (it && it.mode === 'quantity' && it.quantity > 1) {
      qtySel.innerHTML = '';
      for (let q = 1; q <= it.quantity; q++) {
        const o = document.createElement('option');
        o.value = q; o.textContent = q;
        qtySel.appendChild(o);
      }
      qtyRow.style.display = '';
    } else {
      qtyRow.style.display = 'none';
    }
  });

  // Wire Add to Bag button
  addBtn.addEventListener('click', () => {
    const key = sel.value;
    if (!key) return;
    const it = laundryItems.find(i => i.key === key);
    if (!it) return;
    const qty = (it.mode === 'quantity' && it.quantity > 1)
      ? (parseInt(qtySel.value) || 1)
      : 1;
    bag.entries.push({ key, qty });
    renderAllBags();
    renderSummary();
    broadcastToJotform();
  });

  // ── Entries list ──
  const itemsList = document.createElement('div');
  itemsList.className = 'bag-items';

  if (bag.entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bag-no-items';
    empty.textContent = 'No items added yet.';
    itemsList.appendChild(empty);
  } else {
    bag.entries.forEach((entry, eIdx) => {
      const it = laundryItems.find(i => i.key === entry.key);
      if (!it) return;
      const entryW = it.mode === 'quantity'
        ? it.weightPerItem * entry.qty
        : it.totalWeight;
      const qStr = it.mode === 'quantity' && entry.qty > 1 ? ` ×${entry.qty}` : '';

      const row = document.createElement('div');
      row.className = 'bag-item-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'bag-item-name';
      nameSpan.textContent = `• ${it.displayName}${qStr}`;

      const wtSpan = document.createElement('span');
      wtSpan.className = 'bag-item-wt';
      wtSpan.textContent = `${entryW.toFixed(3)} kg`;

      const rmBtn = document.createElement('button');
      rmBtn.className = 'bag-item-remove';
      rmBtn.textContent = '✕';
      rmBtn.addEventListener('click', () => {
        bag.entries.splice(eIdx, 1);
        renderAllBags();
        renderSummary();
        broadcastToJotform();
      });

      row.appendChild(nameSpan);
      row.appendChild(wtSpan);
      row.appendChild(rmBtn);
      itemsList.appendChild(row);
    });
  }
  card.appendChild(itemsList);

  // ── Bag total ──
  if (bagW > 0) {
    const totalRow = document.createElement('div');
    totalRow.className = 'bag-total-row';
    totalRow.innerHTML = `Total: <strong>${bagW.toFixed(3)} kg</strong>`;
    card.appendChild(totalRow);
  }

  grid.appendChild(card);
}

function getBagWeight(idx) {
  let w = 0;
  bags[idx].entries.forEach(entry => {
    const it = laundryItems.find(i => i.key === entry.key);
    if (!it) return;
    w += it.mode === 'quantity' ? it.weightPerItem * entry.qty : it.totalWeight;
  });
  return w;
}

// ─────────────────────────────────────────────
//  Summary Output
// ─────────────────────────────────────────────
function buildSummaryText() {
  if (laundryItems.length === 0) return '— No items —';
  const totalW = laundryItems.reduce((s, i) => s + i.totalWeight, 0);
  let lines = [];

  if (bags.length > 0 && bags.some(b => b.entries.length > 0)) {
    bags.forEach((bag, idx) => {
      if (bag.entries.length === 0) return;
      const bagW = getBagWeight(idx);
      lines.push(`--- BAG ${idx + 1} (${bagW.toFixed(3)}kg) ---`);
      bag.entries.forEach(entry => {
        const it = laundryItems.find(i => i.key === entry.key);
        if (!it) return;
        const entryW = it.mode === 'quantity' ? it.weightPerItem * entry.qty : it.totalWeight;
        const qStr = it.mode === 'quantity' && entry.qty > 1 ? ` ×${entry.qty}` : '';
        lines.push(`ITEM NAME: ${it.displayName}${qStr}`);
        if (it.mode === 'quantity' && entry.qty > 1) {
          lines.push(`QUANTITY: ${entry.qty}`);
          lines.push(`WEIGHT PER ITEM: ${it.weightPerItem.toFixed(3)}kg`);
        }
        lines.push(`WEIGHT: ${entryW.toFixed(3)}kg`);
        lines.push('');
      });
    });
  } else {
    laundryItems.forEach(it => {
      lines.push(`ITEM NAME: ${it.displayName}`);
      if (it.mode === 'quantity' && it.quantity > 1) {
        lines.push(`QUANTITY: ${it.quantity}`);
        lines.push(`WEIGHT PER ITEM: ${it.weightPerItem.toFixed(3)}kg`);
      }
      lines.push(`WEIGHT: ${it.totalWeight.toFixed(3)}kg`);
      lines.push('');
    });
  }

  lines.push(`TOTAL ITEMS: ${laundryItems.length}`);
  lines.push(`TOTAL WEIGHT: ${totalW.toFixed(3)}kg`);
  return lines.join('\n');
}

function renderSummary() {
  const text = buildSummaryText();
  window.latestSubmissionText = text;
  const totalW = laundryItems.reduce((s, i) => s + i.totalWeight, 0);
  const gtEl = document.getElementById('grandTotalWeight');
  if (gtEl) gtEl.textContent = totalW.toFixed(3) + ' kg';
}

// ─────────────────────────────────────────────
//  JotForm
// ─────────────────────────────────────────────
function setupJotform() {
  if (typeof JFCustomWidget !== 'undefined') {
    JFCustomWidget.subscribe('submit', function () {
      JFCustomWidget.sendSubmit({ valid: true, value: window.latestSubmissionText });
    });
    JFCustomWidget.subscribe('ready', function () {
      broadcastToJotform();
    });
  }
}

function broadcastToJotform() {
  const value = window.latestSubmissionText;

  // Method 1: JFCustomWidget API
  if (typeof JFCustomWidget !== 'undefined') {
    try { JFCustomWidget.sendData({ value }); } catch (e) {}
  }

  // Method 2: Directly write into #input_82 in the parent JotForm page
  try {
    if (window.parent && window.parent !== window) {
      const parentDoc = window.parent.document;
      const target = parentDoc.getElementById('input_82');
      if (target) {
        target.value = value;
        // Fire change + input events so JotForm registers the update
        target.dispatchEvent(new Event('input',  { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  } catch (e) {}

  // Method 3: postMessage fallback
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(JSON.stringify({
        type:    'widgetValue',
        fieldId: 'input_82',
        value,
        valid:   true
      }), '*');
    }
  } catch (e) {}
}

// ─────────────────────────────────────────────
//  Future: Transaction Loader
// ─────────────────────────────────────────────
window.loadTransaction = function(txnNumber) {
  console.log('[loadTransaction] Not yet implemented. TXN:', txnNumber);
  showAlert(`Transaction loading not yet implemented. (${txnNumber})`, 'warn');
};

window.addItemProgrammatically = function(category, itemName, component, weightPerItem, quantity = 1) {
  const displayName = component ? `${itemName} - ${component}` : itemName;
  const key = makeKey(category, displayName);
  if (usedKeys.has(key)) return false;
  const mode = getCatMode(category);
  const totalWeight = parseFloat((weightPerItem * quantity).toFixed(6));
  laundryItems.push({ key, displayName, weightPerItem, quantity, totalWeight, isManual: false, category, mode });
  usedKeys.add(key);
  renderAll();
  return true;
};

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────
function makeKey(cat, name) { return `${cat}::${name}`; }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showAlert(msg, type = 'warn') {
  document.getElementById('alertBox').innerHTML =
    `<div class="alert alert-${type}">${escHtml(msg)}</div>`;
}

function clearAlert() { document.getElementById('alertBox').innerHTML = ''; }
