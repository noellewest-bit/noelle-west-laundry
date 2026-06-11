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
let laundryItems = [];   // { key, displayName, weightPerItem, quantity, totalWeight, isManual, category, mode }
let usedKeys     = new Set();
let tomItem      = null;

// bags[i] = { entries: [ { key, qty } ] }
// key = laundryItem.key; qty = units assigned to this bag
let bags = [];

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
  } catch(e) {
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
  hideQtyRow();
  updateAddButton();
  if (!cat || !INVENTORY[cat]) return;
  const available = INVENTORY[cat].items.filter(it => !usedKeys.has(makeKey(cat, it.name)));
  buildItemDropdown(cat, available);
  if (getCatMode(cat) === 'quantity') showQtyRow();
}

// ── Item Dropdown (Tom Select) ──
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
    opt.textContent = c + (w != null ? ` (${w} kg)` : '');
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
  const cat  = document.getElementById('catSelect').value;
  const name = tomItem ? tomItem.getValue() : '';
  const comp = document.getElementById('componentSelect').value;
  resetWeightArea();
  if (!comp || !name || !INVENTORY[cat]) { updateAddButton(); return; }
  const item = INVENTORY[cat].items.find(i => i.name === name);
  if (!item) return;
  const w = item.components[comp];
  if (w != null) setWeightDisplay(w, getCatMode(cat));
  else           showManualWeightInput(getCatMode(cat));
  updateTotalWeightDisplay();
  updateAddButton();
}

// ── Weight ──
function setWeightDisplay(val, mode) {
  const disp = document.getElementById('weightDisplay');
  const inp  = document.getElementById('weightInput');
  document.getElementById('weightLabel').textContent = mode === 'quantity' ? 'Weight Per Item' : 'Weight';
  disp.classList.remove('empty');
  disp.style.display = '';
  disp.innerHTML = `<span class="weight-val">${parseFloat(val).toFixed(3)}</span><span class="weight-unit">kg</span>`;
  disp.dataset.weight = val;
  inp.style.display = 'none'; inp.value = '';
}

function showManualWeightInput(mode) {
  const disp = document.getElementById('weightDisplay');
  const inp  = document.getElementById('weightInput');
  document.getElementById('weightLabel').textContent = mode === 'quantity' ? 'Weight Per Item' : 'Weight';
  disp.style.display = 'none'; delete disp.dataset.weight;
  inp.style.display = '';
  inp.placeholder = mode === 'quantity' ? 'Weight per item (kg)' : 'Enter kg';
  inp.value = ''; inp.focus();
}

function resetWeightArea() {
  const disp = document.getElementById('weightDisplay');
  const inp  = document.getElementById('weightInput');
  document.getElementById('weightLabel').textContent = 'Weight';
  disp.classList.add('empty');
  disp.style.display = '';
  disp.innerHTML = '<span class="weight-val">—</span><span class="weight-unit">kg</span>';
  delete disp.dataset.weight;
  inp.style.display = 'none'; inp.value = '';
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
  return disp.dataset.weight ? parseFloat(disp.dataset.weight) : null;
}

// ── Qty Row ──
function showQtyRow() { document.getElementById('qtyTotalRow').style.display = ''; }
function hideQtyRow()  { document.getElementById('qtyTotalRow').style.display = 'none'; document.getElementById('qtySelect').value = '1'; }

function onQtyChange()   { updateTotalWeightDisplay(); updateAddButton(); }
function onWeightInput() { updateTotalWeightDisplay(); updateAddButton(); }

