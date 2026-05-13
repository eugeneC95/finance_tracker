'use strict';

// ── State ──────────────────────────────────────────────────
let source   = null;   // 'tng' | 'uob'
let parsed   = [];     // [{date, desc, amount, type, cat, skip}]
let currentStep = 1;

// ── Category auto-detect keywords ─────────────────────────
const CAT_RULES = [
  { cat: 'Petrol',       keys: ['shell','petron','petronas','caltex','bhp','petrol','fuel','diesel'] },
  { cat: 'Car Service',  keys: ['servis','workshop','autoserv','car service','mechanic','spare part','tyre','tayar','brake'] },
  { cat: 'Toll',         keys: ['plus','touch n go','tng','toll','lebuhraya','highway','parkir','parking','car park'] },
  { cat: 'Food',         keys: ['food','restaurant','cafe','mamak','makan','pizza','kfc','mcdonalds','mcd','burger','nasi','mee','roti','teh','kopitiam','grab food','foodpanda','shopee food','laundry','jaya grocer','lotus','tesco','giant','aeon','99 speedmart','mydin'] },
  { cat: 'Shopping',     keys: ['shopee','lazada','zalora','h&m','uniqlo','padini','watson','guardian','sephora','ikea','harvey','courts','senheng'] },
  { cat: 'Bills',        keys: ['telekom','unifi','maxis','celcom','digi','u mobile','yes 4g','tnb','air selangor','indah water','astro','insurance','takaful','aia','great eastern','prudential'] },
  { cat: 'Health',       keys: ['klinik','clinic','hospital','pharmacy','farmasi','dentist','doktor','doctor','medical','health'] },
  { cat: 'Entertainment',keys: ['tgv','gsc','mbo','cineplex','cinema','netflix','spotify','steam','grab','grab ride','myrapid','lrt','mrt','bus','komuter'] },
  { cat: 'Transport',    keys: ['grab ride','myrapid','rapidkl','lrt','mrt','ktm','bus','teksi','taxi','uber'] },
  { cat: 'Salary',       keys: ['salary','gaji','payroll','wages'] },
  { cat: 'Investment',   keys: ['dividend','dividen','unit trust','amanah saham','asm','public mutual','kwsp','epf'] },
  { cat: 'Other',        keys: [] },
];

function autoCategory(desc) {
  const low = desc.toLowerCase();
  for (const rule of CAT_RULES) {
    if (rule.keys.some(k => low.includes(k))) return rule.cat;
  }
  return 'Other';
}

function isIncomeCat(cat) {
  return ['Salary','Freelance','Business','Investment','Rental','Gift'].includes(cat);
}

// ── Step navigation ────────────────────────────────────────
function goStep(n) {
  currentStep = n;
  document.querySelectorAll('.page').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.remove('active','done');
    if (i + 1 === n)      s.classList.add('active');
    else if (i + 1 < n)   s.classList.add('done');
  });
}

// ── Source selection ───────────────────────────────────────
function selectSource(s) {
  source = s;
  document.getElementById('src-tng').classList.toggle('selected', s === 'tng');
  document.getElementById('src-uob').classList.toggle('selected', s === 'uob');
  document.getElementById('btn-next1').disabled = false;
  document.getElementById('tng-input').style.display = s === 'tng' ? 'block' : 'none';
  document.getElementById('uob-input').style.display = s === 'uob' ? 'block' : 'none';
}

document.getElementById('btn-next1').addEventListener('click', () => { if (source) goStep(2); });

