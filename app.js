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
  renderAll();
}

// ─────────────────────────────────────────────
//  Render All
// ─────────────────────────────────────────────
function renderAll() {
  renderList();
  renderTotals();
  renderBags();
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
//  Bag Grouping — splits quantity items across bags
// ─────────────────────────────────────────────
function onBagToggle() {
  const on = document.getElementById('bagToggle').checked;
  document.getElementById('bagMaxRow').style.display = on ? '' : 'none';
  renderBags();
}

function renderBags() {
  const container = document.getElementById('bagsOutput');
  if (!document.getElementById('bagToggle').checked || laundryItems.length === 0) {
    container.innerHTML = '';
    return;
  }
  const maxW = parseFloat(document.getElementById('bagMaxWeight').value) || 15;
  const bags = groupIntoBags(laundryItems, maxW);

  if (bags.length === 0) { container.innerHTML = ''; return; }

  let html = '<div class="bags-grid">';
  bags.forEach((bag, idx) => {
    const bagW = bag.reduce((s, i) => s + i.sliceWeight, 0);
    html += `
      <div class="bag-card">
        <div class="bag-header">
          <h3>Bag ${idx + 1}</h3>
          <span class="bag-weight">${bagW.toFixed(3)} kg</span>
        </div>
        <div class="bag-items">
          ${bag.map(slice => {
            const qtyStr = slice.sliceQty > 1 ? ` ×${slice.sliceQty}` : '';
            return `<div>• ${escHtml(slice.displayName)}${qtyStr} <span style="color:#888">(${slice.sliceWeight.toFixed(3)} kg)</span></div>`;
          }).join('')}
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Groups items into bags strictly under maxW.
 * Quantity items (mode==='quantity') are split unit-by-unit so no bag exceeds maxW.
 * Returns array of bags; each bag is array of slices: { displayName, sliceQty, sliceWeight }
 */
function groupIntoBags(items, maxW) {
  // Expand every item into individual units
  const units = [];
  items.forEach(it => {
    const unitW = it.weightPerItem;
    if (unitW > maxW) {
      // Single unit exceeds max — goes in its own bag, can't be split further
      units.push({ displayName: it.displayName, unitWeight: unitW, _over: true });
    } else {
      const count = it.mode === 'quantity' ? it.quantity : 1;
      for (let i = 0; i < count; i++) {
        units.push({ displayName: it.displayName, unitWeight: unitW });
      }
    }
  });

  // Sort heaviest first (first-fit decreasing)
  units.sort((a, b) => b.unitWeight - a.unitWeight);

  // Pack into bags
  const bagWeights = []; // running weight per bag
  const bagSlices  = []; // array of maps: displayName -> { displayName, sliceQty, sliceWeight }

  units.forEach(unit => {
    let placed = false;
    for (let b = 0; b < bagWeights.length; b++) {
      if (bagWeights[b] + unit.unitWeight <= maxW + 0.0001) {
        bagWeights[b] += unit.unitWeight;
        const map = bagSlices[b];
        if (map[unit.displayName]) {
          map[unit.displayName].sliceQty   += 1;
          map[unit.displayName].sliceWeight = parseFloat((map[unit.displayName].sliceWeight + unit.unitWeight).toFixed(6));
        } else {
          map[unit.displayName] = { displayName: unit.displayName, sliceQty: 1, sliceWeight: unit.unitWeight };
        }
        placed = true;
        break;
      }
    }
    if (!placed) {
      bagWeights.push(unit.unitWeight);
      const map = {};
      map[unit.displayName] = { displayName: unit.displayName, sliceQty: 1, sliceWeight: unit.unitWeight };
      bagSlices.push(map);
    }
  });

  // Convert maps to arrays
  return bagSlices.map(map => Object.values(map));
}

// ─────────────────────────────────────────────
//  Summary Output
// ─────────────────────────────────────────────
function buildSummaryText() {
  if (laundryItems.length === 0) return '— No items —';
  const totalW = laundryItems.reduce((s, i) => s + i.totalWeight, 0);
  let lines = [];

  const bagOn = document.getElementById('bagToggle').checked;
  if (bagOn) {
    const maxW = parseFloat(document.getElementById('bagMaxWeight').value) || 15;
    const bags = groupIntoBags(laundryItems, maxW);
    bags.forEach((bag, idx) => {
      const bagW = bag.reduce((s, sl) => s + sl.sliceWeight, 0);
      lines.push(`--- BAG ${idx + 1} (${bagW.toFixed(3)}kg) ---`);
      bag.forEach(sl => {
        lines.push(`ITEM NAME: ${sl.displayName}${sl.sliceQty > 1 ? ` ×${sl.sliceQty}` : ''}`);
        lines.push(`WEIGHT: ${sl.sliceWeight.toFixed(3)}kg`);
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
