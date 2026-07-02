'use strict';

// PWA uses chromeStorage (localStorage) from app.js; Chrome extension uses chrome.storage.
function importWalletStorage() {
  if (typeof chromeStorage !== 'undefined' && chromeStorage && chromeStorage.local) return chromeStorage;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage;
  return null;
}

// ── Category rules for auto-detection ─────────────────────
const IW_CAT_RULES = [
  { cat:'Petrol',        keys:['shell','petron','petronas','caltex','bhp','petrol','fuel','diesel'] },
  { cat:'Car Service',   keys:['servis','workshop','autoserv','mechanic','spare part','tyre','tayar','brake','myeg'] },
  { cat:'Car Insurance', keys:['car insurance','motor insurance','takaful motor'] },
  { cat:'Toll',          keys:['plus highway','toll','lebuhraya'] },
  { cat:'Parking',       keys:['parkir','parking','car park','parking fee','bayaran parkir','jom parking','flexi parking'] },
  { cat:'Groceries',     keys:['jaya grocer','lotus','tesco','giant','aeon','99 speedmart','mydin','econsave','cold storage','village grocer'] },
  { cat:'Eating out',    keys:['mamak','kopitiam','food court','kfc','mcdonalds','mcd','burger king','pizza','nasi lemak','dim sum','sushi','grab food','grabfood','foodpanda','shopeefood'] },
  { cat:'Transport',     keys:['grab ride','grabcar','grab car','ez cab','myteksi','in driver','airasia ride','myrapid','rapidkl','lrt','mrt','ktm','komuter','bus','teksi','taxi','uber','rapid'] },
  { cat:'Coffee',        keys:['starbucks','coffee bean','zus coffee','gong cha','teh tarik','oldtown'] },
  { cat:'Subscription',  keys:['netflix','spotify','apple','google play','youtube','disney','hbo','iflix','astro'] },
  { cat:'Food',          keys:['food','restaurant','cafe','makan','bakery','kitchen','bistro'] },
  { cat:'Shopping',      keys:['shopee','lazada','zalora','h&m','uniqlo','padini','watson','guardian','sephora','ikea','harvey','courts'] },
  { cat:'Internet',      keys:['unifi','time fibre','maxis home','celcom home'] },
  { cat:'Bills',         keys:['telekom','maxis','celcom','digi','u mobile','tnb','air selangor','indah water','astro'] },
  { cat:'Insurance',     keys:['insurance','takaful','aia','great eastern','prudential','allianz','zurich','etiqa'] },
  { cat:'Loan payment',  keys:['loan','pinjaman','hire purchase','ptptn'] },
  { cat:'Health',        keys:['klinik','clinic','hospital','pharmacy','farmasi','dentist','doctor','medical'] },
  { cat:'Salary',        keys:['salary','gaji','payroll','wages'] },
  { cat:'Bonus',         keys:['bonus','incentive','allowance','elaun'] },
  { cat:'Unit Trust',    keys:['unit trust','public mutual','amanah saham','asm','asb','pnb','manulife','principal'] },
  { cat:'Dividend',      keys:['dividend','dividen'] },
  { cat:'Investment',    keys:['kwsp','epf','bursa','stock','share'] },
  { cat:'Cashback',      keys:['cashback','rebate','refund','cash reward'] },
];
const EXP_LIST=Object.keys(typeof EXP_CATS!=='undefined'?EXP_CATS:{'Food':1,'Groceries':1,'Eating out':1,'Coffee':1,'Shopping':1,'Clothing':1,'Electronics':1,'Rent':1,'Utilities':1,'Internet':1,'Renovation':1,'Health':1,'Fitness':1,'Grooming':1,'Bills':1,'Insurance':1,'Loan payment':1,'Tax':1,'Petrol':1,'Car Service':1,'Toll':1,'Parking':1,'Car Expenses':1,'Car Insurance':1,'Transport':1,'Flight':1,'Entertainment':1,'Subscription':1,'Travel':1,'Hobbies':1,'Education':1,'Pet care':1,'Other':1});
const INC_LIST=Object.keys(typeof INC_CATS!=='undefined'?INC_CATS:{'Salary':1,'Bonus':1,'Freelance':1,'Business':1,'Unit Trust':1,'Dividend':1,'Investment':1,'Rental':1,'Side income':1,'Cashback':1,'Gift':1,'Refund':1,'Other':1});
const INC_SET=new Set(['Salary','Bonus','Freelance','Business','Unit Trust','Dividend','Investment','Rental','Side income','Cashback','Gift','Refund']);

