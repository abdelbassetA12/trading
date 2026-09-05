const {
  startMarketData,
  getData,
  subscribe
} = require("./marketData");

const { processTrade } = require("./trader");
const {
  updateTrades,
  getActiveTrade
} = require("./positionManager");

async function run(symbols = ["BTCUSDT"]) {

  for (const symbol of symbols) {

    subscribe(symbol, async (data) => {

      try {

        if (!data || data.length < 100) {
          console.log(
            `[RUNNER:${symbol}] ⚠️ Not enough data`
          );
          return;
        }

        let activeTrade = getActiveTrade(symbol);

        if (!activeTrade) {
          await processTrade(symbol, data);
        }

        activeTrade = getActiveTrade(symbol);

        const lastCandle = data[data.length - 1];

        updateTrades(lastCandle, activeTrade);

        if (activeTrade) {
          console.log("📊 ACTIVE:", activeTrade);
        }

      } catch (error) {

        console.error(
          `[RUNNER:${symbol}] ❌`,
          error.response?.data || error.message
        );

      }

    });

  }

  await startMarketData(symbols);

}

module.exports = { run };













 /*
const axios = require("axios");
 
 
const { processTrade } = require("./trader");
const { updateTrades, getActiveTrade } = require("./positionManager");

 
 async function getData(symbol) {

  const url = `${process.env.BINANCE_API_URL}/api/v3/klines?symbol=${symbol}&interval=15m&limit=200`;

  console.log(`[GET_DATA:${symbol}] URL:`, url);

  try {
    const res = await axios.get(url);

    console.log(`[GET_DATA:${symbol}] ✅ ${res.data.length} candles`);

    return res.data.map(c => ({
      time: c[0],
      open: +c[1],
      high: +c[2],
      low: +c[3],
      close: +c[4]
    }));

  } catch (error) {

    console.error(`[GET_DATA:${symbol}] ❌`, {
      url,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });

    return null;
  }
}
 
 
async function run(symbols = ["BTCUSDT"]) {

  symbols.forEach(symbol => {

    let running = false;

    setInterval(async () => {

      if (running) return;

      running = true;

      try {

        const data = await getData(symbol);

        if (!data || data.length === 0) {
          console.log(`[RUNNER:${symbol}] ⚠️ No data`);
          return;
        }

        const lastCandle = data[data.length - 1];

        let activeTrade = getActiveTrade(symbol);

        // دخول صفقة
        if (!activeTrade) {
          await processTrade(symbol, data);
        }

        // تحديث الصفقة
        activeTrade = getActiveTrade(symbol);

        updateTrades(lastCandle, activeTrade);

        if (activeTrade) {
          console.log("📊 ACTIVE:", activeTrade);
        }

      } catch (error) {

        console.error(
          `[RUNNER:${symbol}] ❌`,
          error.response?.data || error.message
        );

      } finally {

        running = false;

      }

    }, 30000);

  });
}
 
 

module.exports = { run };

*/