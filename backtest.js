// ============================================================
// BACKTEST ENGINE
// ============================================================
//
// الهدف:
// محاكاة Runner زمنيًا Candle by Candle.
//
// القواعد:
// 1. نستخدم نفس generateSignal() المستخدم في Runner.
// 2. الاستراتيجية ترى فقط البيانات التي كانت متاحة في تلك اللحظة.
// 3. عند ظهور BUY يتم فتح الصفقة.
// 4. لا يوجد Stop Loss نهائيًا.
// 5. يوجد Take Profit فقط.
// 6. لا نفحص TP في شمعة الدخول.
// 7. يبدأ فحص TP من الشمعة التالية.
// 8. لا نفتح صفقة جديدة أثناء وجود صفقة مفتوحة.
// ============================================================

const { generateSignal } = require("./strategy");

function replayBacktest(data, balance = 10) {

  // ============================================================
  // SETTINGS
  // ============================================================

  const allocationPercent = 0.95;

  // أقل عدد شموع بين دخولين
  // سيتم استخدامه فقط بعد إغلاق الصفقة.
  const tradeCooldown = 10;

  // ============================================================
  // STATE
  // ============================================================

  let trades = [];

  let openPosition = null;

  let lastTradeIndex = -Infinity;

  // ============================================================
  // VALIDATION
  // ============================================================

  if (!Array.isArray(data) || data.length < 101) {
    return {
      balance: Number(balance.toFixed(2)),
      totalProfit: 0,
      trades: [],
      stats: {
        total: 0,
        wins: 0,
        losses: 0,
        winrate: 0
      }
    };
  }

  // ============================================================
  // MAIN REPLAY LOOP
  // ============================================================

  for (let i = 100; i < data.length; i++) {

    const candle = data[i];

    // ==========================================================
    // 1. MANAGE OPEN POSITION
    // ==========================================================

    if (openPosition) {

      // --------------------------------------------------------
      // BUY → TP ONLY
      // --------------------------------------------------------

      if (
        openPosition.type === "BUY" &&
        candle.high >= openPosition.takeProfit
      ) {

        const profit =
          (openPosition.takeProfit - openPosition.entry) *
          openPosition.size;

        balance += profit;

        openPosition.status = "WIN";
        openPosition.profit = profit;

        openPosition.closeTime =
          candle.time || candle.openTime;

        openPosition.closeIndex = i;

        trades.push({
          ...openPosition
        });

        // إغلاق الصفقة
        openPosition = null;

        // لا ندخل صفقة أخرى في نفس الشمعة
        continue;
      }

      // --------------------------------------------------------
      // TP لم يصل
      // الصفقة تبقى مفتوحة
      // --------------------------------------------------------

      continue;
    }

    // ==========================================================
    // 2. TRADE COOLDOWN
    // ==========================================================

    if (i - lastTradeIndex < tradeCooldown) {
      continue;
    }

    // ==========================================================
    // 3. CREATE HISTORICAL SLICE
    // ==========================================================
    //
    // مهم جدًا:
    //
    // Runner في اللحظة الحالية لا يعرف المستقبل.
    //
    // لذلك Backtest أيضًا يعطي strategy فقط:
    //
    // candle 0
    // candle 1
    // ...
    // candle i
    //
    // ولا يعطيها candle i+1 وما بعدها.
    //
    // هذا يجعل الاختبار زمنيًا وليس باستخدام المستقبل.
    // ==========================================================

    const slice = data.slice(0, i + 1);

    // ==========================================================
    // 4. GENERATE SIGNAL
    // ==========================================================

    const result = generateSignal(slice);

    const signal = result?.signal;
    const trade = result?.trade;

    // لا توجد صفقة
    if (!trade) {
      continue;
    }

    // نحن نريد BUY فقط
    if (signal !== "BUY") {
      continue;
    }

    // ==========================================================
    // 5. VALIDATE ENTRY
    // ==========================================================

    const entry = Number(trade.entry);

    if (!Number.isFinite(entry) || entry <= 0) {
      continue;
    }

    // ==========================================================
    // 6. VALIDATE TP
    // ==========================================================

    const takeProfit = Number(trade.takeProfit);

    if (!Number.isFinite(takeProfit)) {
      continue;
    }

    // BUY يجب أن يكون TP أعلى من Entry
    if (takeProfit <= entry) {
      continue;
    }

    // ==========================================================
    // 7. CAPITAL ALLOCATION
    // ==========================================================

    const capitalAllocated =
      balance * allocationPercent;

    if (
      !Number.isFinite(capitalAllocated) ||
      capitalAllocated <= 0
    ) {
      continue;
    }

    // ==========================================================
    // 8. POSITION SIZE
    // ==========================================================

    const positionSize =
      capitalAllocated / entry;

    if (
      !Number.isFinite(positionSize) ||
      positionSize <= 0
    ) {
      continue;
    }

    // ==========================================================
    // 9. OPEN POSITION
    // ==========================================================

    openPosition = {

      id: `${Date.now()}-${Math.random()}`,

      type: "BUY",

      entry,

      takeProfit,

      size: positionSize,

      capitalAllocated,

      status: "OPEN",

      profit: 0,

      openTime:
        candle.time || candle.openTime,

      openIndex: i
    };

    lastTradeIndex = i;

    // ==========================================================
    // IMPORTANT
    // ==========================================================
    //
    // لا نفحص TP في candle نفسها التي أنشأنا فيها الصفقة.
    //
    // السبب:
    //
    // generateSignal() تم حسابه باستخدام بيانات هذه الشمعة.
    //
    // لذلك يبدأ اختبار نتيجة الصفقة من:
    //
    // i + 1
    //
    // وليس i.
    //
    // ==========================================================
  }

  // ============================================================
  // 10. STATISTICS
  // ============================================================

  const wins = trades.filter(
    trade => trade.status === "WIN"
  ).length;

  const losses = trades.filter(
    trade => trade.status === "LOSS"
  ).length;

  const totalProfit = trades.reduce(
    (sum, trade) =>
      sum + Number(trade.profit || 0),
    0
  );

  const winrate =
    trades.length > 0
      ? Number(
          ((wins / trades.length) * 100).toFixed(2)
        )
      : 0;

  // ============================================================
  // 11. RESULT
  // ============================================================

  return {

    balance: Number(
      balance.toFixed(2)
    ),

    totalProfit: Number(
      totalProfit.toFixed(2)
    ),

    trades,

    stats: {

      total: trades.length,

      wins,

      losses,

      winrate
    }
  };
}