// ── TNG Parser ─────────────────────────────────────────────
// TNG PDF text format (after copy-paste):
// Date  Status  TransactionType  Description  Amount  Balance
// e.g.  "01 Jan 2025  Successful  DuitNow Payment  MAMAK CORNER  -12.50  234.10"
// or    "01/01/2025  Payment  SHELL PETROL  -RM80.00  RM154.10"
function parseTNG(text) {
  const rows   = [];
  const lines  = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Regex patterns for TNG date variants
  const dateRe = /^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i;
  const amtRe  = /[-+]?RM\s*[\d,]+\.?\d{0,2}|[-+][\d,]+\.\d{2}/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dm   = line.match(dateRe);
    if (!dm) continue;

    // Collect up to 4 more tokens on same or next line
    const full  = line + ' ' + (lines[i+1] || '') + ' ' + (lines[i+2] || '');
    const amts  = full.match(amtRe);
    if (!amts || amts.length < 1) continue;

    // First negative (or smallest) amount is debit; positive is credit/reload
    const amounts = amts.map(a => parseFloat(a.replace(/RM|,|\s/g,''))).filter(n => !isNaN(n));
    const txAmt   = amounts.find(a => a < 0) ?? amounts[0];
    if (!txAmt || txAmt === 0) continue;

    const dateStr = parseDateStr(dm[0]);
    if (!dateStr) continue;

    // Description = everything between date and first amount
    const afterDate = full.slice(dm[0].length).trim();
    const firstAmtIdx = afterDate.search(/[-+]?RM\s*[\d,]|[-+]\d+\.\d{2}/i);
    let desc = firstAmtIdx > 0 ? afterDate.slice(0, firstAmtIdx).trim() : afterDate.slice(0, 60).trim();
    desc = desc.replace(/\s{2,}/g, ' ').replace(/Successful|Failed|Pending/gi,'').trim();

    const cat  = autoCategory(desc);
    const type = txAmt < 0 ? (isIncomeCat(cat) ? 'inc' : 'exp') : 'inc';

    rows.push({ date: dateStr, desc, amount: Math.abs(txAmt), type, cat, skip: false });
  }
  return rows;
}

// ── UOB CSV/XLS Parser ─────────────────────────────────────
// UOB CSV columns (typical): Date, Description, Withdrawals(DR), Deposits(CR), Balance
function parseUOBCSV(text) {
  const rows  = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const low = lines[i].toLowerCase();
    if ((low.includes('date') || low.includes('tarikh')) && (low.includes('desc') || low.includes('keter') || low.includes('withdraw') || low.includes('debit') || low.includes('credit') || low.includes('deposit'))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) headerIdx = 0;

  const headers = parseCSVRow(lines[headerIdx]).map(h => h.toLowerCase().trim());
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('tarikh') || h.includes('value'));
  const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('narrat') || h.includes('particular') || h.includes('detail'));
  const drIdx   = headers.findIndex(h => h.includes('withdraw') || h.includes('debit') || h.includes(' dr') || h === 'dr');
  const crIdx   = headers.findIndex(h => h.includes('deposit') || h.includes('credit') || h.includes(' cr') || h === 'cr');
  const amtIdx  = headers.findIndex(h => h.includes('amount') || h.includes('jumlah'));

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVRow(lines[i]);
    if (cols.length < 3) continue;

    const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || '';
    const dateStr = parseDateStr(rawDate.trim());
    if (!dateStr) continue;

    const desc = (cols[descIdx >= 0 ? descIdx : 1] || '').replace(/"/g,'').trim();
    if (!desc) continue;

    let amount = 0, type = 'exp';
    if (drIdx >= 0 && cols[drIdx] && parseFloat(cols[drIdx].replace(/[^0-9.]/g,'')) > 0) {
      amount = parseFloat(cols[drIdx].replace(/[^0-9.]/g,''));
      type   = 'exp';
    } else if (crIdx >= 0 && cols[crIdx] && parseFloat(cols[crIdx].replace(/[^0-9.]/g,'')) > 0) {
      amount = parseFloat(cols[crIdx].replace(/[^0-9.]/g,''));
      type   = 'inc';
    } else if (amtIdx >= 0) {
      const raw = (cols[amtIdx] || '').replace(/[^0-9.\-]/g,'');
      amount    = Math.abs(parseFloat(raw));
      type      = parseFloat(raw) < 0 ? 'exp' : 'inc';
    }

    if (!amount || isNaN(amount)) continue;

    const cat = autoCategory(desc);
    if (type === 'exp' && isIncomeCat(cat)) type = 'inc';
    if (type === 'inc' && !isIncomeCat(cat)) { /* keep user's column signal */ }

    rows.push({ date: dateStr, desc, amount, type, cat, skip: false });
  }
  return rows;
}

