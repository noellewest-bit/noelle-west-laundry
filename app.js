/**
 * Noelle West Laundry Calculator
 */

// ── Category mode ──
const WEIGHT_ONLY_CATS = new Set(['BGI','BGS','PGI','PGS','PGC','FIL','MG','CD','MS','CS','PET','S-UPPER']);
const QUANTITY_CATS    = new Set(['BCPO','BOY','BPSC','BPO','BPOL','BPS','COAT BARONG','BCC','BPOC','VST','POLO','ACC','PEN','PANTS']);

function getCatMode(cat) {
  if (WEIGHT_ONLY_CATS.has(cat)) return 'weight-only';
  if (QUANTITY_CATS.has(cat))    return 'quantity';
  return 'weight-only';
}

// ── State ──
let INVENTORY    = {};
let laundryItems = [];
let usedKeys     = new Set();
let tomItem      = null;
let bags         = []; // [ { entries: [ { key, qty } ] } ]

window.latestSubmissionText = '';

// ── Boot ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadInventory();
  buildCategoryDropdown();
  bindEvents();
  setupJotform();
  renderAll();
});

// ── Load Inventory ──
async function loadInventory() {
  try {
    const res = await fetch('master-items.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    INVENTORY = await res.json();
  } catch (e) {
    showAlert('⚠️ Could not load inventory data.', 'error');
  }
}

// ── Category Dropdown ──
function buildCategoryDropdown() {
  const sel = document.getElementById('catSelect');
  Object.keys(INVENTORY).sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
}

// ── Bind Events ──
function bindEvents() {
  document.getElementById('catSelect').addEventListener('change', onCategoryChange);
  document.getElementById('componentSelect').addEventListener('change', onComponentChange);
  document.getElementById('weightInput').addEventListener('input', onWeightInput);
  document.getElementById('qtySelect').addEventListener('change', onQtyChange);
  document.getElementById('btnAdd').addEventListener('click', onAddItem);
}

// ── Category Change ──
function onCategoryChange() {
  const cat = document.getElementById('catSelect').value;
  clearAlert();
  resetItemDropdown();
  hideComponent();
  resetWeightArea();
  hideQuantityRow();
  updateAddButton();
  if (!cat || !INVENTORY[cat]) return;
  const available = INVENTORY[cat].items.filter(it => !usedKeys.has(makeKey(cat, it.name)));
  buildItemDropdown(cat, available);
  if (getCatMode(cat) === 'quantity') showQuantityRow();
}

// ── Item Dropdown ──
function resetItemDropdown() {
  if (tomItem) { tomItem.destroy(); tomItem = null; }
  document.getElementById('itemSelect').innerHTML = '<option value="">— Select category first —</option>';
}

function buildItemDropdown(cat, items) {
  if (tomItem) { tomItem.destroy(); tomItem = null; }
  const sel = document.getElementById('itemSelect');
  sel.innerHTML = '<option value=""></option>';
  items.forEach(it => {
    const opt = document.createElement('option');
    opt.value = it.name; opt.textContent = it.name;
    sel.appendChild(opt);
  });
  tomItem = new TomSelect('#itemSelect', {
    placeholder: 'Search item…', maxOptions: 200,
    sortField: { field: 'text', direction: 'asc' },
    onChange(val) { onItemChange(cat, val); }
  });
}

// ── Item Change ──
function onItemChange(cat, itemName) {
  hideComponent(); resetWeightArea(); updateAddButton();
  if (!itemName || !INVENTORY[cat]) return;
  const catData = INVENTORY[cat];
  const item = catData.items.find(i => i.name === itemName);
  if (!item) return;
  const mode = getCatMode(cat);
  if (catData.type === 'components') {
    showComponentDropdown(catData.components, item);
  } else if (catData.type === 'auto') {
    if (item.weight !== null && item.weight !== undefined) setWeightDisplay(item.weight, mode);
    else showManualWeightInput(mode);
  } else {
    showManualWeightInput(mode);
  }
  updateTotalWeightDisplay();
  updateAddButton();
}

// ── Component ──
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
  const w = item.components[comp];
  if (w !== null && w !== undefined) setWeightDisplay(w, getCatMode(cat));
  else showManualWeightInput(getCatMode(cat));
  updateTotalWeightDisplay();
  updateAddButton();
}

