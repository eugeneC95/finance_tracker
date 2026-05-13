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
  { cat:'Toll',          keys:['plus highway','toll','lebuhraya','parkir','parking','car park'] },
  { cat:'Groceries',     keys:['jaya grocer','lotus','tesco','giant','aeon','99 speedmart','mydin','econsave','cold storage','village grocer'] },
  { cat:'Eating out',    keys:['mamak','kopitiam','food court','kfc','mcdonalds','mcd','burger king','pizza','nasi lemak','dim sum','sushi'] },
  { cat:'Grab',          keys:['grab food','grabfood','foodpanda','shopeefood','grab ride','grabcar'] },
  { cat:'Coffee',        keys:['starbucks','coffee bean','zus coffee','gong cha','teh tarik','oldtown'] },
  { cat:'Subscription',  keys:['netflix','spotify','apple','google play','youtube','disney','hbo','iflix','astro'] },
  { cat:'Food',          keys:['food','restaurant','cafe','makan','bakery','kitchen','bistro'] },
  { cat:'Shopping',      keys:['shopee','lazada','zalora','h&m','uniqlo','padini','watson','guardian','sephora','ikea','harvey','courts'] },
  { cat:'Internet',      keys:['unifi','time fibre','maxis home','celcom home'] },
  { cat:'Bills',         keys:['telekom','maxis','celcom','digi','u mobile','tnb','air selangor','indah water','astro'] },
  { cat:'Insurance',     keys:['insurance','takaful','aia','great eastern','prudential','allianz','zurich','etiqa'] },
  { cat:'Loan payment',  keys:['loan','pinjaman','hire purchase','ptptn'] },
  { cat:'Health',        keys:['klinik','clinic','hospital','pharmacy','farmasi','dentist','doctor','medical'] },
  { cat:'Transport',     keys:['myrapid','rapidkl','lrt','mrt','ktm','komuter','bus','teksi','taxi','uber','rapid'] },
  { cat:'Salary',        keys:['salary','gaji','payroll','wages'] },
  { cat:'Bonus',         keys:['bonus','incentive','allowance','elaun'] },
  { cat:'Unit Trust',    keys:['unit trust','public mutual','amanah saham','asm','asb','pnb','manulife','principal'] },
  { cat:'Dividend',      keys:['dividend','dividen'] },
  { cat:'Investment',    keys:['kwsp','epf','bursa','stock','share'] },
  { cat:'Cashback',      keys:['cashback','rebate','refund','cash reward'] },
  { cat:'Zakat',         keys:['zakat','fitrah','sedekah','derma','wakaf'] },
];
const EXP_LIST=Object.keys(typeof EXP_CATS!=='undefined'?EXP_CATS:{'Food':1,'Groceries':1,'Eating out':1,'Coffee':1,'Shopping':1,'Clothing':1,'Electronics':1,'Rent':1,'Utilities':1,'Internet':1,'Renovation':1,'Health':1,'Fitness':1,'Grooming':1,'Bills':1,'Insurance':1,'Loan payment':1,'Tax':1,'Petrol':1,'Car Service':1,'Toll':1,'Car Expenses':1,'Car Insurance':1,'Transport':1,'Grab':1,'Flight':1,'Entertainment':1,'Subscription':1,'Travel':1,'Hobbies':1,'Education':1,'Childcare':1,'Pet care':1,'Donation':1,'Zakat':1,'Other':1});
const INC_LIST=Object.keys(typeof INC_CATS!=='undefined'?INC_CATS:{'Salary':1,'Bonus':1,'Freelance':1,'Business':1,'Unit Trust':1,'Dividend':1,'Investment':1,'Rental':1,'Side income':1,'Cashback':1,'Gift':1,'Refund':1,'Other':1});
const INC_SET=new Set(['Salary','Bonus','Freelance','Business','Unit Trust','Dividend','Investment','Rental','Side income','Cashback','Gift','Refund']);

function iwAutocat(desc) {
  const low=desc.toLowerCase();
  for(const r of IW_CAT_RULES){ if(r.keys.some(k=>low.includes(k))) return r.cat; }
  return 'Other';
}

// ── State ──────────────────────────────────────────────────
let iwSource=null, iwRows=[];

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
    const cat=iwAutocat(desc), type=txAmt<0?(INC_SET.has(cat)?'inc':'exp'):'inc';
    rows.push({date:dateStr,desc,amount:Math.abs(txAmt),type,cat,skip:false});
  }
  return rows;
}