function parseCSVRow(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    if (c === '\t' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

// ── Date normaliser ────────────────────────────────────────
function parseDateStr(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g,' ');

  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

  // YYYY-MM-DD
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  // DD Mon YYYY
  const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = months[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }

  // Try native Date parse as last resort
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return null;
}

// ── File reading helpers ───────────────────────────────────
function readFileText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsText(file, 'utf-8');
  });
}

function readFileBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}

// Very minimal XLS (BIFF8 .xls) / XLSX detection — extract CSV-like content
// For proper parsing we extract shared strings + rows from the XML in XLSX
async function parseXLS(file) {
  // If it's an XLSX (zip), extract as text with basic XML parsing
  if (file.name.endsWith('.xlsx')) {
    return parseXLSX(file);
  }
  // .xls: try reading as text (UOB sometimes exports as HTML table with .xls extension)
  const text = await readFileText(file);
  if (text.includes('<table') || text.includes('<TABLE')) {
    return parseHTMLTable(text);
  }
  // Fallback: try as CSV
  return parseUOBCSV(text);
}

async function parseXLSX(file) {
  const buf  = await readFileBuffer(file);
  const zip  = await unzipBuffer(buf);
  const sharedStrings = zip['xl/sharedStrings.xml'] ? parseSharedStrings(zip['xl/sharedStrings.xml']) : [];
  const sheetXML      = zip['xl/worksheets/sheet1.xml'] || Object.values(zip).find(v => typeof v === 'string' && v.includes('<sheetData'));
  if (!sheetXML) throw new Error('Cannot read XLSX sheet');
  const csvText = xlsxSheetToCSV(sheetXML, sharedStrings);
  return parseUOBCSV(csvText);
}

function parseSharedStrings(xml) {
  const arr = [];
  const re  = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) arr.push(m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
  return arr;
}

function xlsxSheetToCSV(xml, shared) {
  const rows = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\s([^>]*)>([\s\S]*?)<\/c>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const cells = {};
    let cellMatch;
    const rowXML = rowMatch[1];
    while ((cellMatch = cellRe.exec(rowXML)) !== null) {
      const attr = cellMatch[1];
      const inner = cellMatch[2];
      const rMatch = attr.match(/r="([A-Z]+)(\d+)"/);
      const tMatch = attr.match(/t="([^"]+)"/);
      if (!rMatch) continue;
      const col = rMatch[1];
      let val = '';
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (vMatch) {
        val = vMatch[1];
        if (tMatch && tMatch[1] === 's') val = shared[parseInt(val)] || '';
      }
      cells[col] = val;
    }
    if (Object.keys(cells).length) {
      const maxCol = Object.keys(cells).reduce((m, k) => k > m ? k : m, 'A');
      const row = [];
      for (let c = 'A'; c <= maxCol; c = nextCol(c)) row.push(cells[c] || '');
      rows.push(row.join(','));
    }
  }
  return rows.join('\n');
}

function nextCol(c) {
  if (c === 'Z') return 'AA';
  const last = c.charCodeAt(c.length - 1);
  return c.slice(0, -1) + String.fromCharCode(last + 1);
}

// Minimal unzip for XLSX (PK format)
async function unzipBuffer(buf) {
  const files = {};
  try {
    const ds = new DecompressionStream('deflate-raw');
    const view = new Uint8Array(buf);
    let offset = 0;
    while (offset < view.length - 4) {
      if (view[offset] !== 0x50 || view[offset+1] !== 0x4B || view[offset+2] !== 0x03 || view[offset+3] !== 0x04) { offset++; continue; }
      const compression = view[offset+8] | (view[offset+9] << 8);
      const compSize    = view[offset+18] | (view[offset+19]<<8) | (view[offset+20]<<16) | (view[offset+21]<<24);
      const nameLen     = view[offset+26] | (view[offset+27]<<8);
      const extraLen    = view[offset+28] | (view[offset+29]<<8);
      const name        = new TextDecoder().decode(view.slice(offset+30, offset+30+nameLen));
      const dataStart   = offset + 30 + nameLen + extraLen;
      const compressed  = view.slice(dataStart, dataStart + compSize);
      offset = dataStart + compSize;
      if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
      try {
        let text;
        if (compression === 0) {
          text = new TextDecoder().decode(compressed);
        } else {
          const ws  = new DecompressionStream('deflate-raw');
          const wr  = ws.writable.getWriter();
          const rd  = ws.readable.getReader();
          wr.write(compressed); wr.close();
          const chunks = []; let done = false;
          while (!done) { const {value, done: d} = await rd.read(); if (value) chunks.push(value); done = d; }
          const merged = new Uint8Array(chunks.reduce((a,c)=>a+c.length,0));
          let p = 0; for (const c of chunks) { merged.set(c, p); p += c.length; }
          text = new TextDecoder().decode(merged);
        }
        files[name] = text;
      } catch {}
    }
  } catch {}
  return files;
}

