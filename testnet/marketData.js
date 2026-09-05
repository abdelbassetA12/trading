const axios = require("axios");
const WebSocket = require("ws");

const BASE_URL = process.env.BINANCE_API_URL;

const marketData = {};
const listeners = {};

async function loadInitialData(symbol) {
  const url =
    `${BASE_URL}/api/v3/klines` +
    `?symbol=${symbol}&interval=15m&limit=200`;

  const res = await axios.get(url);

  marketData[symbol] = res.data.map(c => ({
    time: c[0],
    open: +c[1],
    high: +c[2],
    low: +c[3],
    close: +c[4],
    volume: +c[5]
  }));

  console.log(
    `[MARKET:${symbol}] ✅ Loaded ${marketData[symbol].length} candles`
  );
}

function getData(symbol) {
  return marketData[symbol] || [];
}

function subscribe(symbol, callback) {
  if (!listeners[symbol]) {
    listeners[symbol] = [];
  }

  listeners[symbol].push(callback);
}

function startWebSocket(symbols) {

  const streams = symbols
    .map(symbol => `${symbol.toLowerCase()}@kline_15m`)
    .join("/");

  const url =
    `wss://stream.binance.com:9443/stream?streams=${streams}`;

  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("🟢 Binance WebSocket connected");
  });

  ws.on("message", message => {

    try {

      const payload = JSON.parse(message);
      const data = payload.data;

      if (!data || data.e !== "kline") return;

      const symbol = data.s;
      const k = data.k;

      const candle = {
        time: k.t,
        open: +k.o,
        high: +k.h,
        low: +k.l,
        close: +k.c,
        volume: +k.v
      };

      if (!marketData[symbol]) {
        marketData[symbol] = [];
      }

      const candles = marketData[symbol];

      const last = candles[candles.length - 1];

      if (last && last.time === candle.time) {

        candles[candles.length - 1] = candle;

      } else {

        candles.push(candle);

        if (candles.length > 200) {
          candles.shift();
        }

      }

      // k.x = true عندما تغلق شمعة 15m
      if (k.x === true) {

        console.log(
          `[MARKET:${symbol}] 🕯️ 15m candle closed`
        );

        if (listeners[symbol]) {

          for (const callback of listeners[symbol]) {
            Promise.resolve(callback(candles))
              .catch(error => {
                console.error(
                  `[MARKET:${symbol}] Listener error:`,
                  error.message
                );
              });
          }

        }

      }

    } catch (error) {

      console.error(
        "❌ WebSocket message error:",
        error.message
      );

    }

  });

  ws.on("close", () => {

    console.log(
      "🔴 Binance WebSocket disconnected. Reconnecting..."
    );

    setTimeout(() => {
      startWebSocket(symbols);
    }, 5000);

  });

  ws.on("error", error => {

    console.error(
      "❌ Binance WebSocket error:",
      error.message
    );

  });

  return ws;
}

async function startMarketData(symbols) {

  for (const symbol of symbols) {
    await loadInitialData(symbol);
  }

  startWebSocket(symbols);
}

module.exports = {
  startMarketData,
  getData,
  subscribe
};