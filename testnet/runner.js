
const axios = require("axios");
const { process } = require("./trader");
const { updateTrades, getActiveTrade } = require("./positionManager");

async function getData(symbol) {
  const res = await axios.get(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=200`
       
  );

  return res.data.map(c => ({
    time: c[0],
    open: +c[1],
    high: +c[2],
    low: +c[3],
    close: +c[4]
  }));
}

async function run(symbols = ["BTCUSDT"]) {
  symbols.forEach(symbol => {
    setInterval(async () => {
      const data = await getData(symbol);
      const lastCandle = data[data.length - 1];

      let activeTrade = getActiveTrade(symbol);

      // دخول صفقة
      if (!activeTrade) {
        await process(symbol, data);
      }

      // تحديث الصفقة
      activeTrade = getActiveTrade(symbol);
      updateTrades(lastCandle, activeTrade);

      if (activeTrade) {
        console.log("📊 ACTIVE:", activeTrade);
      }

    }, 5000);
  });
}

module.exports = { run };

