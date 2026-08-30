

//const { marketOrder } = require("./binanceClient");

let trades = [];
let activeTrades = {};

async function updateTrades(candle, trade) {
  if (!trade) return null;

  // 🎯 TP HIT
  /*
  if (candle.high >= trade.takeProfit) {
    try {
      console.log("🚀 SELLING at TP...");

      // ✅ تنفيذ البيع الحقيقي
      await marketOrder(trade.symbol, "SELL", trade.quantity);

      trade.status = "CLOSED";
      trade.result = "WIN";
      trade.closePrice = trade.takeProfit;

      trades.push(trade);
      delete activeTrades[trade.symbol];

      console.log("🎯 TP HIT + SOLD", trade);

    } catch (err) {
      console.error("❌ SELL FAILED:", err.response?.data || err.message);
      return trade; // ⚠️ لا تغلق الصفقة إذا فشل البيع
    }

    return null;
  }
  */
  return trade;
}

function openTrade(trade) {
  activeTrades[trade.symbol] = trade;
}

function getActiveTrade(symbol) {
  return activeTrades[symbol];
}

function getTradesIncludingActive() {
  return [
    ...Object.values(activeTrades),
    ...trades
  ];
}

module.exports = {
  openTrade,
  updateTrades,
  getTradesIncludingActive,
  getActiveTrade
};

