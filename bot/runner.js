 
const {
  startMarketData,
  subscribe,
} = require("./marketData");

const {
  processTrade,
} = require("./trader");

const {
  updateTrades,
  getActiveTrade,
} = require("./positionManager");

let started = false;

async function run(
  symbols = ["BTCUSDT"]
) {
  if (started) {
    console.log(
      "⚠️ Trading runner already started"
    );

    return;
  }

  started = true;

  for (const symbol of symbols) {
    subscribe(
      symbol,
      async (data) => {
        try {
          if (
            !data ||
            data.length < 100
          ) {
            console.log(
              `[RUNNER:${symbol}] ⚠️ Not enough data: ${data?.length || 0}/100`
            );

            return;
          }

          let activeTrade =
            getActiveTrade(symbol);

          if (!activeTrade) {
            await processTrade(
              symbol,
              data
            );
          }

          activeTrade =
            getActiveTrade(symbol);

          const lastCandle =
            data[data.length - 1];

          if (activeTrade) {
            await updateTrades(
              lastCandle,
              activeTrade
            );
          }

          const updatedTrade =
            getActiveTrade(symbol);

          if (updatedTrade) {
            console.log(
              `[RUNNER:${symbol}] 📊 ACTIVE:`,
              updatedTrade
            );
          }
        } catch (error) {
          console.error(
            `[RUNNER:${symbol}] ❌`,
            error?.response?.data ||
              error.message ||
              error
          );
        }
      }
    );
  }

  await startMarketData(
    symbols
  );

  console.log(
    "🚀 Trading runner started for:",
    symbols.join(", ")
  );
}

module.exports = {
  run,
};



 



 