function parseHTMLTable(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const rows = div.querySelectorAll('tr');
  const csvLines = [];
  rows.forEach(r => {
    const cells = [...r.querySelectorAll('td,th')].map(c => '"' + c.textContent.trim().replace(/"/g,'""') + '"');
    if (cells.length) csvLines.push(cells.join(','));
  });
  return parseUOBCSV(csvLines.join('\n'));
}

// ── Parse & preview ────────────────────────────────────────
async function parseAndPreview() {
  parsed = [];
  if (source === 'tng') {
    const text = document.getElementById('tng-paste').value.trim();
    if (!text) { document.getElementById('tng-error').textContent = 'Please paste your TNG statement text first.'; return; }
    document.getElementById('tng-error').textContent = '';
    parsed = parseTNG(text);
    if (parsed.length === 0) {
      document.getElementById('tng-error').textContent = 'No transactions found. Make sure you copied the full PDF text.';
      return;
    }
  } else {
    const file = document.getElementById('uob-file').files[0];
    if (!file) { document.getElementById('uob-error').textContent = 'Please select a file first.'; return; }
    document.getElementById('uob-error').textContent = '';
    try {
      if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
        parsed = await parseXLS(file);
      } else {
        const text = await readFileText(file);
        parsed = parseUOBCSV(text);
      }
    } catch (e) {
      document.getElementById('uob-error').textContent = 'Could not read file: ' + e.message;
      return;
    }
    if (parsed.length === 0) {
      document.getElementById('uob-error').textContent = 'No transactions found. Check the file format matches UOB export.';
      return;
    }
  }

  buildPreview();
  goStep(3);
}

// ── Build preview table ────────────────────────────────────
const EXP_CAT_LIST = ['Food','Shopping','Health','Bills','Entertainment','Petrol','Car Service','Toll','Car Expenses','Transport','Other'];
const INC_CAT_LIST = ['Salary','Freelance','Business','Investment','Rental','Gift','Other'];

function buildPreview() {
  const tbody = document.getElementById('preview-body');
  tbody.innerHTML = '';

  parsed.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.id = `row-${idx}`;
    if (row.skip) tr.classList.add('skip');

    const catList = row.type === 'inc' ? INC_CAT_LIST : EXP_CAT_LIST;
    const catOpts = catList.map(c => `<option value="${c}" ${c === row.cat ? 'selected' : ''}>${c}</option>`).join('');

    tr.innerHTML = `
      <td style="white-space:nowrap">${row.date}</td>
      <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(row.desc)}">${escHtml(row.desc)}</td>
      <td class="${row.type==='exp'?'amt-debit':'amt-credit'}" style="white-space:nowrap">${row.type==='exp'?'−':'+'} ${row.amount.toFixed(2)}</td>
      <td>
        <div class="type-toggle">
          <button class="type-btn exp ${row.type==='exp'&&!row.skip?'active':''}" onclick="setType(${idx},'exp')">Exp</button>
          <button class="type-btn inc ${row.type==='inc'&&!row.skip?'active':''}" onclick="setType(${idx},'inc')">Inc</button>
          <button class="type-btn skip-btn ${row.skip?'active':''}" onclick="setType(${idx},'skip')">Skip</button>
        </div>
      </td>
      <td><select id="cat-${idx}" onchange="parsed[${idx}].cat=this.value">${catOpts}</select></td>`;
    tbody.appendChild(tr);
  });

  updateSummary();
}