function updateTotalWeightDisplay() {
  const cat = document.getElementById('catSelect').value;
  if (!cat || getCatMode(cat) !== 'quantity') return;
  const wpi = getCurrentWeightPerItem();
  const qty = parseInt(document.getElementById('qtySelect').value) || 1;
  const tw  = document.getElementById('totalWeightDisplay');
  if (tw) tw.textContent = (wpi && wpi > 0) ? (wpi * qty).toFixed(3) + ' kg' : '—';
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

// ── Add Item to Laundry List ──
function onAddItem() {
  clearAlert();
  const cat      = document.getElementById('catSelect').value;
  const itemName = tomItem ? tomItem.getValue() : '';
  if (!cat || !INVENTORY[cat] || !itemName) return;

  const catData = INVENTORY[cat];
  const mode    = getCatMode(cat);
  let displayName = itemName;

  if (catData.type === 'components') {
    const comp = document.getElementById('componentSelect').value;
    if (!comp) return;
    displayName = `${itemName} - ${comp}`;
  }

  const weightPerItem = getCurrentWeightPerItem();
  if (!weightPerItem || weightPerItem <= 0) { showAlert('Please enter a valid weight.', 'warn'); return; }

  const isManual    = document.getElementById('weightInput').style.display !== 'none';
  const qty         = mode === 'quantity' ? (parseInt(document.getElementById('qtySelect').value) || 1) : 1;
  const totalWeight = parseFloat((weightPerItem * qty).toFixed(6));
  const key         = makeKey(cat, displayName);

  if (usedKeys.has(key)) { showAlert(`"${displayName}" is already in the list.`, 'warn'); return; }

  laundryItems.push({ key, displayName, weightPerItem, quantity: qty, totalWeight, isManual, category: cat, mode });
  usedKeys.add(key);

  document.getElementById('catSelect').value = '';
  resetItemDropdown(); hideComponent(); resetWeightArea(); hideQtyRow(); updateAddButton();
  renderAll();
}

// ── Remove Item from Laundry List ──
function removeItem(key) {
  laundryItems = laundryItems.filter(i => i.key !== key);
  usedKeys.delete(key);
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

// ── Render Laundry List ──
function renderList() {
  const ul    = document.getElementById('laundryList');
  const empty = document.getElementById('listEmpty');
  ul.innerHTML = '';
  if (laundryItems.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  laundryItems.forEach(it => {
    const li = document.createElement('li');
    li.className = 'laundry-item';
    const isQty = it.mode === 'quantity' && it.quantity > 1;
    li.innerHTML = `
      <span class="item-name">${escHtml(it.displayName)}</span>
      ${isQty ? `<span class="item-qty-badge">×${it.quantity}</span>
                 <span class="item-weight-per">${it.weightPerItem.toFixed(3)}/ea</span>
                 <span class="item-dots">··</span>` : `<span class="item-dots">·········</span>`}
      <span class="item-weight${it.isManual?' manual':''}">${it.totalWeight.toFixed(3)} kg</span>
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

// ════════════════════════════════════════════
//  BAG GROUPING — Pool + Columns
// ════════════════════════════════════════════

// Called from HTML onclick="onSetBags()"
window.onSetBags = function() {
  const n       = parseInt(document.getElementById('numBagsInput').value) || 1;
  const clamped = Math.max(1, Math.min(20, n));
  while (bags.length < clamped) bags.push({ entries: [] });
  while (bags.length > clamped) bags.pop();
  cleanBagEntries();
  document.getElementById('bagWorkspace').style.display = '';
  renderBagWorkspace();
  renderSummary();
  broadcastToJotform();
};

function refreshBagUI() {
  const hasList = laundryItems.length > 0;
  document.getElementById('bagEmpty').style.display = hasList ? 'none' : '';
  document.getElementById('bagSetup').style.display = hasList ? ''     : 'none';
  cleanBagEntries();
  if (bags.length > 0) renderBagWorkspace();
}

function cleanBagEntries() {
  bags.forEach(bag => {
    bag.entries = bag.entries.filter(e => laundryItems.some(i => i.key === e.key));
  });
}

// How many units of a key are assigned across ALL bags
function totalAssigned(key) {
  return bags.reduce((s, bag) => {
    const e = bag.entries.find(e => e.key === key);
    return s + (e ? e.qty : 0);
  }, 0);
}

// Is this item fully assigned? (all units placed in bags)
function isFullyAssigned(key) {
  const it = laundryItems.find(i => i.key === key);
  if (!it) return true;
  return totalAssigned(key) >= it.quantity;
}

function renderBagWorkspace() {
  renderPool();
  renderBagColumns();
}

// ── Pool (left column) ──
function renderPool() {
  const pool = document.getElementById('poolList');
  pool.innerHTML = '';

  if (laundryItems.length === 0) {
    pool.innerHTML = '<div class="pool-empty">No items yet.</div>';
    return;
  }

  laundryItems.forEach(it => {
    const assigned  = totalAssigned(it.key);
    const remaining = it.quantity - assigned;
    const full      = remaining <= 0;

    const row = document.createElement('div');
    row.className = 'pool-item' + (full ? ' assigned' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'pool-item-name';
    nameEl.textContent = it.displayName;

    const wtEl = document.createElement('span');
    wtEl.className = 'pool-item-wt';
    if (it.mode === 'quantity' && it.quantity > 1) {
      wtEl.textContent = full
        ? '✓ all assigned'
        : `${remaining} remaining`;
    } else {
      wtEl.textContent = full ? '✓' : `${it.totalWeight.toFixed(3)} kg`;
    }

    row.appendChild(nameEl);
    row.appendChild(wtEl);
    pool.appendChild(row);
  });
}

// ── Bag Columns (right) ──
function renderBagColumns() {
  const container = document.getElementById('bagsColumns');
  container.innerHTML = '';
  bags.forEach((bag, idx) => container.appendChild(buildBagColumn(bag, idx)));
}

function buildBagColumn(bag, idx) {
  const bagW = getBagWeight(idx);
  const col  = document.createElement('div');
  col.className = 'bag-col';

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'bag-col-header';
  hdr.innerHTML = `<h3>Bag ${idx + 1}</h3><span class="bag-col-weight">${bagW.toFixed(3)} kg</span>`;
  col.appendChild(hdr);

  // Adder — only show unfully-assigned items not already in THIS bag
  const adder = document.createElement('div');
  adder.className = 'bag-col-adder';

  const itemsInThisBag = new Set(bag.entries.map(e => e.key));
  const available = laundryItems.filter(it => {
    if (itemsInThisBag.has(it.key)) return false; // already in this bag
    if (isFullyAssigned(it.key)) return false;     // all units used up
    return true;
  });

  if (available.length > 0) {
    const sel = document.createElement('select');
    sel.innerHTML = '<option value="">— Select item —</option>';
    available.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.key;
      const remaining = it.quantity - totalAssigned(it.key);
      const suffix = it.mode === 'quantity' && it.quantity > 1
        ? ` (${remaining} left)`
        : ` — ${it.totalWeight.toFixed(3)}kg`;
      opt.textContent = it.displayName + suffix;
      sel.appendChild(opt);
    });
    adder.appendChild(sel);

    // Qty row for quantity items
    const qtyRow = document.createElement('div');
    qtyRow.className = 'bag-adder-qty';
    qtyRow.style.display = 'none';
    const qtyLbl = document.createElement('span');
    qtyLbl.textContent = 'Qty:';
    const qtySel = document.createElement('select');
    qtyRow.appendChild(qtyLbl);
    qtyRow.appendChild(qtySel);
    adder.appendChild(qtyRow);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ Add to Bag';
    addBtn.disabled = true;
    adder.appendChild(addBtn);

    sel.addEventListener('change', () => {
      const key = sel.value;
      if (!key) { addBtn.disabled = true; qtyRow.style.display = 'none'; return; }
      addBtn.disabled = false;
      const it = available.find(i => i.key === key);
      if (it && it.mode === 'quantity' && it.quantity > 1) {
        const remaining = it.quantity - totalAssigned(it.key);
        qtySel.innerHTML = '';
        for (let q = 1; q <= remaining; q++) {
          const o = document.createElement('option');
          o.value = q; o.textContent = q; qtySel.appendChild(o);
        }
        qtyRow.style.display = '';
      } else {
        qtyRow.style.display = 'none';
      }
    });

    addBtn.addEventListener('click', () => {
      const key = sel.value;
      if (!key) return;
      const it = laundryItems.find(i => i.key === key);
      if (!it) return;
      const qty = (it.mode === 'quantity' && it.quantity > 1)
        ? (parseInt(qtySel.value) || 1) : 1;
      bag.entries.push({ key, qty });
      renderBagWorkspace();
      renderSummary();
      broadcastToJotform();
    });
  } else {
    adder.innerHTML = '<div style="font-size:11px;color:var(--muted);font-style:italic;">All items assigned.</div>';
  }
  col.appendChild(adder);

  // Entries list
  const entries = document.createElement('div');
  entries.className = 'bag-col-entries';

  if (bag.entries.length === 0) {
    const em = document.createElement('div');
    em.className = 'bag-no-entries';
    em.textContent = 'Empty';
    entries.appendChild(em);
  } else {
    bag.entries.forEach((entry, eIdx) => {
      const it = laundryItems.find(i => i.key === entry.key);
      if (!it) return;
      const entryW = it.mode === 'quantity' ? it.weightPerItem * entry.qty : it.totalWeight;
      const qStr   = it.mode === 'quantity' && entry.qty > 1 ? ` ×${entry.qty}` : '';

      const row = document.createElement('div');
      row.className = 'bag-entry-row';

      const nm = document.createElement('span');
      nm.className = 'bag-entry-name';
      nm.textContent = it.displayName + qStr;

      const wt = document.createElement('span');
      wt.className = 'bag-entry-wt';
      wt.textContent = entryW.toFixed(3) + ' kg';

      const rm = document.createElement('button');
      rm.className = 'bag-entry-rm';
      rm.textContent = '✕';
      rm.addEventListener('click', () => {
        bag.entries.splice(eIdx, 1);
        renderBagWorkspace();
        renderSummary();
        broadcastToJotform();
      });

      row.appendChild(nm); row.appendChild(wt); row.appendChild(rm);
      entries.appendChild(row);
    });
  }
  col.appendChild(entries);

  // Footer total
  if (bagW > 0) {
    const ft = document.createElement('div');
    ft.className = 'bag-col-footer';
    ft.innerHTML = `Total: <strong>${bagW.toFixed(3)} kg</strong>`;
    col.appendChild(ft);
  }

  return col;
}

function getBagWeight(idx) {
  return bags[idx].entries.reduce((s, e) => {
    const it = laundryItems.find(i => i.key === e.key);
    return s + (it ? (it.mode === 'quantity' ? it.weightPerItem * e.qty : it.totalWeight) : 0);
  }, 0);
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
  const gt = document.getElementById('grandTotalWeight');
  if (gt) gt.textContent = totalW.toFixed(3) + ' kg';
}

// ── JotForm ──
function setupJotform() {
  if (typeof JFCustomWidget === 'undefined') return;
  JFCustomWidget.subscribe('submit', () =>
    JFCustomWidget.sendSubmit({ valid: true, value: window.latestSubmissionText }));
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
      window.parent.postMessage(
        JSON.stringify({ type:'widgetValue', fieldId:'input_82', value, valid:true }), '*');
    }
  } catch(e) {}
}

// ── Future: Transaction Loader ──
window.loadTransaction = txn => console.log('[loadTransaction] Not yet implemented:', txn);

window.addItemProgrammatically = function(category, itemName, component, weightPerItem, quantity = 1) {
  const displayName = component ? `${itemName} - ${component}` : itemName;
  const key = makeKey(category, displayName);
  if (usedKeys.has(key)) return false;
  const mode = getCatMode(category);
  laundryItems.push({ key, displayName, weightPerItem, quantity,
    totalWeight: parseFloat((weightPerItem * quantity).toFixed(6)),
    isManual: false, category, mode });
  usedKeys.add(key);
  renderAll();
  return true;
};

// ── Utilities ──
function makeKey(cat, name) { return `${cat}::${name}`; }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showAlert(msg, type='warn') {
  document.getElementById('alertBox').innerHTML = `<div class="alert alert-${type}">${escHtml(msg)}</div>`;
}
function clearAlert() { document.getElementById('alertBox').innerHTML = ''; }
