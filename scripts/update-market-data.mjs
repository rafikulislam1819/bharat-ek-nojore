// Zero-dependency Node 20 script to fetch live USD/INR, international spot Gold/Silver,
// calculate Indian retail bullion rates (with customs duty + 3% GST), and push to Firebase RTDB.

const DB_URL = (process.env.FIREBASE_DB_URL || 'https://bharat-ak-nojore-default-rtdb.firebaseio.com').replace(/\/$/, '');
const DB_SECRET = process.env.FIREBASE_DB_SECRET || '';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TROY_OZ_TO_GRAMS = 31.1034768;

const GOLD_RETAIL_MULTIPLIER = 1.105;
const SILVER_RETAIL_MULTIPLIER = 1.115;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'BharatEkNojore-AutoUpdater/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function formatShortDate(date) {
  const ist = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return `${ist.getDate()} ${MONTHS_EN[ist.getMonth()]}`;
}

function formatFullDates(date) {
  return {
    bn: new Intl.DateTimeFormat('bn-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date),
    hi: new Intl.DateTimeFormat('hi-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date),
    en: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date),
  };
}

async function main() {
  const now = new Date();
  const shortToday = formatShortDate(now);

  const authQuery = DB_SECRET ? `?auth=${encodeURIComponent(DB_SECRET)}` : '';
  let existing = {};
  try {
    existing = (await fetchJson(`${DB_URL}/marketData.json${authQuery}`)) || {};
  } catch (err) {
    console.warn('Could not read existing marketData, starting fresh:', err.message);
  }

  let usdinr = existing.usdinr || 93.43;
  try {
    const fx = await fetchJson('https://open.er-api.com/v6/latest/USD');
    if (fx?.rates?.INR) {
      usdinr = Number(fx.rates.INR.toFixed(2));
    }
  } catch (err) {
    console.warn('FX API failed, keeping previous USD/INR:', err.message);
  }

  let spotGoldUsd = existing.spotGoldUsd || 3860;
  let spotSilverUsd = existing.spotSilverUsd || 47.66;
  try {
    const goldData = await fetchJson('https://api.gold-api.com/price/XAU');
    if (goldData?.price) spotGoldUsd = Number(goldData.price.toFixed(2));
  } catch (err) {
    console.warn('Gold spot API failed, keeping previous:', err.message);
  }
  try {
    const silverData = await fetchJson('https://api.gold-api.com/price/XAG');
    if (silverData?.price) spotSilverUsd = Number(silverData.price.toFixed(2));
  } catch (err) {
    console.warn('Silver spot API failed, keeping previous:', err.message);
  }

  const gold24PerGram = (spotGoldUsd / TROY_OZ_TO_GRAMS) * usdinr * GOLD_RETAIL_MULTIPLIER;
  const gold24 = Math.round((gold24PerGram * 10) / 10) * 10;
  const gold22Delhi = Math.round((gold24 * (22 / 24)) / 10) * 10;
  const gold22Kol = Math.max(0, gold22Delhi - 150);

  const silverPerGram = (spotSilverUsd / TROY_OZ_TO_GRAMS) * usdinr * SILVER_RETAIL_MULTIPLIER;
  const silver = Math.round((silverPerGram * 1000) / 100) * 100;

  const prevGoldHist = Array.isArray(existing.goldHistory) && existing.goldHistory.length
    ? existing.goldHistory
    : [['1 Nov', 138880], ['8 Nov', 143570], ['11 Nov', 141980], ['15 Nov', 137620], ['17 Nov', 136040]];
  const prevSilvHist = Array.isArray(existing.silverHistory) && existing.silverHistory.length
    ? existing.silverHistory
    : [['1 Nov', 200000], ['8 Nov', 205000], ['11 Nov', 200000], ['15 Nov', 195000], ['17 Nov', 190000]];

  const updateHistory = (hist, val) => {
    const copy = hist.map((item) => [...item]);
    if (copy[copy.length - 1][0] === shortToday) {
      copy[copy.length - 1][1] = val;
    } else {
      copy.push([shortToday, val]);
      if (copy.length > 5) copy.shift();
    }
    return copy;
  };

  const payload = {
    usdinr,
    gold24,
    gold22Delhi,
    gold22Kol,
    silver,
    spotGoldUsd,
    spotSilverUsd,
    goldHistory: updateHistory(prevGoldHist, gold24),
    silverHistory: updateHistory(prevSilvHist, silver),
    asOf: formatFullDates(now),
    updatedAt: now.toISOString(),
  };

  console.log('Pushing updated marketData to Firebase:', JSON.stringify(payload, null, 2));

  const putRes = await fetch(`${DB_URL}/marketData.json${authQuery}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!putRes.ok) {
    const txt = await putRes.text();
    throw new Error(`Firebase PUT failed (${putRes.status}): ${txt}`);
  }

  console.log('Successfully updated Firebase marketData!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