// ── Weight Area ──
function setWeightDisplay(val, mode) {
  const disp  = document.getElementById('weightDisplay');
  const inp   = document.getElementById('weightInput');
  document.getElementById('weightLabel').textContent = mode === 'quantity' ? 'Weight Per Item' : 'Weight';
  disp.classList.remove('empty');
  disp.style.display = '';
  disp.innerHTML = `<span class="weight-val">${parseFloat(val).toFixed(3)}</span><span class="weight-unit">kg</span>`;
  disp.dataset.weight = val;
  inp.style.display = 'none';
  inp.value = '';
}

function showManualWeightInput(mode) {
  const disp = document.getElementById('weightDisplay');
  const inp  = document.getElementById('weightInput');
  document.getElementById('weightLabel').textContent = mode === 'quantity' ? 'Weight Per Item' : 'Weight';
  disp.style.display = 'none';
  delete disp.dataset.weight;
  inp.style.display = '';
  inp.value = '';
  inp.placeholder = mode === 'quantity' ? 'Weight per item (kg)' : 'Enter kg (e.g. 0.30)';
  inp.focus();
}

function resetWeightArea() {
  const disp = document.getElementById('weightDisplay');
  const inp  = document.getElementById('weightInput');
  document.getElementById('weightLabel').textContent = 'Weight';
  disp.classList.add('empty');
  disp.style.display = '';
  disp.innerHTML = '<span class="weight-val">—</span><span class="weight-unit">kg</span>';
  delete disp.dataset.weight;
  inp.style.display = 'none';
  inp.value = '';
  const tw = document.getElementById('totalWeightDisplay');
  if (tw) tw.textContent = '—';
}

function getCurrentWeightPerItem() {
  const disp = document.getElementById('weightDisplay');
  const inp  = document.getElementById('weightInput');
  if (inp.style.display !== 'none') {
    const v = parseFloat(inp.value);
    return (!isNaN(v) && v > 0) ? v : null;
  }
  if (disp.dataset.weight) return parseFloat(disp.dataset.weight);
  return null;
}

// ── Quantity Row ──
function showQuantityRow() {
  document.getElementById('quantityRow').style.display   = '';
  document.getElementById('totalWeightRow').style.display = '';
  document.getElementById('qtySelect').value = '1';
}

function hideQuantityRow() {
  document.getElementById('quantityRow').style.display   = 'none';
  document.getElementById('totalWeightRow').style.display = 'none';
  document.getElementById('qtySelect').value = '1';
  const tw = document.getElementById('totalWeightDisplay');
  if (tw) tw.textContent = '—';
}

function onQtyChange()    { updateTotalWeightDisplay(); updateAddButton(); }
function onWeightInput()  { updateTotalWeightDisplay(); updateAddButton(); }

function updateTotalWeightDisplay() {
  const cat = document.getElementById('catSelect').value;
  if (!cat || getCatMode(cat) !== 'quantity') return;
  const tw  = document.getElementById('totalWeightDisplay');
  if (!tw) return;
  const wpi = getCurrentWeightPerItem();
  const qty = parseInt(document.getElementById('qtySelect').value) || 1;
  tw.textContent = (wpi && wpi > 0) ? (wpi * qty).toFixed(3) + ' kg' : '—';
}

// ── Add Button ──
function updateAddButton() {
  document.getElementById('btnAdd').disabled = !canAdd();
}

function canAdd() {
  const cat = document.getElementById('catSelect').value;
  if (!cat || !INVENTORY[cat]) return false;
  if (!tomItem || !tomItem.getValue()) return false;
  if (INVENTORY[cat].type === 'components' && !document.getElementById('componentSelect').value) return false;
  const wpi = getCurrentWeightPerItem();
  return wpi !== null && !isNaN(wpi) && wpi > 0;
}

