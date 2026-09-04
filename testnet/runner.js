
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
/*
async function getData(symbol) {
  const res = await axios.get(
  `${process.env.BINANCE_API_URL}/api/v3/klines?symbol=${symbol}&interval=15m&limit=200`
);


  return res.data.map(c => ({
    time: c[0],
    open: +c[1],
    high: +c[2],
    low: +c[3],
    close: +c[4]
  }));
}*/
 
async function run(symbols = ["BTCUSDT"]) {
  symbols.forEach(symbol => {
    setInterval(async () => {
      const data = await getData(symbol);
      const lastCandle = data[data.length - 1];

      let activeTrade = getActiveTrade(symbol);

      // دخول صفقة
      if (!activeTrade) {
        //await process(symbol, data);
        await processTrade(symbol, data);
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