// ── UOB CSV parser ─────────────────────────────────────────
function iwParseCSVRow(line) {
  const r=[]; let c='',inQ=false;
  for(const ch of line){ if(ch==='"'){inQ=!inQ;continue;} if((ch===','||ch==='\t')&&!inQ){r.push(c);c='';continue;} c+=ch; }
  return [...r,c];
}
function iwParseUOB(text) {
  const rows=[], lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  let hi=0;
  for(let i=0;i<Math.min(20,lines.length);i++){
    const low=lines[i].toLowerCase();
    if((low.includes('date')||low.includes('tarikh'))&&(low.includes('desc')||low.includes('withdraw')||low.includes('debit')||low.includes('credit'))){hi=i;break;}
  }
  const hdrs=iwParseCSVRow(lines[hi]).map(h=>h.toLowerCase().trim());
  const di=hdrs.findIndex(h=>h.includes('date')||h.includes('tarikh'));
  const xi=hdrs.findIndex(h=>h.includes('desc')||h.includes('narrat')||h.includes('particular'));
  const dri=hdrs.findIndex(h=>h.includes('withdraw')||h.includes('debit')||h==='dr');
  const cri=hdrs.findIndex(h=>h.includes('deposit')||h.includes('credit')||h==='cr');
  const ai=hdrs.findIndex(h=>h.includes('amount')||h.includes('jumlah'));
  for(let i=hi+1;i<lines.length;i++){
    const cols=iwParseCSVRow(lines[i]); if(cols.length<3) continue;
    const dateStr=iwParseDateStr((cols[di>=0?di:0]||'').trim()); if(!dateStr) continue;
    const desc=(cols[xi>=0?xi:1]||'').replace(/"/g,'').trim(); if(!desc) continue;
    let amount=0,type='exp';
    if(dri>=0&&cols[dri]&&parseFloat(cols[dri].replace(/[^0-9.]/g,''))>0){amount=parseFloat(cols[dri].replace(/[^0-9.]/g,''));type='exp';}
    else if(cri>=0&&cols[cri]&&parseFloat(cols[cri].replace(/[^0-9.]/g,''))>0){amount=parseFloat(cols[cri].replace(/[^0-9.]/g,''));type='inc';}
    else if(ai>=0){const raw=(cols[ai]||'').replace(/[^0-9.\-]/g,'');amount=Math.abs(parseFloat(raw));type=parseFloat(raw)<0?'exp':'inc';}
    if(!amount||isNaN(amount)) continue;
    const cat=iwAutocat(desc); if(type==='exp'&&INC_SET.has(cat))type='inc';
    rows.push({date:dateStr,desc,amount,type,cat,skip:false});
  }
  return rows;
}

// ── Build review table ─────────────────────────────────────
function iwBuildTable() {
  const tbody=document.getElementById('iw-tbody'); tbody.innerHTML='';
  iwRows.forEach((row,idx)=>{
    const catList=row.type==='inc'?INC_LIST:EXP_LIST;
    const opts=catList.map(c=>`<option value="${c}"${c===row.cat?' selected':''}>${c}</option>`).join('');
    const tr=document.createElement('tr'); tr.id=`iwr${idx}`;
    if(row.skip) tr.classList.add('skipped');
    tr.innerHTML=`
      <td style="white-space:nowrap">${row.date}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${row.desc}">${row.desc}</td>
      <td style="text-align:right;font-weight:700;color:${row.type==='exp'?'var(--red)':'var(--green)'};white-space:nowrap">${row.type==='exp'?'−':'+'}${row.amount.toFixed(2)}</td>
      <td><div class="type-btns">
        <button class="type-btn exp${row.type==='exp'&&!row.skip?' on':''}" data-idx="${idx}" data-type="exp">Exp</button>
        <button class="type-btn inc${row.type==='inc'&&!row.skip?' on':''}" data-idx="${idx}" data-type="inc">Inc</button>
        <button class="type-btn skip${row.skip?' on':''}" data-idx="${idx}" data-type="skip">Skip</button>
      </div></td>
      <td><select data-idx="${idx}" class="iw-cat-sel">${opts}</select></td>`;
    tbody.appendChild(tr);
  });

  // Attach type button listeners (NO inline onclick)
  document.querySelectorAll('.type-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const idx=Number(btn.dataset.idx), type=btn.dataset.type;
      if(type==='skip'){ iwRows[idx].skip=true; }
      else { iwRows[idx].skip=false; iwRows[idx].type=type; }
      // update cat dropdown options for new type
      const catList=iwRows[idx].type==='inc'?INC_LIST:EXP_LIST;
      const sel=document.querySelector(`.iw-cat-sel[data-idx="${idx}"]`);
      sel.innerHTML=catList.map(c=>`<option value="${c}">${c}</option>`).join('');
      sel.value=catList.includes(iwRows[idx].cat)?iwRows[idx].cat:catList[0];
      iwRows[idx].cat=sel.value;
      iwBuildTable(); // re-render to update styles
      iwUpdateSummary();
    });
  });

  // Category select listeners
  document.querySelectorAll('.iw-cat-sel').forEach(sel=>{
    sel.addEventListener('change',()=>{ iwRows[Number(sel.dataset.idx)].cat=sel.value; });
  });

  iwUpdateSummary();
}