// ── Add Item ──
function onAddItem() {
  clearAlert();
  const cat = document.getElementById('catSelect').value;
  if (!cat || !INVENTORY[cat]) return;
  const itemName = tomItem ? tomItem.getValue() : '';
  if (!itemName) return;

  const catData = INVENTORY[cat];
  const mode    = getCatMode(cat);
  let displayName = itemName;

  if (catData.type === 'components') {
    const comp = document.getElementById('componentSelect').value;
    if (!comp) return;
    displayName = `${itemName} - ${comp}`;
  }

  const weightPerItem = getCurrentWeightPerItem();
  if (!weightPerItem || isNaN(weightPerItem) || weightPerItem <= 0) {
    showAlert('Please enter a valid weight.', 'warn'); return;
  }

  const isManual = document.getElementById('weightInput').style.display !== 'none';
  const qty         = mode === 'quantity' ? (parseInt(document.getElementById('qtySelect').value) || 1) : 1;
  const totalWeight = parseFloat((weightPerItem * qty).toFixed(6));
  const key         = makeKey(cat, displayName);

  if (usedKeys.has(key)) { showAlert(`"${displayName}" is already in the list.`, 'warn'); return; }

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

// ── Remove Item ──
function removeItem(key) {
  laundryItems = laundryItems.filter(i => i.key !== key);
  usedKeys.delete(key);
  // Clean from bags
  bags.forEach(bag => { bag.entries = bag.entries.filter(e => e.key !== key); });
  renderAll();
}

// ── Render All ──
function renderAll() {
  renderList();
  renderTotals();
  refreshBagUI();
  renderSummary();
  broadcastToJotform();
}

// ── Render List ──
function renderList() {
  const ul    = document.getElementById('laundryList');
  const empty = document.getElementById('listEmpty');
  ul.innerHTML = '';
  if (laundryItems.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  laundryItems.forEach(it => {
    const li = document.createElement('li');
    li.className = 'laundry-item';
    let weightInfo = it.mode === 'quantity' && it.quantity > 1
      ? `<span class="item-qty-badge">×${it.quantity}</span>
         <span class="item-weight-per">${it.weightPerItem.toFixed(3)} kg/ea</span>
         <span class="item-dots">··</span>
         <span class="item-weight${it.isManual ? ' manual' : ''}">${it.totalWeight.toFixed(3)} kg</span>`
      : `<span class="item-dots">··············</span>
         <span class="item-weight${it.isManual ? ' manual' : ''}">${it.totalWeight.toFixed(3)} kg</span>`;
    li.innerHTML = `<span class="item-name">${escHtml(it.displayName)}</span>${weightInfo}
      <button class="btn btn-danger" onclick="removeItem(${JSON.stringify(it.key)})">✕</button>`;
    ul.appendChild(li);
  });
}

// ── Render Totals ──
function renderTotals() {
  const totalW = laundryItems.reduce((s, i) => s + i.totalWeight, 0);
  document.getElementById('totalItems').textContent  = laundryItems.length;
  document.getElementById('totalWeight').textContent = totalW.toFixed(3) + ' kg';
}

// ══════════════════════════════════════════════
//  BAG GROUPING
// ══════════════════════════════════════════════

// Called from HTML onclick="onSetBags()"
window.onSetBags = function() {
  const n       = parseInt(document.getElementById('numBagsInput').value) || 1;
  const clamped = Math.max(1, Math.min(20, n));
  while (bags.length < clamped) bags.push({ entries: [] });
  while (bags.length > clamped) bags.pop();
  bags.forEach(bag => {
    bag.entries = bag.entries.filter(e => laundryItems.some(i => i.key === e.key));
  });
  renderAllBags();
  renderSummary();
  broadcastToJotform();
};

function refreshBagUI() {
  const hasList = laundryItems.length > 0;
  document.getElementById('bagEmpty').style.display = hasList ? 'none' : '';
  document.getElementById('bagSetup').style.display = hasList ? ''     : 'none';
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
  bags.forEach((bag, idx) => buildBagCard(grid, bag, idx));
  container.appendChild(grid);
}

function buildBagCard(grid, bag, idx) {
  const bagW = getBagWeight(idx);
  const card = document.createElement('div');
  card.className = 'bag-card';

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'bag-header';
  hdr.innerHTML = `<h3>Bag ${idx + 1}</h3><span class="bag-weight">${bagW.toFixed(3)} kg</span>`;
  card.appendChild(hdr);

  // Picker
  const picker = document.createElement('div');
  picker.className = 'bag-item-picker';

  const lbl = document.createElement('label');
  lbl.className = 'picker-label';
  lbl.textContent = 'Select Item to Add';
  picker.appendChild(lbl);

  // Scrollable listbox — items not yet in this bag
  const usedInBag = new Set(bag.entries.map(e => e.key));
  const sel = document.createElement('select');
  sel.size = Math.min(6, Math.max(3, laundryItems.filter(i => !usedInBag.has(i.key)).length + 1));

  const blank = document.createElement('option');
  blank.value = ''; blank.textContent = '— Select item —';
  sel.appendChild(blank);

  laundryItems.forEach(it => {
    if (usedInBag.has(it.key)) return;
    const opt = document.createElement('option');
    opt.value = it.key;
    opt.textContent = it.mode === 'quantity' && it.quantity > 1
      ? `${it.displayName} (up to ×${it.quantity})`
      : `${it.displayName} — ${it.totalWeight.toFixed(3)} kg`;
    sel.appendChild(opt);
  });
  picker.appendChild(sel);

  // Qty row for quantity items
  const qtyRow = document.createElement('div');
  qtyRow.className = 'bag-qty-row';
  qtyRow.style.display = 'none';
  const qtyLbl = document.createElement('label');
  qtyLbl.className = 'picker-label';
  qtyLbl.style.marginTop = '8px';
  qtyLbl.textContent = 'Quantity for this bag';
  const qtySel = document.createElement('select');
  qtySel.style.cssText = 'width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;';
  qtyRow.appendChild(qtyLbl);
  qtyRow.appendChild(qtySel);
  picker.appendChild(qtyRow);

  sel.addEventListener('change', () => {
    const key = sel.value;
    if (!key) { qtyRow.style.display = 'none'; addBtn.disabled = true; return; }
    addBtn.disabled = false;
    const it = laundryItems.find(i => i.key === key);
    if (it && it.mode === 'quantity' && it.quantity > 1) {
      qtySel.innerHTML = '';
      for (let q = 1; q <= it.quantity; q++) {
        const o = document.createElement('option');
        o.value = q; o.textContent = q; qtySel.appendChild(o);
      }
      qtyRow.style.display = '';
    } else {
      qtyRow.style.display = 'none';
    }
  });

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.style.cssText = 'margin-top:10px;width:100%;';
  addBtn.textContent = 'Add to Bag';
  addBtn.disabled = true;
  picker.appendChild(addBtn);

  addBtn.addEventListener('click', () => {
    const key = sel.value;
    if (!key) return;
    const it = laundryItems.find(i => i.key === key);
    if (!it) return;
    const qty = (it.mode === 'quantity' && it.quantity > 1) ? (parseInt(qtySel.value) || 1) : 1;
    bag.entries.push({ key, qty });
    renderAllBags();
    renderSummary();
    broadcastToJotform();
  });

  card.appendChild(picker);

  // Entries
  const itemsList = document.createElement('div');
  itemsList.className = 'bag-items';

  if (bag.entries.length === 0) {
    const em = document.createElement('div');
    em.className = 'bag-no-items';
    em.textContent = 'No items added yet.';
    itemsList.appendChild(em);
  } else {
    bag.entries.forEach((entry, eIdx) => {
      const it = laundryItems.find(i => i.key === entry.key);
      if (!it) return;
      const entryW = it.mode === 'quantity' ? it.weightPerItem * entry.qty : it.totalWeight;
      const qStr   = it.mode === 'quantity' && entry.qty > 1 ? ` ×${entry.qty}` : '';

      const row = document.createElement('div');
      row.className = 'bag-item-row';

      const nm = document.createElement('span');
      nm.className = 'bag-item-name';
      nm.textContent = `• ${it.displayName}${qStr}`;

      const wt = document.createElement('span');
      wt.className = 'bag-item-wt';
      wt.textContent = `${entryW.toFixed(3)} kg`;

      const rm = document.createElement('button');
      rm.className = 'bag-item-remove';
      rm.textContent = '✕';
      rm.addEventListener('click', () => {
        bag.entries.splice(eIdx, 1);
        renderAllBags();
        renderSummary();
        broadcastToJotform();
      });

      row.appendChild(nm); row.appendChild(wt); row.appendChild(rm);
      itemsList.appendChild(row);
    });
  }
  card.appendChild(itemsList);

  if (bagW > 0) {
    const tr = document.createElement('div');
    tr.className = 'bag-total-row';
    tr.innerHTML = `Total: <strong>${bagW.toFixed(3)} kg</strong>`;
    card.appendChild(tr);
  }

  grid.appendChild(card);
}

function getBagWeight(idx) {
  let w = 0;
  bags[idx].entries.forEach(e => {
    const it = laundryItems.find(i => i.key === e.key);
    if (it) w += it.mode === 'quantity' ? it.weightPerItem * e.qty : it.totalWeight;
  });
  return w;
}

// ── Summary ──
function buildSummaryText() {
  if (laundryItems.length === 0) return '— No items —';
  const totalW = laundryItems.reduce((s, i) => s + i.totalWeight, 0);
  let lines = [];

  if (bags.length > 0 && bags.some(b => b.entries.length > 0)) {
    bags.forEach((bag, idx) => {
      if (bag.entries.length === 0) return;
      lines.push(`--- BAG ${idx + 1} (${getBagWeight(idx).toFixed(3)}kg) ---`);
      bag.entries.forEach(e => {
        const it = laundryItems.find(i => i.key === e.key);
        if (!it) return;
        const ew = it.mode === 'quantity' ? it.weightPerItem * e.qty : it.totalWeight;
        const qs = it.mode === 'quantity' && e.qty > 1 ? ` ×${e.qty}` : '';
        lines.push(`ITEM NAME: ${it.displayName}${qs}`);
        if (it.mode === 'quantity' && e.qty > 1) {
          lines.push(`QUANTITY: ${e.qty}`);
          lines.push(`WEIGHT PER ITEM: ${it.weightPerItem.toFixed(3)}kg`);
        }
        lines.push(`WEIGHT: ${ew.toFixed(3)}kg`);
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
  const text   = buildSummaryText();
  window.latestSubmissionText = text;
  const totalW = laundryItems.reduce((s, i) => s + i.totalWeight, 0);
  const gt     = document.getElementById('grandTotalWeight');
  if (gt) gt.textContent = totalW.toFixed(3) + ' kg';
}

// ── JotForm ──
function setupJotform() {
  if (typeof JFCustomWidget === 'undefined') return;
  JFCustomWidget.subscribe('submit', () => {
    JFCustomWidget.sendSubmit({ valid: true, value: window.latestSubmissionText });
  });
  JFCustomWidget.subscribe('ready', broadcastToJotform);
}

function broadcastToJotform() {
  const value = window.latestSubmissionText;
  if (typeof JFCustomWidget !== 'undefined') {
    try { JFCustomWidget.sendData({ value }); } catch(e) {}
  }
  try {
    if (window.parent && window.parent !== window) {
      const t = window.parent.document.getElementById('input_82');
      if (t) {
        t.value = value;
        t.dispatchEvent(new Event('input',  { bubbles: true }));
        t.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.parent.postMessage(JSON.stringify({ type:'widgetValue', fieldId:'input_82', value, valid:true }), '*');
    }
  } catch(e) {}
}

// ── Future: Transaction Loader ──
window.loadTransaction = function(txnNumber) {
  console.log('[loadTransaction] Not yet implemented:', txnNumber);
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

// ── Utilities ──
function makeKey(cat, name) { return `${cat}::${name}`; }

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showAlert(msg, type = 'warn') {
  document.getElementById('alertBox').innerHTML = `<div class="alert alert-${type}">${escHtml(msg)}</div>`;
}
function clearAlert() { document.getElementById('alertBox').innerHTML = ''; }
