/**
 * Noelle West Laundry Calculator
 * app.js — vanilla JS, no frameworks
 *
 * Structure allows future loadTransaction(txnNumber) hook:
 *   window.loadTransaction = async (txnNumber) => { ... }
 */

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
let INVENTORY = {};           // master-items.json contents
let laundryItems = [];        // { key, displayName, weight, isManual }
let usedKeys = new Set();     // prevent duplicates

let tomItem = null;           // Tom Select instance for item dropdown

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
//  Load Inventory JSON
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
//  Bind UI Events
// ─────────────────────────────────────────────
function bindEvents() {
  document.getElementById('catSelect').addEventListener('change', onCategoryChange);
  document.getElementById('componentSelect').addEventListener('change', onComponentChange);
  document.getElementById('weightInput').addEventListener('input', updateAddButton);
  document.getElementById('btnAdd').addEventListener('click', onAddItem);
  document.getElementById('bagToggle').addEventListener('change', onBagToggle);
  document.getElementById('bagMaxWeight').addEventListener('input', renderBags);
  document.getElementById('btnCopy').addEventListener('click', copySummary);

  // Future: Transaction search
  const btnLoadTxn = document.getElementById('btnLoadTxn');
  if (btnLoadTxn) {
    btnLoadTxn.addEventListener('click', () => {
      const txn = document.getElementById('txnInput').value.trim();
      if (txn && typeof window.loadTransaction === 'function') {
        window.loadTransaction(txn);
      }
    });
  }
}

// ─────────────────────────────────────────────
//  Category Change
// ─────────────────────────────────────────────
function onCategoryChange() {
  const cat = document.getElementById('catSelect').value;
  clearAlert();
  resetItemDropdown();
  hideComponent();
  resetWeight();
  updateAddButton();

  if (!cat || !INVENTORY[cat]) return;

  const catData = INVENTORY[cat];
  const available = catData.items.filter(it => !usedKeys.has(makeKey(cat, it.name)));

  buildItemDropdown(cat, available);
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
  resetWeight();
  updateAddButton();

  if (!itemName || !INVENTORY[cat]) return;

  const catData = INVENTORY[cat];
  const item = catData.items.find(i => i.name === itemName);
  if (!item) return;

  if (catData.type === 'auto') {
    // Auto-populate weight
    if (item.weight !== null && item.weight !== undefined) {
      setWeightDisplay(item.weight);
    } else {
      setWeightDisplay(null); // no weight on record
    }
    updateAddButton();

  } else if (catData.type === 'components') {
    showComponentDropdown(catData.components, item);

  } else {
    // Manual
    showManualWeight();
  }
}

// ─────────────────────────────────────────────
//  Component Dropdown
// ─────────────────────────────────────────────
function showComponentDropdown(componentNames, item) {
  const grp = document.getElementById('componentGroup');
  const sel = document.getElementById('componentSelect');
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
  const cat = document.getElementById('catSelect').value;
  const itemName = tomItem ? tomItem.getValue() : '';
  const comp = document.getElementById('componentSelect').value;

  if (!comp || !itemName || !INVENTORY[cat]) { resetWeight(); updateAddButton(); return; }
  const item = INVENTORY[cat].items.find(i => i.name === itemName);
  if (!item) return;

  const w = item.components[comp];
  if (w !== null && w !== undefined) {
    setWeightDisplay(w);
  } else {
    setWeightDisplay(null);
  }
  updateAddButton();
}

// ─────────────────────────────────────────────
//  Weight Display / Input
// ─────────────────────────────────────────────
function setWeightDisplay(val) {
  const disp = document.getElementById('weightDisplay');
  const inp = document.getElementById('weightInput');

  if (val !== null && val !== undefined) {
    disp.classList.remove('empty');
    disp.innerHTML = `<span class="weight-val">${parseFloat(val).toFixed(3)}</span><span class="weight-unit">kg</span>`;
    disp.classList.remove('hidden');
    inp.classList.add('hidden');
  } else {
    // No weight on record — show manual input
    showManualWeight();
  }
}

function showManualWeight() {
  const disp = document.getElementById('weightDisplay');
  const inp = document.getElementById('weightInput');
  disp.classList.add('hidden');
  inp.classList.remove('hidden');
  inp.value = '';
  inp.focus();
}

