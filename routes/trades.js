
const router = require("express").Router();
const Trade = require("../models/Trade");

// إضافة صفقة
router.post("/add", async (req, res) => {
  try {
    const {
      entry, exit, lot, type, pair, userId,
      stopLoss, takeProfit, strategy,
      emotion, mistake, setupQuality, image,entryTime
    } = req.body;

    const direction = type === "BUY" ? 1 : -1;

    const result = (exit - entry) * lot * direction;
    const resultPercent = ((exit - entry) / entry) * 100 * direction;

    // 🔥 Risk Reward
    let rr = null;
    if (stopLoss && takeProfit) {
      rr = Math.abs((takeProfit - entry) / (entry - stopLoss));
    }

    const trade = new Trade({
      entry, exit, lot, type, pair, userId,
      stopLoss, takeProfit,
      result, resultPercent,
      rr,
      strategy,
      emotion,
      mistake,
      setupQuality,
      image, // 🔥 حفظ رابط الصورة
      entryTime
    });

    await trade.save();
    res.json(trade);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/*
router.post("/add", async (req, res) => {
  try {
    const { entry, exit, lot, type, pair, userId, stopLoss, takeProfit, notes } = req.body;
    const result = (exit - entry) * lot * (type === "BUY" ? 1 : -1);
    const resultPercent = ((exit - entry) / entry) * 100 * (type === "BUY" ? 1 : -1);
    
    const duration = 0; // يمكن حسابه لاحقاً إذا أردنا تخزين وقت الفتح والإغلاق
    
    const trade = new Trade({ entry, exit, lot, type, pair, userId, result, resultPercent, stopLoss, takeProfit, notes, duration });
    await trade.save();
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
*/
// جلب كل صفقات المستخدم
router.get("/:userId", async (req, res) => {
  try {
    const trades = await Trade.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//جديد
router.get("/analytics/:userId", async (req, res) => {
  const trades = await Trade.find({ userId: req.params.userId }).sort({ createdAt: 1 });

  const total = trades.length;

  const wins = trades.filter(t => t.result > 0);
  const losses = trades.filter(t => t.result <= 0);

  const winRate = total ? (wins.length / total) * 100 : 0;

  const avgWin = wins.reduce((a, b) => a + b.result, 0) / (wins.length || 1);
  const avgLoss = losses.reduce((a, b) => a + b.result, 0) / (losses.length || 1);

  const expectancy = (winRate / 100) * avgWin + ((1 - winRate / 100) * avgLoss);

  // 🔥 Profit Factor
  const totalWin = wins.reduce((a, b) => a + b.result, 0);
  const totalLoss = Math.abs(losses.reduce((a, b) => a + b.result, 0));
  const profitFactor = totalLoss ? totalWin / totalLoss : totalWin;

  // 🔥 Max Drawdown
  let peak = 0;
  let drawdown = 0;
  let maxDrawdown = 0;
  let balance = 0;

  trades.forEach(t => {
    balance += t.result;
    if (balance > peak) peak = balance;
    drawdown = peak - balance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  // 🔥 Streaks
  let winStreak = 0, maxWinStreak = 0;
  let lossStreak = 0, maxLossStreak = 0;

  trades.forEach(t => {
    if (t.result > 0) {
      winStreak++;
      lossStreak = 0;
    } else {
      lossStreak++;
      winStreak = 0;
    }

    if (winStreak > maxWinStreak) maxWinStreak = winStreak;
    if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
  });

  // 🔥 أفضل استراتيجية (كما هي)
  const strategies = {};
  trades.forEach(t => {
    if (!t.strategy) return;
    if (!strategies[t.strategy]) strategies[t.strategy] = [];
    strategies[t.strategy].push(t.result);
  });

  const bestStrategy = Object.entries(strategies).map(([k, v]) => ({
    name: k,
    profit: v.reduce((a, b) => a + b, 0)
  })).sort((a, b) => b.profit - a.profit)[0];




  // 🔥 Strategy Breakdown
const strategyStats = {};

trades.forEach(t => {
  if (!t.strategy) return;

  if (!strategyStats[t.strategy]) {
    strategyStats[t.strategy] = {
      total: 0,
      wins: 0,
      profit: 0
    };
  }

  strategyStats[t.strategy].total++;
  strategyStats[t.strategy].profit += t.result;

  if (t.result > 0) {
    strategyStats[t.strategy].wins++;
  }
});

const strategyBreakdown = Object.entries(strategyStats).map(([name, s]) => ({
  name,
  trades: s.total,
  winRate: s.total ? (s.wins / s.total) * 100 : 0,
  profit: s.profit
}));





// 🔥 SCORE SYSTEM
let score = 100;

// خسائر متتالية
if (maxLossStreak >= 3) score -= 15;

// revenge trading
const revengeTrades = trades.filter(t => t.emotion === "revenge").length;
if (revengeTrades >= 2) score -= 15;

// صفقات ضعيفة
const lowQuality = trades.filter(t => t.setupQuality <= 2).length;
if (lowQuality >= 3) score -= 10;

// drawdown كبير
if (maxDrawdown > 0) score -= 10;

// winrate ضعيف
if (winRate < 40) score -= 10;

// Profit Factor
if (profitFactor > 1.5) score += 10;


score = Math.max(0, Math.min(100, score));



// ⏱️ TIME ANALYSIS
const hourlyStats = {};

trades.forEach(t => {
  const hour = new Date(t.entryTime || t.createdAt).getHours();

  if (!hourlyStats[hour]) {
    hourlyStats[hour] = { profit: 0, trades: 0 };
  }

  hourlyStats[hour].profit += t.result;
  hourlyStats[hour].trades++;
});

const timeAnalysis = Object.entries(hourlyStats).map(([hour, data]) => ({
  hour: Number(hour),
  profit: data.profit,
  trades: data.trades
}));

const bestHour = timeAnalysis.sort((a, b) => b.profit - a.profit)[0];
const worstHour = timeAnalysis.sort((a, b) => a.profit - b.profit)[0];




// 🌍 SESSION ANALYSIS
const sessions = {
  asia: { profit: 0, trades: 0 },
  london: { profit: 0, trades: 0 },
  newyork: { profit: 0, trades: 0 }
};

trades.forEach(t => {
  
  const hour = new Date(t.entryTime || t.createdAt).getHours();


  let session = "";

  if (hour >= 0 && hour < 8) session = "asia";
  else if (hour >= 8 && hour < 16) session = "london";
  else session = "newyork";

  sessions[session].profit += t.result;
  sessions[session].trades++;
});

const sessionAnalysis = Object.entries(sessions).map(([name, data]) => ({
  name,
  profit: data.profit,
  trades: data.trades
}));

const bestSession = sessionAnalysis.sort((a, b) => b.profit - a.profit)[0];

  res.json({
    total,
    winRate,
    avgWin,
    avgLoss,
    expectancy,
    profitFactor,
    maxDrawdown,
    maxWinStreak,
    maxLossStreak,
    bestStrategy,
  strategyBreakdown, // 🔥 جديد
  score,
  timeAnalysis,       // 🔥 جديد
  bestHour,
  worstHour,
  sessionAnalysis,    // 🔥 جديد
  bestSession
  });
});
/*
router.get("/analytics/:userId", async (req, res) => {
  const trades = await Trade.find({ userId: req.params.userId });

  const total = trades.length;
  const wins = trades.filter(t => t.result > 0);
  const losses = trades.filter(t => t.result <= 0);

  const winRate = total ? (wins.length / total) * 100 : 0;

  const avgWin = wins.reduce((a, b) => a + b.result, 0) / (wins.length || 1);
  const avgLoss = losses.reduce((a, b) => a + b.result, 0) / (losses.length || 1);

  const expectancy = (winRate / 100) * avgWin + ((1 - winRate / 100) * avgLoss);

  // 🔥 أفضل استراتيجية
  const strategies = {};
  trades.forEach(t => {
    if (!t.strategy) return;
    if (!strategies[t.strategy]) strategies[t.strategy] = [];
    strategies[t.strategy].push(t.result);
  });

  const bestStrategy = Object.entries(strategies).map(([k, v]) => ({
    name: k,
    profit: v.reduce((a, b) => a + b, 0)
  })).sort((a, b) => b.profit - a.profit)[0];

  res.json({
    total,
    winRate,
    avgWin,
    avgLoss,
    expectancy,
    bestStrategy
  });
});
*/
router.get("/ai/:userId", async (req, res) => {
  const trades = await Trade.find({ userId: req.params.userId });

  let advice = [];

  if (!trades.length) {
    return res.json(["📭 ما كايناش صفقات باش يتحلل الأداء"]);
  }

  // -------------------------
  // 📊 PAIR ANALYSIS
  // -------------------------
  const pairStats = {};

  trades.forEach(t => {
    if (!pairStats[t.pair]) {
      pairStats[t.pair] = { profit: 0, trades: 0 };
    }

    pairStats[t.pair].profit += t.result;
    pairStats[t.pair].trades++;
  });

  const sortedPairs = Object.entries(pairStats)
    .map(([pair, data]) => ({
      pair,
      profit: data.profit,
      trades: data.trades
    }))
    .sort((a, b) => b.profit - a.profit);

  const bestPair = sortedPairs[0];
  const worstPair = sortedPairs[sortedPairs.length - 1];

  if (bestPair) {
    advice.push(`🔥 أفضل زوج عندك هو ${bestPair.pair}`);
  }

  if (worstPair && worstPair.profit < 0) {
    advice.push(`⚠️ كتخسر بزاف فـ ${worstPair.pair}`);
  }

  // -------------------------
  // 📊 BUY vs SELL
  // -------------------------
  const buyTrades = trades.filter(t => t.type === "BUY");
  const sellTrades = trades.filter(t => t.type === "SELL");

  const buyProfit = buyTrades.reduce((a, b) => a + b.result, 0);
  const sellProfit = sellTrades.reduce((a, b) => a + b.result, 0);

  if (buyProfit > sellProfit) {
    advice.push("📈 أداءك أفضل في BUY");
  } else if (sellProfit > buyProfit) {
    advice.push("📉 أداءك أفضل في SELL");
  }

  // -------------------------
  // 📊 STRATEGY ANALYSIS
  // -------------------------
  const strategies = {};

  trades.forEach(t => {
    if (!t.strategy) return;

    if (!strategies[t.strategy]) {
      strategies[t.strategy] = { profit: 0, trades: 0 };
    }

    strategies[t.strategy].profit += t.result;
    strategies[t.strategy].trades++;
  });

  const sortedStrategies = Object.entries(strategies)
    .map(([name, data]) => ({
      name,
      profit: data.profit
    }))
    .sort((a, b) => b.profit - a.profit);

  if (sortedStrategies[0]) {
    advice.push(`🎯 أفضل استراتيجية ديالك: ${sortedStrategies[0].name}`);
  }

  // -------------------------
  // ⚠️ PSYCHOLOGY
  // -------------------------
  const revengeTrades = trades.filter(t => t.emotion === "revenge").length;

  if (revengeTrades >= 2) {
    advice.push("🚨 كاين revenge trading، حاول توقف بعد الخسارة");
  }

  const lowQuality = trades.filter(t => t.setupQuality <= 2).length;

  if (lowQuality >= 3) {
    advice.push("📉 بزاف ديال الصفقات ضعيفة الجودة");
  }

  // -------------------------
  // 🔁 CONSISTENCY
  // -------------------------
  let lossesInRow = 0;
  let maxLosses = 0;

  trades.forEach(t => {
    if (t.result < 0) {
      lossesInRow++;
      if (lossesInRow > maxLosses) maxLosses = lossesInRow;
    } else {
      lossesInRow = 0;
    }
  });

  if (maxLosses >= 3) {
    advice.push("⚠️ عندك سلسلة خسائر، خاصك توقف وتراجع");
  }

  // -------------------------
  // 🧠 FINAL
  // -------------------------
  if (!advice.length) {
    advice.push("🔥 الأداء ديالك متوازن، استمر بنفس النهج");
  }

  res.json(advice);
});
/*
router.get("/ai/:userId", async (req, res) => {
  const trades = await Trade.find({ userId: req.params.userId });

  let advice = [];

  const losses = trades.filter(t => t.result < 0);

  const revengeTrades = losses.filter(t => t.emotion === "revenge").length;

  if (revengeTrades > 2) {
    advice.push("⚠️ كاين revenge trading بزاف، خاصك توقف بعد الخسارة");
  }

  const lowQuality = trades.filter(t => t.setupQuality <= 2).length;

  if (lowQuality > 3) {
    advice.push("📉 تدخل صفقات ضعيفة الجودة");
  }

  if (!advice.length) {
    advice.push("🔥 الأداء ديالك مزيان، استمر!");
  }

  res.json(advice);
});
*/
// حذف صفقة
router.delete("/:id", async (req, res) => {
  try {
    await Trade.findByIdAndDelete(req.params.id);
    res.json({ message: "Trade deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;



