
const { marketOrder, getAccount, takeProfitOrder } = require("./binanceClient");
const { generateSignal } = require("../strategy");
const { openTrade, getActiveTrade } = require("./positionManager");
const axios = require("axios");

//async function process(symbol, candles) {
  async function processTrade(symbol, candles) {
  // ✅ تحقق هل هناك صفقة مفتوحة
  if (getActiveTrade(symbol)) return;

  const { signal, trade } = generateSignal(candles);
  if (signal !== "BUY") return;

  try {
    const account = await getAccount();
    const usdtBalance = account.balances.find(b => b.asset === "USDT");
    const freeUSDT = parseFloat(usdtBalance.free);

    if (freeUSDT <= 0) {
      console.error("⚠️ لا يوجد رصيد");
      return;
    }

    const exchangeInfo = await axios.get(`${process.env.BINANCE_API_URL}/api/v3/exchangeInfo`);
    const pairInfo = exchangeInfo.data.symbols.find(s => s.symbol === symbol);

    const lotFilter = pairInfo.filters.find(f => f.filterType === "LOT_SIZE");
    const minQty = parseFloat(lotFilter.minQty);
    const stepSize = parseFloat(lotFilter.stepSize);

    // ✅ FIX BUY
    let quantity = (freeUSDT * 0.95) / trade.entry;

    if (quantity < minQty) {
      //console.error("⚠️ أقل من minQty");
      return;
    }
    
    //quantity = Math.floor(quantity / stepSize) * stepSize;
    const precision = Math.round(Math.log10(1 / stepSize));

quantity = Math.floor(quantity / stepSize) * stepSize;

// 🔥 الحل هنا
quantity = Number(quantity.toFixed(precision));








    console.log("✅ كمية الشراء:", quantity);

    const order = await marketOrder(symbol, "BUY", quantity);
    
//جديد ل pt limit order
    await takeProfitOrder(
  symbol,
  quantity,
  trade.takeProfit
);

    const newTrade = {
      symbol,
      entry: trade.entry,
      takeProfit: trade.takeProfit,
      quantity,
      orderId: order.orderId,
      status: "OPEN"
    };

    // ✅ هنا التخزين الصحيح
    openTrade(newTrade);

    console.log("✅ BUY EXECUTED", newTrade);

  } catch (error) {
    console.error("⚠️ Failed:", error.response?.data || error.message);
  }
}
module.exports = { processTrade };
//module.exports = { process };