function resetWeight() {
  const disp = document.getElementById('weightDisplay');
  const inp = document.getElementById('weightInput');
  disp.classList.add('empty');
  disp.innerHTML = '<span class="weight-val">—</span><span class="weight-unit">kg</span>';
  disp.classList.remove('hidden');
  inp.classList.add('hidden');
  inp.value = '';
}

// ─────────────────────────────────────────────
//  Add Button State
// ─────────────────────────────────────────────
function updateAddButton() {
  const btn = document.getElementById('btnAdd');
  btn.disabled = !canAdd();
}

function canAdd() {
  const cat = document.getElementById('catSelect').value;
  if (!cat || !INVENTORY[cat]) return false;

  const itemName = tomItem ? tomItem.getValue() : '';
  if (!itemName) return false;

  const catData = INVENTORY[cat];

  if (catData.type === 'components') {
    const comp = document.getElementById('componentSelect').value;
    if (!comp) return false;
    // weight may be null — still allow (will need manual entry)
    const item = catData.items.find(i => i.name === itemName);
    const w = item && item.components[comp];
    const manual = document.getElementById('weightInput');
    if ((w === null || w === undefined) && (!manual.value || parseFloat(manual.value) <= 0)) return false;
    return true;
  }

  if (catData.type === 'manual') {
    const manual = document.getElementById('weightInput');
    return manual.value && parseFloat(manual.value) > 0;
  }

  // auto — weight may be null
  const inp = document.getElementById('weightInput');
  const disp = document.getElementById('weightDisplay');
  if (!inp.classList.contains('hidden')) {
    return inp.value && parseFloat(inp.value) > 0;
  }
  // weight display shown — only if has value
  const wval = disp.querySelector('.weight-val');
  return wval && wval.textContent !== '—';
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
  let displayName = itemName;
  let weight = null;
  let isManual = false;

  if (catData.type === 'components') {
    const comp = document.getElementById('componentSelect').value;
    if (!comp) return;
    displayName = `${itemName} - ${comp}`;
    const item = catData.items.find(i => i.name === itemName);
    const w = item && item.components[comp];
    if (w !== null && w !== undefined) {
      weight = parseFloat(w);
    } else {
      const inp = document.getElementById('weightInput');
      weight = parseFloat(inp.value);
      isManual = true;
    }

  } else if (catData.type === 'manual') {
    const inp = document.getElementById('weightInput');
    weight = parseFloat(inp.value);
    isManual = true;

  } else {
    // auto
    const inp = document.getElementById('weightInput');
    if (!inp.classList.contains('hidden')) {
      weight = parseFloat(inp.value);
      isManual = true;
    } else {
      const disp = document.getElementById('weightDisplay');
      const wval = disp.querySelector('.weight-val');
      weight = wval ? parseFloat(wval.textContent) : null;
    }
  }

  if (weight === null || isNaN(weight) || weight < 0) {
    showAlert('Please enter a valid weight.', 'warn');
    return;
  }

  const key = makeKey(cat, displayName);
  if (usedKeys.has(key)) {
    showAlert(`"${displayName}" is already in the list.`, 'warn');
    return;
  }

  laundryItems.push({ key, displayName, weight, isManual, category: cat });
  usedKeys.add(key);

  // Reset form
  document.getElementById('catSelect').value = '';
  resetItemDropdown();
  hideComponent();
  resetWeight();
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
  const ul = document.getElementById('laundryList');
  const empty = document.getElementById('listEmpty');
  ul.innerHTML = '';

  if (laundryItems.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  laundryItems.forEach(it => {
    const li = document.createElement('li');
    li.className = 'laundry-item';
    li.innerHTML = `
      <span class="item-name">${escHtml(it.displayName)}</span>
      <span class="item-dots">··············</span>
      <span class="item-weight${it.isManual ? ' manual' : ''}">${it.weight.toFixed(3)} kg</span>
      <button class="btn btn-danger" onclick="removeItem(${JSON.stringify(it.key)})">✕</button>
    `;
    ul.appendChild(li);
  });
}

// ─────────────────────────────────────────────
//  Render Totals
// ─────────────────────────────────────────────
function renderTotals() {
  const totalW = laundryItems.reduce((s, i) => s + i.weight, 0);
  document.getElementById('totalItems').textContent = laundryItems.length;
  document.getElementById('totalWeight').textContent = totalW.toFixed(3) + ' kg';
}

// ─────────────────────────────────────────────
//  Bag Grouping
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

  let html = '<div class="bags-grid">';
  bags.forEach((bag, idx) => {
    const bagW = bag.reduce((s, i) => s + i.weight, 0);
    html += `
      <div class="bag-card">
        <div class="bag-header">
          <h3>Bag ${idx + 1}</h3>
          <span class="bag-weight">${bagW.toFixed(3)} kg</span>
        </div>
        <div class="bag-items">
          ${bag.map(it => `<div>• ${escHtml(it.displayName)} <span style="color:#888">(${it.weight.toFixed(3)} kg)</span></div>`).join('')}
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function groupIntoBags(items, maxW) {
  // First-fit decreasing bin packing
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  const bags = [];
  sorted.forEach(item => {
    let placed = false;
    for (const bag of bags) {
      const used = bag.reduce((s, i) => s + i.weight, 0);
      if (used + item.weight <= maxW + 0.0001) {
        bag.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) bags.push([item]);
  });
  return bags;
}

// ─────────────────────────────────────────────
//  Summary Output
// ─────────────────────────────────────────────
function buildSummaryText() {
  if (laundryItems.length === 0) return '— No items —';
  const totalW = laundryItems.reduce((s, i) => s + i.weight, 0);
  let lines = [];

  laundryItems.forEach(it => {
    lines.push(`ITEM NAME: ${it.displayName}`);
    lines.push(`WEIGHT: ${it.weight.toFixed(3)}kg`);
    lines.push('');
  });

  lines.push(`TOTAL ITEMS: ${laundryItems.length}`);
  lines.push(`TOTAL WEIGHT: ${totalW.toFixed(3)}kg`);

  return lines.join('\n');
}

function renderSummary() {
  const text = buildSummaryText();
  window.latestSubmissionText = text;
  document.getElementById('summaryOutput').textContent = text;
}

// ─────────────────────────────────────────────
//  Copy to Clipboard
// ─────────────────────────────────────────────
function copySummary() {
  navigator.clipboard.writeText(window.latestSubmissionText).then(() => {
    const btn = document.getElementById('btnCopy');
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Summary'; }, 2000);
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = window.latestSubmissionText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

// ─────────────────────────────────────────────
//  JotForm Integration
// ─────────────────────────────────────────────
function setupJotform() {
  if (typeof JFCustomWidget === 'undefined') return;

  JFCustomWidget.subscribe('submit', function () {
    JFCustomWidget.sendSubmit({
      valid: true,
      value: window.latestSubmissionText
    });
  });
}

function broadcastToJotform() {
  if (typeof JFCustomWidget === 'undefined') return;
  try {
    JFCustomWidget.sendData({ value: window.latestSubmissionText });
  } catch (e) { /* outside JotForm context */ }
}

// ─────────────────────────────────────────────
//  Future Hook: Load from Transaction Number
//  To implement: override window.loadTransaction
// ─────────────────────────────────────────────
window.loadTransaction = function(txnNumber) {
  // Future implementation:
  // 1. Fetch transaction data from your API using txnNumber
  // 2. Clear current laundryItems
  // 3. For each item in transaction:
  //    addItemProgrammatically(category, itemName, componentName, weight)
  // 4. Call renderAll()
  console.log('[loadTransaction] Not yet implemented. TXN:', txnNumber);
  showAlert(`Transaction loading not yet implemented. (${txnNumber})`, 'warn');
};

/**
 * Programmatic item add — for future transaction loader or bulk import.
 * @param {string} category
 * @param {string} itemName
 * @param {string|null} component  (null if not a component-type item)
 * @param {number} weight
 */
window.addItemProgrammatically = function(category, itemName, component, weight) {
  const displayName = component ? `${itemName} - ${component}` : itemName;
  const key = makeKey(category, displayName);
  if (usedKeys.has(key)) return false; // skip duplicates

  laundryItems.push({ key, displayName, weight: parseFloat(weight), isManual: false, category });
  usedKeys.add(key);
  renderAll();
  return true;
};

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────
function makeKey(cat, name) {
  return `${cat}::${name}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showAlert(msg, type = 'warn') {
  const box = document.getElementById('alertBox');
  box.innerHTML = `<div class="alert alert-${type}">${escHtml(msg)}</div>`;
}

function clearAlert() {
  document.getElementById('alertBox').innerHTML = '';
}
