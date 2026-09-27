const {
  startMarketData,
  subscribe,
} = require("./marketData");

const {
  processTrade,
  checkExpiredTrades,
} = require("./trader");

const {
  updateTrades,
  getActiveTrade,
} = require("./positionManager");

let started = false;

let timeoutCheckerStarted =
  false;


// ============================================================
// START TIMEOUT CHECKER
// ============================================================

function startTimeoutChecker() {
  if (
    timeoutCheckerStarted
  ) {
    return;
  }

  timeoutCheckerStarted =
    true;

  console.log(
    "⏰ 24h trade timeout checker started"
  );

  setInterval(
    async () => {
      try {
        await checkExpiredTrades();
      } catch (error) {
        console.error(
          "❌ Timeout checker error:",
          error?.response?.data ||
            error?.message ||
            error
        );
      }
    },
    60 * 1000
  );
}


// ============================================================
// RUN
// ============================================================

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

  // ==========================================================
  // START 24H CHECKER
  // ==========================================================

  startTimeoutChecker();

  // ==========================================================
  // CHECK ONCE IMMEDIATELY
  // ==========================================================

  try {
    await checkExpiredTrades();
  } catch (error) {
    console.error(
      "❌ Initial timeout check error:",
      error?.message ||
        error
    );
  }

  // ==========================================================
  // MARKET DATA LISTENERS
  // ==========================================================

  for (
    const symbol
    of symbols
  ) {
    subscribe(
      symbol,
      async (data) => {
        try {
          if (
            !data ||
            data.length < 100
          ) {
            console.log(
              `[RUNNER:${symbol}] ⚠️ Not enough data: ${
                data?.length || 0
              }/100`
            );

            return;
          }

          // ==================================================
          // CHECK ACTIVE TRADE
          // ==================================================

          let activeTrade =
            getActiveTrade(
              symbol
            );

          // ==================================================
          // LOOK FOR NEW TRADE
          // ==================================================

          if (!activeTrade) {
            await processTrade(
              symbol,
              data
            );
          }

          // ==================================================
          // UPDATE ACTIVE TRADE
          // ==================================================

          activeTrade =
            getActiveTrade(
              symbol
            );

          const lastCandle =
            data[
              data.length - 1
            ];

          if (
            activeTrade
          ) {
            await updateTrades(
              lastCandle,
              activeTrade
            );
          }

          // ==================================================
          // LOG ACTIVE TRADE
          // ==================================================

          const updatedTrade =
            getActiveTrade(
              symbol
            );

          if (
            updatedTrade
          ) {
            console.log(
              `[RUNNER:${symbol}] 📊 ACTIVE:`,
              updatedTrade
            );
          }

        } catch (error) {
          console.error(
            `[RUNNER:${symbol}] ❌`,
            error?.response?.data ||
              error?.message ||
              error
          );
        }
      }
    );
  }

  // ==========================================================
  // START MARKET DATA
  // ==========================================================

  await startMarketData(
    symbols
  );

  console.log(
    "🚀 Trading runner started for:",
    symbols.join(", ")
  );
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  run,
};



/*
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



*/



 