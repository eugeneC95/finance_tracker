/** Merchant / description matching for expense category suggestions. */

export function normMerchantKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 48);
}

/** True when `key` is the whole merchant string or a whole-word phrase inside it. */
export function merchantMatchesKey(name, key) {
  const n = normMerchantKey(name);
  const k = normMerchantKey(key);
  if (!n || !k) return false;
  if (n === k) return true;
  return (' ' + n + ' ').indexOf(' ' + k + ' ') !== -1;
}

export function suggestCatFromLearned(name, rulesMap) {
  const n = normMerchantKey(name);
  if (!n || !rulesMap) return null;
  if (rulesMap[n]) return rulesMap[n];
  let best = null;
  let bestLen = 0;
  Object.keys(rulesMap).forEach(function (k) {
    if (merchantMatchesKey(n, k) && k.length > bestLen) {
      best = rulesMap[k];
      bestLen = k.length;
    }
  });
  return best;
}

export function autocatFromKeywordRules(desc, rules) {
  const list = rules || [];
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const keys = r.keys || [];
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      if (!merchantMatchesKey(desc, key)) continue;
      const hit = normMerchantKey(key);
      if (!best || hit.length > best.hit.length) best = { cat: r.cat, hit };
    }
  }
  if (!best) return { cat: 'Other', confidence: 'low' };
  return { cat: best.cat, confidence: best.hit.length >= 6 ? 'high' : 'med' };
}

/** Import / statement auto-detect. Longer keys win; match is whole-word only. */
export const EXP_AUTO_CAT_RULES = [
  { cat: 'Petrol', keys: ['shell', 'petron', 'petronas', 'caltex', 'bhp', 'petrol', 'fuel', 'diesel'] },
  { cat: 'Car Service', keys: ['servis', 'workshop', 'autoserv', 'mechanic', 'spare part', 'tyre', 'tayar'] },
  { cat: 'Car Insurance', keys: ['car insurance', 'motor insurance', 'takaful motor'] },
  { cat: 'Toll', keys: ['plus highway', 'toll', 'lebuhraya'] },
  { cat: 'Parking', keys: ['parkir', 'parking', 'car park', 'parking fee', 'bayaran parkir', 'jom parking', 'flexi parking'] },
  { cat: 'Groceries', keys: ['jaya grocer', 'lotus', 'tesco', 'giant', 'aeon', '99 speedmart', 'mydin', 'econsave', 'cold storage', 'village grocer'] },
  { cat: 'Eating out', keys: ['mamak', 'kopitiam', 'food court', 'kfc', 'mcdonalds', 'mcdonald', 'burger king', 'pizza', 'nasi lemak', 'dim sum', 'sushi', 'grab food', 'grabfood', 'foodpanda', 'shopeefood'] },
  { cat: 'Ride-hailing', keys: ['grab ride', 'grabcar', 'grab car', 'ez cab', 'myteksi', 'airasia ride'] },
  { cat: 'Transport', keys: ['myrapid', 'rapidkl', 'lrt', 'mrt', 'ktm', 'komuter', 'teksi', 'taxi', 'uber'] },
  { cat: 'Coffee', keys: ['starbucks', 'coffee bean', 'zus coffee', 'gong cha', 'teh tarik', 'oldtown'] },
  { cat: 'Subscription', keys: ['netflix', 'spotify', 'apple music', 'apple tv', 'icloud', 'google play', 'youtube premium', 'disney', 'hbo', 'iflix'] },
  { cat: 'Food', keys: ['restaurant', 'cafe', 'makan', 'bakery', 'kitchen', 'bistro'] },
  { cat: 'Shopping', keys: ['shopee', 'lazada', 'zalora', 'uniqlo', 'padini', 'watsons', 'watson', 'guardian', 'sephora', 'ikea', 'harvey', 'courts'] },
  { cat: 'Internet', keys: ['unifi', 'time fibre', 'maxis home', 'celcom home'] },
  { cat: 'Phone', keys: ['maxis', 'celcom', 'digi', 'u mobile', 'hotlink', 'umobile'] },
  { cat: 'Bills', keys: ['telekom', 'tnb', 'air selangor', 'indah water', 'astro', 'myeg'] },
  { cat: 'Insurance', keys: ['insurance', 'takaful', 'great eastern', 'prudential', 'allianz', 'zurich', 'etiqa'] },
  { cat: 'Loan payment', keys: ['loan', 'pinjaman', 'hire purchase', 'ptptn'] },
  { cat: 'Pharmacy', keys: ['pharmacy', 'farmasi'] },
  { cat: 'Health', keys: ['klinik', 'clinic', 'hospital', 'dentist', 'doctor', 'medical'] },
  { cat: 'Hotel', keys: ['hotel', 'airbnb', 'booking com'] },
  { cat: 'Gifts', keys: ['gift', 'hadiah'] },
  { cat: 'Bank fees', keys: ['bank fee', 'annual fee', 'late fee', 'service charge'] },
  { cat: 'Salary', keys: ['salary', 'gaji', 'payroll', 'wages'] },
  { cat: 'Bonus', keys: ['bonus', 'incentive', 'allowance', 'elaun'] },
  { cat: 'Unit Trust', keys: ['unit trust', 'public mutual', 'amanah saham', 'asm', 'asb', 'pnb', 'manulife', 'principal'] },
  { cat: 'Dividend', keys: ['dividend', 'dividen'] },
  { cat: 'Investment', keys: ['kwsp', 'epf', 'bursa'] },
  { cat: 'Cashback', keys: ['cashback', 'rebate', 'cash reward'] },
];
