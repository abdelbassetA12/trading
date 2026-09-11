const WebSocket = require("ws");

const {
  getKlines,
} = require("./binanceClient");

const marketData = {};
const listeners = {};
const sockets = {};

const MAX_CANDLES = 200;

function convertKline(c) {
  return {
    time: Number(c[0]),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5]),
  };
}

async function loadInitialData(symbol) {
  try {
    const data = await getKlines(
      symbol,
      "15m",
      MAX_CANDLES
    );

    marketData[symbol] = data.map(convertKline);

    console.log(
      `[MARKET:${symbol}] ✅ Loaded ${marketData[symbol].length} candles through WebSocket API`
    );

    return marketData[symbol];
  } catch (error) {
    console.error(
      `[MARKET:${symbol}] ❌ Initial data failed:`,
      error.message
    );

    if (!marketData[symbol]) {
      marketData[symbol] = [];
    }

    return marketData[symbol];
  }
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

function notifyListeners(symbol) {
  if (!listeners[symbol]) {
    return;
  }

  const candles = marketData[symbol] || [];

  for (const callback of listeners[symbol]) {
    Promise.resolve(callback(candles)).catch(
      (error) => {
        console.error(
          `[MARKET:${symbol}] Listener error:`,
          error.message
        );
      }
    );
  }
}

function startWebSocket(symbols) {
  const streams = symbols
    .map(
      (symbol) =>
        `${symbol.toLowerCase()}@kline_15m`
    )
    .join("/");

  const url =
    `wss://stream.binance.com:9443/stream?streams=${streams}`;

  const ws = new WebSocket(url);

  sockets.main = ws;

  ws.on("open", () => {
    console.log(
      "🟢 Binance Market WebSocket connected"
    );
  });

  ws.on("message", (message) => {
    try {
      const payload = JSON.parse(
        message.toString()
      );

      const data = payload?.data;

      if (!data || data.e !== "kline") {
        return;
      }

      const symbol = data.s;
      const k = data.k;

      const candle = {
        time: Number(k.t),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
      };

      if (!marketData[symbol]) {
        marketData[symbol] = [];
      }

      const candles = marketData[symbol];

      const last =
        candles[candles.length - 1];

      if (
        last &&
        last.time === candle.time
      ) {
        candles[candles.length - 1] =
          candle;
      } else {
        candles.push(candle);

        if (
          candles.length >
          MAX_CANDLES
        ) {
          candles.shift();
        }
      }

      if (k.x === true) {
        console.log(
          `[MARKET:${symbol}] 🕯️ 15m candle closed`
        );

        notifyListeners(symbol);
      }
    } catch (error) {
      console.error(
        "❌ Market WebSocket message error:",
        error.message
      );
    }
  });

  ws.on("close", () => {
    console.log(
      "🔴 Binance Market WebSocket disconnected. Reconnecting..."
    );

    sockets.main = null;

    setTimeout(() => {
      startWebSocket(symbols);
    }, 5000);
  });

  ws.on("error", (error) => {
    console.error(
      "❌ Binance Market WebSocket error:",
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

function getMarketStatus() {
  const result = {};

  for (const symbol of Object.keys(
    marketData
  )) {
    result[symbol] = {
      candles: marketData[symbol].length,
      lastCandle:
        marketData[symbol][
          marketData[symbol].length - 1
        ] || null,
    };
  }

  return result;
}

module.exports = {
  startMarketData,
  getData,
  subscribe,
  getMarketStatus,
};