module.exports = {
  replayBacktest
};



/*
// ================= BACKTEST =================

const { generateSignal } = require("./strategy");

function replayBacktest(data, balance = 10) {
  let trades = [];

  const allocationPercent = 0.95; // 1% من الرصيد لكل صفقة
  let lastTradeIndex = -100;

  let openPosition = null;

  for (let i = 100; i < data.length; i++) {
    const candle = data[i];

    // =====================================================
    // 1. MANAGE OPEN TRADE
    // =====================================================

    if (openPosition) {
      // BUY -> TP يجب أن يكون أعلى من Entry
      if (
        openPosition.type === "BUY" &&
        openPosition.takeProfit > openPosition.entry &&
        candle.high >= openPosition.takeProfit
      ) {
        const profit =
          (openPosition.takeProfit - openPosition.entry) *
          openPosition.size;

        balance += profit;

        openPosition.status = "WIN";
        openPosition.profit = profit;
        openPosition.closeTime = candle.time || candle.openTime;

        trades.push(openPosition);

        openPosition = null;

        continue;
      }

      // إذا لم يصل TP تبقى الصفقة مفتوحة
      continue;
    }

    // =====================================================
    // 2. TRADE COOLDOWN
    // =====================================================

    if (i - lastTradeIndex < 10) {
      continue;
    }

    // =====================================================
    // 3. GENERATE SIGNAL
    // =====================================================

    const slice = data.slice(0, i + 1);

    const result = generateSignal(slice);

    const signal = result?.signal;
    const trade = result?.trade;

    if (!trade) {
      continue;
    }

    if (signal !== "BUY") {
      continue;
    }

    // =====================================================
    // 4. VALIDATE ENTRY / TP
    // =====================================================

    const entry = Number(trade.entry);
    const takeProfit = Number(trade.takeProfit);

    if (!Number.isFinite(entry)) {
      continue;
    }

    if (!Number.isFinite(takeProfit)) {
      continue;
    }

    // BUY لا يمكن أن يكون TP أقل من أو يساوي Entry
    if (takeProfit <= entry) {
      continue;
    }

    // =====================================================
    // 5. CAPITAL ALLOCATION
    // =====================================================

    const capitalAllocated = balance * allocationPercent;

    if (capitalAllocated <= 0) {
      continue;
    }

    // =====================================================
    // 6. POSITION SIZE
    // =====================================================

    // مثال:
    //
    // Balance = $1000
    // Allocation = 1%
    // Capital = $10
    //
    // Entry = $70,000
    //
    // Position Size =
    // 10 / 70000
    //
    // = 0.000142 BTC

    const positionSize = capitalAllocated / entry;

    if (!Number.isFinite(positionSize) || positionSize <= 0) {
      continue;
    }

    // =====================================================
    // 7. OPEN POSITION
    // =====================================================

    openPosition = {
      id: `${Date.now()}-${Math.random()}`,

      type: "BUY",

      entry,

      takeProfit,

      size: positionSize,

      capitalAllocated,

      status: "OPEN",

      profit: 0,

      openTime: candle.time || candle.openTime
    };

    lastTradeIndex = i;

    // =====================================================
    // 8. IMPORTANT
    // =====================================================
    //
    // لا نفحص TP على نفس شمعة الدخول.
    //
    // لأن entry تم إنشاؤه من بيانات هذه الشمعة.
    //
    // يبدأ فحص TP من الشمعة التالية.
  }

  // =====================================================
  // 9. STATISTICS
  // =====================================================

  const wins = trades.filter(
    (trade) => trade.status === "WIN"
  ).length;

  const losses = trades.filter(
    (trade) => trade.status === "LOSS"
  ).length;

  const totalProfit = trades.reduce(
    (sum, trade) => sum + Number(trade.profit || 0),
    0
  );

  return {
    balance: Number(balance.toFixed(2)),

    totalProfit: Number(totalProfit.toFixed(2)),

    trades,

    stats: {
      total: trades.length,

      wins,

      losses,

      winrate: trades.length
        ? Number(((wins / trades.length) * 100).toFixed(2))
        : 0
    }
  };
}

module.exports = {
  replayBacktest
};
 */