function iwAutocat(desc) {
  const low=desc.toLowerCase();
  for(const r of IW_CAT_RULES){ if(r.keys.some(k=>low.includes(k))) return r.cat; }
  return 'Other';
}
function iwAutocatMeta(desc) {
  const low = String(desc || '').toLowerCase();
  let best = null;
  for (const r of IW_CAT_RULES) {
    const hit = r.keys.find(k => low.includes(k));
    if (hit) {
      if (!best || hit.length > best.hit.length) best = { cat: r.cat, hit };
    }
  }
  if (!best) return { cat: 'Other', confidence: 'low' };
  return { cat: best.cat, confidence: best.hit.length >= 6 ? 'high' : 'med' };
}

// ── State ──────────────────────────────────────────────────
let iwSource=null, iwRows=[], iwDryRun={ add:0, overwrite:0, dupes:0 };

// ── Helpers ────────────────────────────────────────────────
function iwShow(id){ document.getElementById(id).style.display=''; }
function iwHide(id){ document.getElementById(id).style.display='none'; }

function iwParseDateStr(raw) {
  if(!raw) return null;
  const s=raw.trim().replace(/\s+/g,' ');
  let m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const mo={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  m=s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/i);
  if(m&&mo[m[2].toLowerCase()]) return `${m[3]}-${mo[m[2].toLowerCase()]}-${m[1].padStart(2,'0')}`;
  const d=new Date(s);
  if(!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return null;
}

// ── TNG parser ─────────────────────────────────────────────
function iwParseTNG(text) {
  const rows=[], lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const dateRe=/^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i;
  const amtRe=/[-+]?RM\s*[\d,]+\.?\d{0,2}|[-+][\d,]+\.\d{2}/gi;
  for(let i=0;i<lines.length;i++){
    const line=lines[i], dm=line.match(dateRe); if(!dm) continue;
    const full=line+' '+(lines[i+1]||'')+' '+(lines[i+2]||'');
    const amts=full.match(amtRe); if(!amts) continue;
    const amounts=amts.map(a=>parseFloat(a.replace(/RM|,|\s/g,''))).filter(n=>!isNaN(n));
    const txAmt=amounts.find(a=>a<0)??amounts[0]; if(!txAmt||txAmt===0) continue;
    const dateStr=iwParseDateStr(dm[0]); if(!dateStr) continue;
    const afterDate=full.slice(dm[0].length).trim();
    const fi=afterDate.search(/[-+]?RM\s*[\d,]|[-+]\d+\.\d{2}/i);
    let desc=(fi>0?afterDate.slice(0,fi):afterDate.slice(0,60)).replace(/\s{2,}/g,' ').replace(/Successful|Failed|Pending/gi,'').trim();
    const meta=iwAutocatMeta(desc), cat=meta.cat, type=txAmt<0?(INC_SET.has(cat)?'inc':'exp'):'inc';
    rows.push({date:dateStr,desc,amount:Math.abs(txAmt),type,cat,skip:false,confidence:meta.confidence});
  }
  return rows;
}

// ── UOB CSV parser ─────────────────────────────────────────
function iwParseCSVRow(line) {
  const r=[]; let c='',inQ=false;
  for(const ch of line){ if(ch==='"'){inQ=!inQ;continue;} if((ch===','||ch==='\t')&&!inQ){r.push(c);c='';continue;} c+=ch; }
  return [...r,c];
}
function iwParseBankCSV(text) {
  const rows=[], lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  let hi=0;
  for(let i=0;i<Math.min(25,lines.length);i++){
    const low=lines[i].toLowerCase();
    const hasDate=low.includes('date')||low.includes('tarikh')||low.includes('posting')||low.includes('value date');
    const hasDesc=low.includes('desc')||low.includes('narrat')||low.includes('particular')||low.includes('transaction')||low.includes('detail')||low.includes('remark')||low.includes('reference');
    const hasAmt=low.includes('withdraw')||low.includes('debit')||low.includes('credit')||low.includes('deposit')||low.includes('amount')||low.includes('jumlah')||low==='dr'||low==='cr'||low.includes('keluar')||low.includes('masuk');
    if(hasDate&&hasDesc&&hasAmt){hi=i;break;}
  }
  const hdrs=iwParseCSVRow(lines[hi]).map(h=>h.toLowerCase().trim());
  const di=hdrs.findIndex(h=>h.includes('date')||h.includes('tarikh')||h.includes('posting')||h.includes('value'));
  const xi=hdrs.findIndex(h=>/desc|narrat|particular|transaction|detail|remark/.test(h));
  const dri=hdrs.findIndex(h=>h.includes('withdraw')||h.includes('debit')||h==='dr'||h.includes('keluar')||h.includes('money out'));
  const cri=hdrs.findIndex(h=>h.includes('deposit')||h.includes('credit')||h==='cr'||h.includes('masuk')||h.includes('money in'));
  const ai=hdrs.findIndex(h=>h.includes('amount')||h.includes('jumlah')||h.includes('transaction amount'));
  for(let i=hi+1;i<lines.length;i++){
    const cols=iwParseCSVRow(lines[i]); if(cols.length<3) continue;
    const dateStr=iwParseDateStr((cols[di>=0?di:0]||'').trim()); if(!dateStr) continue;
    const desc=(cols[xi>=0?xi:1]||'').replace(/"/g,'').trim(); if(!desc) continue;
    let amount=0,type='exp';
    if(dri>=0&&cols[dri]&&parseFloat(cols[dri].replace(/[^0-9.]/g,''))>0){amount=parseFloat(cols[dri].replace(/[^0-9.]/g,''));type='exp';}
    else if(cri>=0&&cols[cri]&&parseFloat(cols[cri].replace(/[^0-9.]/g,''))>0){amount=parseFloat(cols[cri].replace(/[^0-9.]/g,''));type='inc';}
    else if(ai>=0){const raw=(cols[ai]||'').replace(/[^0-9.\-]/g,'');amount=Math.abs(parseFloat(raw));type=parseFloat(raw)<0?'exp':'inc';}
    if(!amount||isNaN(amount)) continue;
    const meta=iwAutocatMeta(desc), cat=meta.cat; if(type==='exp'&&INC_SET.has(cat))type='inc';
    rows.push({date:dateStr,desc,amount,type,cat,skip:false,confidence:meta.confidence});
  }
  return rows;
}
function iwParseUOB(text) { return iwParseBankCSV(text); }

function iwAssignRowIds() {
  iwRows.forEach((row, i) => {
    row.idx = i;
    if (row.selected === undefined) row.selected = !row.skip;
    if (row.skip) row.selected = false;
  });
}

function iwSetAllSelected(on) {
  iwRows.forEach((row) => {
    if (row.skip) return;
    row.selected = !!on;
  });
  iwBuildTable();
}

// ── Build review table ─────────────────────────────────────
function iwBuildTable() {
  const tbody=document.getElementById('iw-tbody'); tbody.innerHTML='';
  iwRows.forEach((row)=>{
    const idx=row.idx;
    const catList=row.type==='inc'?INC_LIST:EXP_LIST;
    const opts=catList.map(c=>`<option value="${c}"${c===row.cat?' selected':''}>${c}</option>`).join('');
    const tr=document.createElement('tr'); tr.id=`iwr${idx}`;
    if(row.skip) tr.classList.add('skipped');
    if(!row.selected) tr.classList.add('unselected');
    const checked=row.selected&&!row.skip;
    tr.innerHTML=`
      <td><input type="checkbox" class="iw-row-cb" data-idx="${idx}" ${checked?'checked':''} ${row.skip?'disabled':''} aria-label="Import row"></td>
      <td style="white-space:nowrap">${row.date}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${row.desc}">${row.desc}<div style="font-size:11px;color:var(--ink3)">${row.confidence==='high'?'High':row.confidence==='med'?'Medium':'Low'} confidence</div></td>
      <td style="text-align:right;font-weight:700;color:${row.type==='exp'?'var(--red)':'var(--green)'};white-space:nowrap">${row.type==='exp'?'':'+'}${row.amount.toFixed(2)}</td>
      <td><div class="type-btns">
        <button class="type-btn exp${row.type==='exp'&&!row.skip?' on':''}" data-idx="${idx}" data-type="exp">Exp</button>
        <button class="type-btn inc${row.type==='inc'&&!row.skip?' on':''}" data-idx="${idx}" data-type="inc">Inc</button>
        <button class="type-btn skip${row.skip?' on':''}" data-idx="${idx}" data-type="skip">Skip</button>
      </div></td>
      <td><select data-idx="${idx}" class="iw-cat-sel">${opts}</select></td>`;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.iw-row-cb').forEach(cb=>{
    cb.addEventListener('change',()=>{
      const idx=Number(cb.dataset.idx);
      iwRows[idx].selected=cb.checked;
      iwBuildTable();
      iwUpdateSummary();
    });
  });

  document.querySelectorAll('.type-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const idx=Number(btn.dataset.idx), type=btn.dataset.type;
      if(type==='skip'){ iwRows[idx].skip=true; iwRows[idx].selected=false; }
      else { iwRows[idx].skip=false; iwRows[idx].type=type; iwRows[idx].selected=true; }
      const catList=iwRows[idx].type==='inc'?INC_LIST:EXP_LIST;
      const sel=document.querySelector(`.iw-cat-sel[data-idx="${idx}"]`);
      sel.innerHTML=catList.map(c=>`<option value="${c}">${c}</option>`).join('');
      sel.value=catList.includes(iwRows[idx].cat)?iwRows[idx].cat:catList[0];
      iwRows[idx].cat=sel.value;
      iwBuildTable();
      iwUpdateSummary();
    });
  });

  document.querySelectorAll('.iw-cat-sel').forEach(sel=>{
    sel.addEventListener('change',()=>{ iwRows[Number(sel.dataset.idx)].cat=sel.value; });
  });

  iwUpdateSummary();
}