function iwUpdateSummary() {
  const active=iwRows.filter(r=>!r.skip);
  const exps=active.filter(r=>r.type==='exp').reduce((a,r)=>a+r.amount,0);
  const incs=active.filter(r=>r.type==='inc').reduce((a,r)=>a+r.amount,0);
  document.getElementById('iw-summary').innerHTML=`
    <div class="iw-sum-card"><div class="isl">Importing</div><div class="isv">${active.length}</div></div>
    <div class="iw-sum-card"><div class="isl">Expenses</div><div class="isv red">RM ${exps.toFixed(2)}</div></div>
    <div class="iw-sum-card"><div class="isl">Income</div><div class="isv green">RM ${incs.toFixed(2)}</div></div>
    <div class="iw-sum-card"><div class="isl">Skipped</div><div class="isv">${iwRows.filter(r=>r.skip).length}</div></div>`;
}

// ── Step navigation ────────────────────────────────────────
function iwGoStep(n) {
  iwHide('iw1'); iwHide('iw2'); iwHide('iw3'); iwHide('iw4');
  iwShow('iw'+n);
}

function iwReset() {
  iwSource=null; iwRows=[];
  document.getElementById('iw-tng-card').classList.remove('active');
  document.getElementById('iw-uob-card').classList.remove('active');
  document.getElementById('iw-next1').disabled=true;
  document.getElementById('iw-tng-input').style.display='none';
  document.getElementById('iw-uob-input').style.display='none';
  if(document.getElementById('iw-tng-text')) document.getElementById('iw-tng-text').value='';
  const fe=document.getElementById('iw-file'); if(fe) fe.value='';
  document.getElementById('iw-drop-lbl').textContent='Click or drag & drop your file';
  document.getElementById('iw-tng-err').textContent='';
  document.getElementById('iw-uob-err').textContent='';
  iwGoStep(1);
}

// ── Wire up source cards ───────────────────────────────────
function iwSelectSource(src) {
  iwSource=src;
  document.getElementById('iw-tng-card').classList.toggle('active',src==='tng');
  document.getElementById('iw-uob-card').classList.toggle('active',src==='uob');
  document.getElementById('iw-next1').disabled=false;
  document.getElementById('iw-tng-input').style.display=src==='tng'?'':'none';
  document.getElementById('iw-uob-input').style.display=src==='uob'?'':'none';
}

document.getElementById('iw-tng-card').addEventListener('click',()=>iwSelectSource('tng'));
document.getElementById('iw-uob-card').addEventListener('click',()=>iwSelectSource('uob'));
document.getElementById('iw-next1').addEventListener('click',()=>{ if(iwSource) iwGoStep(2); });
document.getElementById('iw-back2').addEventListener('click',()=>iwGoStep(1));
document.getElementById('iw-back3').addEventListener('click',iwReset);
document.getElementById('iw-again').addEventListener('click',iwReset);

// ── Parse button ───────────────────────────────────────────
document.getElementById('iw-parse').addEventListener('click',async()=>{
  iwRows=[];
  if(iwSource==='tng'){
    const text=document.getElementById('iw-tng-text').value.trim();
    if(!text){ document.getElementById('iw-tng-err').textContent='Please paste your TNG statement text first.'; return; }
    document.getElementById('iw-tng-err').textContent='';
    iwRows=iwParseTNG(text);
    if(!iwRows.length){ document.getElementById('iw-tng-err').textContent='No transactions found — make sure you copied the full PDF text.'; return; }
  } else {
    const file=document.getElementById('iw-file').files[0];
    if(!file){ document.getElementById('iw-uob-err').textContent='Please select a file first.'; return; }
    document.getElementById('iw-uob-err').textContent='';
    try {
      const text=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsText(file,'utf-8'); });
      iwRows=iwParseUOB(text);
    } catch(e){ document.getElementById('iw-uob-err').textContent='Could not read file: '+e.message; return; }
    if(!iwRows.length){ document.getElementById('iw-uob-err').textContent='No transactions found — check the file is a UOB CSV/Excel export.'; return; }
  }
  // Duplicate detection
  if (typeof deduplicateImportRows === 'function') {
    const dupes = deduplicateImportRows(iwRows);
    if (dupes > 0) showToast(`⚠️ ${dupes} duplicate${dupes>1?'s':''} detected and pre-skipped`);
  }
  iwBuildTable();
  iwGoStep(3);
});

// ── Import button ──────────────────────────────────────────
document.getElementById('iw-import').addEventListener('click',()=>{
  var st = importWalletStorage();
  if (!st) { showToast('Import unavailable — storage not ready'); return; }
  const toAdd=iwRows.filter(r=>!r.skip);
  if(!toAdd.length){ alert('Nothing to import — all rows are skipped.'); return; }
  st.local.get(['expenses_v2','incomes_v1'],result=>{
    const exps=result['expenses_v2']||[], incs=result['incomes_v1']||[];
    let ae=0,ai=0;
    toAdd.forEach(r=>{
      // pick latest cat from select in case user changed it
      const sel=document.querySelector(`.iw-cat-sel[data-idx="${iwRows.indexOf(r)}"]`);
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