function setType(idx, type) {
  if (type === 'skip') { parsed[idx].skip = true; }
  else { parsed[idx].skip = false; parsed[idx].type = type; }

  const tr = document.getElementById(`row-${idx}`);
  tr.classList.toggle('skip', parsed[idx].skip);
  tr.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  tr.querySelector(`.type-btn.${type === 'skip' ? 'skip-btn' : type}`).classList.add('active');

  // Update amount colour
  const amtTd = tr.querySelectorAll('td')[2];
  amtTd.className = parsed[idx].type === 'exp' ? 'amt-debit' : 'amt-credit';

  // Update category dropdown options
  const catList = parsed[idx].type === 'inc' ? INC_CAT_LIST : EXP_CAT_LIST;
  const sel = document.getElementById(`cat-${idx}`);
  sel.innerHTML = catList.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = catList.includes(parsed[idx].cat) ? parsed[idx].cat : catList[0];
  parsed[idx].cat = sel.value;

  updateSummary();
}

function updateSummary() {
  const active = parsed.filter(r => !r.skip);
  const exps   = active.filter(r => r.type === 'exp').reduce((a,r) => a + r.amount, 0);
  const incs   = active.filter(r => r.type === 'inc').reduce((a,r) => a + r.amount, 0);
  const skips  = parsed.filter(r => r.skip).length;

  document.getElementById('summary-bar').innerHTML = `
    <div class="sum-item"><div class="sum-label">Importing</div><div class="sum-val">${active.length} rows</div></div>
    <div class="sum-item"><div class="sum-label">Expenses</div><div class="sum-val red">RM ${exps.toFixed(2)}</div></div>
    <div class="sum-item"><div class="sum-label">Income</div><div class="sum-val green">RM ${incs.toFixed(2)}</div></div>
    <div class="sum-item"><div class="sum-label">Skipped</div><div class="sum-val">${skips}</div></div>`;
}

// ── Do import ──────────────────────────────────────────────
function doImport() {
  const toImport = parsed.filter(r => !r.skip);
  if (toImport.length === 0) { showToast('Nothing to import — all rows are skipped'); return; }

  chrome.storage.local.get(['expenses_v2', 'incomes_v1'], result => {
    const expenses = result['expenses_v2'] || [];
    const incomes  = result['incomes_v1']  || [];

    let addedExp = 0, addedInc = 0;
    toImport.forEach(r => {
      // Update category from select
      const sel = document.getElementById(`cat-${parsed.indexOf(r)}`);
      if (sel) r.cat = sel.value;

      const entry = { id: Date.now() + Math.random(), name: r.desc, amount: r.amount, cat: r.cat, date: r.date };
      if (r.type === 'exp') { expenses.push(entry); addedExp++; }
      else                  { incomes.push(entry);  addedInc++; }
    });

    chrome.storage.local.set({ 'expenses_v2': expenses, 'incomes_v1': incomes }, () => {
      document.getElementById('done-title').textContent = 'Import complete!';
      document.getElementById('done-sub').textContent   =
        `Added ${addedExp} expense${addedExp!==1?'s':''} and ${addedInc} income entry${addedInc!==1?'ies':'y'} to your tracker.`;
      goStep(4);
    });
  });
}

// ── Reset ──────────────────────────────────────────────────
function resetWizard() {
  source = null; parsed = [];
  document.getElementById('src-tng').classList.remove('selected');
  document.getElementById('src-uob').classList.remove('selected');
  document.getElementById('tng-paste').value = '';
  document.getElementById('uob-file').value  = '';
  document.getElementById('drop-label').textContent = 'Click to choose file';
  document.getElementById('btn-next1').disabled = true;
  goStep(1);
}

// ── File drop ──────────────────────────────────────────────
const drop = document.getElementById('uob-drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) { document.getElementById('uob-file').files; handleUOBFile(f); }
});
document.getElementById('uob-file').addEventListener('change', e => handleUOBFile(e.target.files[0]));

function handleUOBFile(f) {
  if (!f) return;
  document.getElementById('drop-label').textContent = '📄 ' + f.name;
  document.getElementById('uob-error').textContent = '';
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