function iwUpdateSummary() {
  const active=iwRows.filter(r=>!r.skip&&r.selected);
  const exps=active.filter(r=>r.type==='exp').reduce((a,r)=>a+r.amount,0);
  const incs=active.filter(r=>r.type==='inc').reduce((a,r)=>a+r.amount,0);
  document.getElementById('iw-summary').innerHTML=`
    <div class="iw-sum-card"><div class="isl">Importing</div><div class="isv">${active.length}</div></div>
    <div class="iw-sum-card"><div class="isl">Expenses</div><div class="isv red">RM ${exps.toFixed(2)}</div></div>
    <div class="iw-sum-card"><div class="isl">Income</div><div class="isv green">RM ${incs.toFixed(2)}</div></div>
    <div class="iw-sum-card"><div class="isl">Skipped</div><div class="isv">${iwRows.filter(r=>r.skip).length}</div></div>
    <div class="iw-sum-card"><div class="isl">Will add</div><div class="isv">${iwDryRun.add||0}</div></div>
    <div class="iw-sum-card"><div class="isl">Possible dupes</div><div class="isv">${(iwDryRun.dupes||0)+(iwDryRun.overwrite||0)}</div></div>`;
}

// ── Step navigation ────────────────────────────────────────
function iwUpdateStepper(n) {
  var steps = document.querySelectorAll('#iw-steps .iw-step');
  if (!steps.length) return;
  steps.forEach(function(el) {
    var s = parseInt(el.getAttribute('data-step'), 10);
    el.classList.remove('iw-step--on', 'iw-step--done');
    if (s < n) el.classList.add('iw-step--done');
    else if (s === n) el.classList.add('iw-step--on');
  });
}

