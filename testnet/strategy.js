// ================= Swing Points =================
const getSwingPoints = (highs, lows, lookback = 3) => {
  let swingHighs = [];
  let swingLows = [];

  for (let i = lookback; i < highs.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }

    if (isHigh) swingHighs.push({ index: i, value: highs[i] });
    if (isLow) swingLows.push({ index: i, value: lows[i] });
  }

  return { swingHighs, swingLows };
};


// ================= STRUCTURE =================
const detectTrendFromStructure = (highs, lows) => {
  const { swingHighs, swingLows } = getSwingPoints(highs, lows);

  if (swingHighs.length < 2 || swingLows.length < 2) return "sideways";

  const lastHigh = swingHighs.at(-1);
  const prevHigh = swingHighs.at(-2);

  const lastLow = swingLows.at(-1);
  const prevLow = swingLows.at(-2);

  if (lastHigh.value > prevHigh.value) return "bullish";
  if (lastLow.value < prevLow.value) return "bearish";

  return "sideways";
};


// ================= CHOCH =================
const detectCHOCH = (highs, lows, closes) => {
  const { swingHighs, swingLows } = getSwingPoints(highs, lows);

  if (swingHighs.length < 2 || swingLows.length < 2) return null;

  const prevHigh = swingHighs.at(-2);
  const prevLow = swingLows.at(-2);

  const lastClose = closes.at(-1);

  // BUY فقط
  if (lastClose > prevHigh.value) {
    return {
      type: "CHOCH_BUY",
      level: prevHigh.value,
      index: closes.length - 1
    };
  }

  return null;
};


// ================= ORDER BLOCK =================
const findOrderBlock = (candles, breakIndex) => {
  for (let i = breakIndex - 1; i >= breakIndex - 50; i--) {
    const c = candles[i];
    if (!c) continue;

    // BUY → آخر شمعة هابطة
    if (c.close < c.open) {
      return { high: c.high, low: c.low, index: i };
    }
  }
  return null;
};


// ================= MAIN =================
const generateSignal = (candles) => {
  if (candles.length < 100) return { signal: "HOLD" };

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const choch = detectCHOCH(highs, lows, closes);
  if (!choch) return { signal: "HOLD" };

  const ob = findOrderBlock(candles, choch.index);
  if (!ob) return { signal: "HOLD" };

  const price = closes.at(-1);

  const tolerance = (ob.high - ob.low) * 0.5;

  let entry = null;

  if (
    price >= ob.low - tolerance &&
    price <= ob.high
  ) {
    entry = price;
  }

  if (!entry) {
    return {
      signal: "WAIT_FOR_RETEST",
      zone: ob,
      choch
    };
  }
/*
  const { swingHighs } = getSwingPoints(highs, lows);

  let tp = swingHighs.at(-1)?.value;
  if (!tp) return { signal: "HOLD" };
*/

const { swingHighs } = getSwingPoints(highs, lows);

// نجيب غير القمم اللي فوق سعر الدخول
const futureHighs = swingHighs.filter(h => h.value > entry);

// نختار أقرب وحدة
let tp = futureHighs.length
  ? futureHighs[0].value
  : null;

// حماية: إلى ماكانش TP صالح
if (!tp || tp <= entry) {
  // fallback: نحسب TP بالـ Risk/Reward
  const sl = ob.low;
  const risk = entry - sl;
  tp = entry + risk * 2; // RR = 1:2
}
  
  return {
    signal: "BUY",
    trade: {
      entry,
      takeProfit: tp,
      orderBlock: ob,
      choch 
    }
  };
};

module.exports = { generateSignal };


