const { generateSignal } = require("./strategy");

function replaySignals(data) {
  let signals = [];

  for (let i = 100; i < data.length; i++) {
    const slice = data.slice(0, i + 1);
    const { signal, trade } = generateSignal(slice);

    const candle = data[i];

    // فقط إشارات حقيقية
    if (signal === "BUY" || signal === "SELL") {
      signals.push({
        type: signal,
        time: candle.time,
        price: trade.entry,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit
      });
    }
  }

  return signals;
}

module.exports = { replaySignals };