function iwGoStep(n) {
  iwHide('iw1'); iwHide('iw2'); iwHide('iw3'); iwHide('iw4');
  iwShow('iw'+n);
  iwUpdateStepper(n);
}

function iwReset() {
  iwSource=null; iwRows=[];
  document.getElementById('iw-tng-card').classList.remove('active');
  document.getElementById('iw-uob-card').classList.remove('active');
  const mbbCard=document.getElementById('iw-mbb-card');
  if(mbbCard) mbbCard.classList.remove('active');
  const cimbCard=document.getElementById('iw-cimb-card');
  if(cimbCard) cimbCard.classList.remove('active');
  const bankCard=document.getElementById('iw-bank-card');
  if(bankCard) bankCard.classList.remove('active');
  document.getElementById('iw-next1').disabled=true;
  document.getElementById('iw-tng-input').style.display='none';
  document.getElementById('iw-csv-input').style.display='none';
  const helpUob=document.getElementById('iw-help-uob');
  const helpMbb=document.getElementById('iw-help-mbb');
  if(helpUob) helpUob.style.display='none';
  if(helpMbb) helpMbb.style.display='none';
  if(document.getElementById('iw-tng-text')) document.getElementById('iw-tng-text').value='';
  const fe=document.getElementById('iw-file'); if(fe) fe.value='';
  document.getElementById('iw-drop-lbl').textContent='Drop file or tap to choose';
  document.getElementById('iw-tng-err').textContent='';
  const csvErr=document.getElementById('iw-csv-err');
  if(csvErr) csvErr.textContent='';
  iwGoStep(1);
}

// ── Wire up source cards ───────────────────────────────────
function iwSelectSource(src) {
  iwSource=src;
  document.getElementById('iw-tng-card').classList.toggle('active',src==='tng');
  document.getElementById('iw-uob-card').classList.toggle('active',src==='uob');
  const mbbCard=document.getElementById('iw-mbb-card');
  if(mbbCard) mbbCard.classList.toggle('active',src==='mbb');
  const cimbCard=document.getElementById('iw-cimb-card');
  if(cimbCard) cimbCard.classList.toggle('active',src==='cimb');
  const bankCard=document.getElementById('iw-bank-card');
  if(bankCard) bankCard.classList.toggle('active',src==='bank');
  document.getElementById('iw-next1').disabled=false;
  document.getElementById('iw-tng-input').style.display=src==='tng'?'':'none';
  const csvOn=src==='uob'||src==='mbb'||src==='cimb'||src==='bank';
  document.getElementById('iw-csv-input').style.display=csvOn?'':'none';
  const helpUob=document.getElementById('iw-help-uob');
  const helpMbb=document.getElementById('iw-help-mbb');
  if(helpUob) helpUob.style.display=src==='uob'?'':'none';
  if(helpMbb) helpMbb.style.display=(src==='mbb'||src==='cimb'||src==='bank')?'':'none';
}

// ── Wire up source cards (lazy-loaded via main.js) ─────────
function initImportWizard_() {
  if (globalThis.__iwInited) return;
  globalThis.__iwInited = true;

document.getElementById('iw-tng-card').addEventListener('click',()=>iwSelectSource('tng'));
document.getElementById('iw-uob-card').addEventListener('click',()=>iwSelectSource('uob'));
const iwMbbCard=document.getElementById('iw-mbb-card');
if(iwMbbCard) iwMbbCard.addEventListener('click',()=>iwSelectSource('mbb'));
const iwCimbCard=document.getElementById('iw-cimb-card');
if(iwCimbCard) iwCimbCard.addEventListener('click',()=>iwSelectSource('cimb'));
const iwBankCard=document.getElementById('iw-bank-card');
if(iwBankCard) iwBankCard.addEventListener('click',()=>iwSelectSource('bank'));
document.getElementById('iw-next1').addEventListener('click',()=>{ if(iwSource) iwGoStep(2); });
document.getElementById('iw-back2').addEventListener('click',()=>iwGoStep(1));
document.getElementById('iw-back3').addEventListener('click',iwReset);
document.getElementById('iw-again').addEventListener('click',iwReset);
const iwSelAll=document.getElementById('iw-select-all');
const iwSelNone=document.getElementById('iw-select-none');
if(iwSelAll) iwSelAll.addEventListener('click',()=>iwSetAllSelected(true));
if(iwSelNone) iwSelNone.addEventListener('click',()=>iwSetAllSelected(false));

// ── Parse button ───────────────────────────────────────────
document.getElementById('iw-parse').addEventListener('click',async()=>{
  iwRows=[];
  if(iwSource==='tng'){
    const text=document.getElementById('iw-tng-text').value.trim();
    if(!text){ document.getElementById('iw-tng-err').textContent='Please paste your TNG statement text first.'; return; }
    document.getElementById('iw-tng-err').textContent='';
    iwRows=iwParseTNG(text);
    if(!iwRows.length){ document.getElementById('iw-tng-err').textContent='No transactions found — make sure you copied the full PDF text.'; return; }
  } else if(iwSource==='uob'||iwSource==='mbb'||iwSource==='cimb'||iwSource==='bank'){
    const file=document.getElementById('iw-file').files[0];
    const errEl=document.getElementById('iw-csv-err');
    if(!file){ if(errEl) errEl.textContent='Please select a file first.'; return; }
    if(errEl) errEl.textContent='';
    try {
      const text=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsText(file,'utf-8'); });
      iwRows=iwParseBankCSV(text);
    } catch(e){ if(errEl) errEl.textContent='Could not read file: '+e.message; return; }
    if(!iwRows.length){
      if(errEl) errEl.textContent='No transactions found — use a CSV export from UOB, Maybank, or CIMB (date, description, debit/credit columns).';
      return;
    }
  }
  // Duplicate detection
  if (typeof deduplicateImportRows === 'function') {
    const dupes = deduplicateImportRows(iwRows);
    if (dupes > 0) showToast(`⚠️ ${dupes} duplicate${dupes>1?'s':''} detected and pre-skipped`);
  }
  iwAssignRowIds();
  var st = importWalletStorage();
  if (st && st.local) {
    st.local.get(['expenses_v2','incomes_v1'], function(result) {
      const exps = result['expenses_v2'] || [];
      const incs = result['incomes_v1'] || [];
      var dupes = 0;
      iwRows.forEach(function(r) {
        var pool = r.type === 'inc' ? incs : exps;
        var hit = pool.some(function(p) {
          return String(p.date).slice(0,10) === String(r.date).slice(0,10) &&
            Math.abs(Number(p.amount || 0) - Number(r.amount || 0)) < 0.01 &&
            String(p.name || '').toLowerCase().trim() === String(r.desc || '').toLowerCase().trim();
        });
        if (hit) dupes++;
      });
      iwDryRun = { add: Math.max(0, iwRows.length - dupes), overwrite: 0, dupes: dupes };
      iwBuildTable();
      iwGoStep(3);
    });
  } else {
    iwDryRun = { add: iwRows.length, overwrite: 0, dupes: 0 };
    iwBuildTable();
    iwGoStep(3);
  }
});

// ── Import button ──────────────────────────────────────────
document.getElementById('iw-import').addEventListener('click',()=>{
  var st = importWalletStorage();
  if (!st) { showToast('Import unavailable — storage not ready'); return; }
  const toAdd=iwRows.filter(r=>!r.skip&&r.selected);
  if(!toAdd.length){ alert('Nothing to import — select at least one row.'); return; }
  st.local.get(['expenses_v2','incomes_v1'],result=>{
    const exps=result['expenses_v2']||[], incs=result['incomes_v1']||[];
    let ae=0,ai=0;
    toAdd.forEach(r=>{
      // pick latest cat from select in case user changed it
      const sel=document.querySelector(`.iw-cat-sel[data-idx="${r.idx}"]`);
      if(sel) r.cat=sel.value;
      const entry={id:Date.now()+Math.random(),name:r.desc,amount:r.amount,cat:r.cat,date:r.date};
      if(r.type==='exp'){exps.push(entry);ae++;}else{incs.push(entry);ai++;}
    });
    st.local.set({'expenses_v2':exps,'incomes_v1':incs},()=>{
      if(typeof load==='function') load();
      document.getElementById('iw-done-h').textContent='Import complete!';
      document.getElementById('iw-done-sub').textContent=`Added ${ae} expense${ae!==1?'s':''} and ${ai} income entr${ai!==1?'ies':'y'} to your tracker.`;
      iwGoStep(4);
    });
  });
});

// ── File drop ──────────────────────────────────────────────
const iwDrop=document.getElementById('iw-drop');
iwDrop.addEventListener('dragover',e=>{ e.preventDefault(); iwDrop.classList.add('over'); });
iwDrop.addEventListener('dragleave',()=>iwDrop.classList.remove('over'));
iwDrop.addEventListener('drop',e=>{
  e.preventDefault(); iwDrop.classList.remove('over');
  const f=e.dataTransfer.files[0];
  if(f){
    const dt=new DataTransfer(); dt.items.add(f);
    document.getElementById('iw-file').files=dt.files;
    document.getElementById('iw-drop-lbl').textContent='📄 '+f.name;
  }
});
document.getElementById('iw-drop').addEventListener('click',()=>document.getElementById('iw-file').click());
document.getElementById('iw-file').addEventListener('change',e=>{
  if(e.target.files[0]) document.getElementById('iw-drop-lbl').textContent='📄 '+e.target.files[0].name;
});
}

globalThis.initImportWizard_ = initImportWizard_;
