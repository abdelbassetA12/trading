const {
  marketOrder,
  takeProfitOrder,
  getCachedBalance,
  getExchangeInfo,
  cancelOrder,
  getOrder,
  refreshAccountState,
} = require("./binanceClient");

const { generateSignal } = require("../strategy");

const {
  openTrade,
  getActiveTrade,
  closeTrade,
} = require("./positionManager");


// ============================================================
// CONSTANTS
// ============================================================

const MAX_TRADE_AGE_MS =
  24 * 60 * 60 * 1000;

const timeoutClosingSymbols =
  new Set();


// ============================================================
// LOT SIZE
// ============================================================

function getLotSizeFilter(pairInfo) {
  return pairInfo?.filters?.find(
    (filter) =>
      filter.filterType === "LOT_SIZE"
  );
}


// ============================================================
// NORMALIZE QUANTITY
// ============================================================

function normalizeQuantity(
  quantity,
  stepSize
) {
  if (
    !Number.isFinite(
      Number(quantity)
    )
  ) {
    return 0;
  }

  if (
    !stepSize ||
    Number(stepSize) <= 0
  ) {
    return Number(quantity);
  }

  const step =
    Number(stepSize);

  const precision =
    Math.max(
      0,
      String(step)
        .split(".")[1]
        ?.length || 0
    );

  const normalized =
    Math.floor(
      Number(quantity) / step
    ) * step;

  return Number(
    normalized.toFixed(
      precision
    )
  );
}


// ============================================================
// AVERAGE FILL PRICE
// ============================================================

function getAverageFillPrice(order) {
  if (!order) {
    return 0;
  }

  if (
    Array.isArray(order.fills) &&
    order.fills.length > 0
  ) {
    let totalQuantity = 0;
    let totalQuote = 0;

    for (
      const fill
      of order.fills
    ) {
      const quantity =
        Number(
          fill.qty || 0
        );

      const price =
        Number(
          fill.price || 0
        );

      totalQuantity +=
        quantity;

      totalQuote +=
        quantity * price;
    }

    if (
      totalQuantity > 0 &&
      totalQuote > 0
    ) {
      return (
        totalQuote /
        totalQuantity
      );
    }
  }

  const executedQty =
    Number(
      order.executedQty || 0
    );

  const cumulativeQuote =
    Number(
      order.cummulativeQuoteQty || 0
    );

  if (
    executedQty > 0 &&
    cumulativeQuote > 0
  ) {
    return (
      cumulativeQuote /
      executedQty
    );
  }

  if (
    Number(order.averagePrice) > 0
  ) {
    return Number(
      order.averagePrice
    );
  }

  if (
    Number(order.price) > 0
  ) {
    return Number(
      order.price
    );
  }

  return 0;
}


// ============================================================
// WAIT FOR FREE BALANCE
// ============================================================

async function waitForFreeBalance(
  asset,
  requiredQuantity
) {
  for (
    let i = 0;
    i < 40;
    i++
  ) {
    const balance =
      getCachedBalance(
        asset
      );

    const free =
      Number(
        balance?.free || 0
      );

    if (
      free > 0 &&
      free >=
        Number(requiredQuantity) *
          0.99
    ) {
      return free;
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          250
        )
    );
  }

  const balance =
    getCachedBalance(
      asset
    );

  return Number(
    balance?.free || 0
  );
}


// ============================================================
// PROCESS TRADE
// ============================================================

async function processTrade(
  symbol,
  candles
) {
  try {
    if (
      getActiveTrade(symbol)
    ) {
      return;
    }

    if (
      !candles ||
      candles.length < 100
    ) {
      return;
    }

    const signal =
      generateSignal(
        candles
      );

    if (
      !signal ||
      signal.signal !==
        "BUY" ||
      !signal.trade
    ) {
      return;
    }

    const trade =
      signal.trade;

    const strategyEntry =
      Number(
        trade.entry
      );

    const strategyTakeProfit =
      Number(
        trade.takeProfit
      );

    if (
      !Number.isFinite(
        strategyEntry
      ) ||
      strategyEntry <= 0
    ) {
      return;
    }

    if (
      !Number.isFinite(
        strategyTakeProfit
      ) ||
      strategyTakeProfit <= 0
    ) {
      return;
    }

    // ========================================================
    // USDT BALANCE
    // ========================================================

    const usdtBalance =
      getCachedBalance(
        "USDT"
      );

    const freeUSDT =
      Number(
        usdtBalance?.free || 0
      );

    if (
      !Number.isFinite(
        freeUSDT
      ) ||
      freeUSDT <= 0
    ) {
      console.log(
        `[${symbol}] ⚠️ No free USDT`
      );

      return;
    }

    // ========================================================
    // EXCHANGE INFO
    // ========================================================

    const pairInfo =
      await getExchangeInfo(
        symbol
      );

    const lotSize =
      getLotSizeFilter(
        pairInfo
      );

    if (!lotSize) {
      throw new Error(
        `LOT_SIZE not found for ${symbol}`
      );
    }

    // ========================================================
    // CALCULATE BUY QUANTITY
    // ========================================================

    const amountToSpend =
      freeUSDT * 0.95;

    let quantity =
      amountToSpend /
      strategyEntry;

    quantity =
      normalizeQuantity(
        quantity,
        lotSize.stepSize
      );

    if (
      !Number.isFinite(
        quantity
      ) ||
      quantity <= 0
    ) {
      console.log(
        `[${symbol}] ⚠️ Invalid BUY quantity`
      );

      return;
    }

    if (
      lotSize.minQty &&
      quantity <
        Number(
          lotSize.minQty
        )
    ) {
      console.log(
        `[${symbol}] ⚠️ BUY quantity below minimum`
      );

      return;
    }

    // ========================================================
    // MARKET BUY
    // ========================================================

    console.log(
      `[${symbol}] 🟢 BUY MARKET | Quantity: ${quantity}`
    );

    const order =
      await marketOrder(
        symbol,
        "BUY",
        quantity
      );

    const executedQty =
      Number(
        order?.executedQty ||
          quantity
      );

    const actualEntry =
      getAverageFillPrice(
        order
      );

    if (
      !Number.isFinite(
        executedQty
      ) ||
      executedQty <= 0
    ) {
      throw new Error(
        `BUY executed quantity is invalid: ${executedQty}`
      );
    }

    if (
      !Number.isFinite(
        actualEntry
      ) ||
      actualEntry <= 0
    ) {
      throw new Error(
        `BUY actual entry price is invalid: ${actualEntry}`
      );
    }

    // ========================================================
    // CREATE TAKE PROFIT
    // ========================================================

    const tpOrder =
      await takeProfitOrder(
        symbol,
        executedQty,
        strategyTakeProfit
      );

    if (
      !tpOrder?.orderId
    ) {
      throw new Error(
        `TP order was not created for ${symbol}`
      );
    }

    // ========================================================
    // STORE ACTIVE TRADE
    // ========================================================

    const newTrade = {
      symbol,

      entry:
        actualEntry,

      strategyEntry,

      takeProfit:
        strategyTakeProfit,

      quantity:
        executedQty,

      buyOrderId:
        order.orderId,

      takeProfitOrderId:
        tpOrder.orderId,

      status:
        "OPEN",

      openedAt:
        Date.now(),
    };

    openTrade(
      newTrade
    );

    console.log(
      `[${symbol}] 📈 TRADE OPENED`
    );

    console.log(
      `[${symbol}] Entry: ${actualEntry}`
    );

    console.log(
      `[${symbol}] TP: ${strategyTakeProfit}`
    );

    console.log(
      `[${symbol}] Quantity: ${executedQty}`
    );

    console.log(
      `[${symbol}] ⏰ Timeout: 24 hours`
    );

    return newTrade;

  } catch (error) {
    console.error(
      `[${symbol}] ❌ processTrade error:`,
      error?.response?.data ||
        error?.message ||
        error
    );
  }
}


// ============================================================
// CLOSE TRADE AFTER 24 HOURS
// ============================================================

async function closeTradeByTimeout(
  symbol
) {
  if (
    timeoutClosingSymbols.has(
      symbol
    )
  ) {
    return null;
  }

  const trade =
    getActiveTrade(
      symbol
    );

  if (!trade) {
    return null;
  }

  if (
    !trade.openedAt
  ) {
    console.log(
      `[TIMEOUT:${symbol}] ⚠️ openedAt missing`
    );

    return null;
  }

  const age =
    Date.now() -
    Number(
      trade.openedAt
    );

  if (
    age <
    MAX_TRADE_AGE_MS
  ) {
    return null;
  }

  timeoutClosingSymbols.add(
    symbol
  );

  try {
    console.log(
      `[TIMEOUT:${symbol}] ⏰ 24 hours reached`
    );

    console.log(
      `[TIMEOUT:${symbol}] Entry: ${trade.entry}`
    );

    console.log(
      `[TIMEOUT:${symbol}] Original quantity: ${trade.quantity}`
    );

    // ========================================================
    // CHECK TP ORDER
    // ========================================================

    let tpOrder = null;

    if (
      trade.takeProfitOrderId
    ) {
      try {
        tpOrder =
          await getOrder(
            symbol,
            trade.takeProfitOrderId
          );

        console.log(
          `[TIMEOUT:${symbol}] TP status: ${tpOrder?.status}`
        );

      } catch (error) {
        console.error(
          `[TIMEOUT:${symbol}] ⚠️ Could not read TP order:`,
          error?.message ||
            error
        );
      }
    }

    // ========================================================
    // TP ALREADY FILLED
    // ========================================================

    if (
      tpOrder?.status ===
      "FILLED"
    ) {
      const exitPrice =
        getAverageFillPrice(
          tpOrder
        );

      if (
        exitPrice > 0
      ) {
        const closed =
          closeTrade(
            symbol,
            exitPrice,
            Date.now()
          );

        console.log(
          `[TIMEOUT:${symbol}] ✅ TP was already FILLED`
        );

        console.log(
          `[TIMEOUT:${symbol}] Exit: ${exitPrice}`
        );

        return closed;
      }

      return null;
    }

    // ========================================================
    // CALCULATE REMAINING QUANTITY
    // ========================================================

    let executedByTP =
      Number(
        tpOrder?.executedQty ||
          0
      );

    let remainingQuantity =
      Number(
        trade.quantity
      ) -
      executedByTP;

    if (
      !Number.isFinite(
        remainingQuantity
      )
    ) {
      remainingQuantity =
        Number(
          trade.quantity
        );
    }

    if (
      remainingQuantity <= 0
    ) {
      console.log(
        `[TIMEOUT:${symbol}] ⚠️ No remaining quantity`
      );

      return null;
    }

    // ========================================================
    // CANCEL TP
    // ========================================================

    if (
      trade.takeProfitOrderId &&
      (
        !tpOrder ||
        tpOrder.status ===
          "NEW" ||
        tpOrder.status ===
          "PARTIALLY_FILLED"
      )
    ) {
      console.log(
        `[TIMEOUT:${symbol}] ❌ Cancelling TP order ${trade.takeProfitOrderId}`
      );

      try {
        await cancelOrder(
          symbol,
          trade.takeProfitOrderId
        );
      } catch (error) {
        console.error(
          `[TIMEOUT:${symbol}] ⚠️ TP cancel failed:`,
          error?.message ||
            error
        );

        // ====================================================
        // CHECK AGAIN
        // ====================================================

        try {
          const latestTP =
            await getOrder(
              symbol,
              trade.takeProfitOrderId
            );

          if (
            latestTP?.status ===
            "FILLED"
          ) {
            const exitPrice =
              getAverageFillPrice(
                latestTP
              );

            if (
              exitPrice > 0
            ) {
              const closed =
                closeTrade(
                  symbol,
                  exitPrice,
                  Date.now()
                );

              console.log(
                `[TIMEOUT:${symbol}] ✅ TP filled while cancelling`
              );

              return closed;
            }
          }

          if (
            latestTP?.status !==
              "CANCELED" &&
            latestTP?.status !==
              "EXPIRED"
          ) {
            console.log(
              `[TIMEOUT:${symbol}] 🛑 TP state is uncertain. Market SELL cancelled for safety.`
            );

            return null;
          }

        } catch (checkError) {
          console.error(
            `[TIMEOUT:${symbol}] 🛑 Could not verify TP state. No market sell will be sent.`
          );

          return null;
        }
      }
    }

    // ========================================================
    // REFRESH ACCOUNT
    // ========================================================

    await refreshAccountState();

    // ========================================================
    // GET BASE ASSET
    // ========================================================

    const pairInfo =
      await getExchangeInfo(
        symbol
      );

    const baseAsset =
      pairInfo?.baseAsset;

    if (!baseAsset) {
      throw new Error(
        `Could not determine base asset for ${symbol}`
      );
    }

    // ========================================================
    // WAIT FOR BALANCE TO BE RELEASED
    // ========================================================

    console.log(
      `[TIMEOUT:${symbol}] ⏳ Waiting for TP quantity to become free...`
    );

    const freeBalance =
      await waitForFreeBalance(
        baseAsset,
        remainingQuantity
      );

    console.log(
      `[TIMEOUT:${symbol}] Free ${baseAsset}: ${freeBalance}`
    );

    // ========================================================
    // FINAL QUANTITY
    // ========================================================

    const lotSize =
      getLotSizeFilter(
        pairInfo
      );

    let quantityToSell =
      Math.min(
        remainingQuantity,
        Number(
          freeBalance
        )
      );

    quantityToSell =
      normalizeQuantity(
        quantityToSell,
        lotSize?.stepSize
      );

    if (
      !Number.isFinite(
        quantityToSell
      ) ||
      quantityToSell <= 0
    ) {
      console.log(
        `[TIMEOUT:${symbol}] 🛑 Nothing available to sell`
      );

      return null;
    }

    if (
      lotSize?.minQty &&
      quantityToSell <
        Number(
          lotSize.minQty
        )
    ) {
      console.log(
        `[TIMEOUT:${symbol}] 🛑 Quantity ${quantityToSell} is below Binance minimum ${lotSize.minQty}`
      );

      return null;
    }

    // ========================================================
    // MARKET SELL
    // ========================================================

    console.log(
      `[TIMEOUT:${symbol}] 🔴 MARKET SELL`
    );

    console.log(
      `[TIMEOUT:${symbol}] Quantity: ${quantityToSell}`
    );

    const sellOrder =
      await marketOrder(
        symbol,
        "SELL",
        quantityToSell
      );

    // ========================================================
    // ACTUAL EXIT PRICE
    // ========================================================

    const exitPrice =
      getAverageFillPrice(
        sellOrder
      );

    if (
      !Number.isFinite(
        exitPrice
      ) ||
      exitPrice <= 0
    ) {
      console.error(
        `[TIMEOUT:${symbol}] ⚠️ Market SELL executed but exit price could not be determined`
      );

      return null;
    }

    // ========================================================
    // CLOSE INTERNAL TRADE
    // ========================================================

    const closedTrade =
      closeTrade(
        symbol,
        exitPrice,
        Date.now()
      );

    console.log(
      `[TIMEOUT:${symbol}] ✅ TRADE CLOSED AFTER 24 HOURS`
    );

    console.log(
      `[TIMEOUT:${symbol}] Entry: ${trade.entry}`
    );

    console.log(
      `[TIMEOUT:${symbol}] Exit: ${exitPrice}`
    );

    console.log(
      `[TIMEOUT:${symbol}] Profit: ${closedTrade?.profit}`
    );

    return closedTrade;

  } catch (error) {
    console.error(
      `[TIMEOUT:${symbol}] ❌ Timeout close error:`,
      error?.response?.data ||
        error?.message ||
        error
    );

    return null;

  } finally {
    timeoutClosingSymbols.delete(
      symbol
    );
  }
}


// ============================================================
// CHECK EXPIRED TRADES
// ============================================================

async function checkExpiredTrades() {
  const {
    getActiveTrades,
  } = require(
    "./positionManager"
  );

  const activeTrades =
    getActiveTrades();

  if (
    !activeTrades ||
    activeTrades.length === 0
  ) {
    return;
  }

  for (
    const trade
    of activeTrades
  ) {
    if (
      !trade?.symbol ||
      !trade?.openedAt
    ) {
      continue;
    }

    const age =
      Date.now() -
      Number(
        trade.openedAt
      );

    if (
      age >=
      MAX_TRADE_AGE_MS
    ) {
      await closeTradeByTimeout(
        trade.symbol
      );
    }
  }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  processTrade,
  closeTradeByTimeout,
  checkExpiredTrades,
};


/*
const {
  marketOrder,
  takeProfitOrder,
  getCachedBalance,
  getExchangeInfo,
} = require("./binanceClient");

const {
  generateSignal,
} = require("../strategy");

const {
  openTrade,
  getActiveTrade,
} = require("./positionManager");

function getLotSizeFilter(
  pairInfo
) {
  if (!pairInfo?.filters) {
    return null;
  }

  return pairInfo.filters.find(
    (filter) =>
      filter.filterType ===
      "LOT_SIZE"
  );
}

function normalizeQuantity(
  quantity,
  stepSize
) {
  if (!stepSize || stepSize <= 0) {
    return quantity;
  }

  const precision =
    Math.max(
      0,
      Math.round(
        Math.log10(1 / stepSize)
      )
    );

  const normalized =
    Math.floor(
      quantity / stepSize
    ) * stepSize;

  return Number(
    normalized.toFixed(precision)
  );
}

function getAverageFillPrice(
  order
) {
  if (
    order?.fills &&
    order.fills.length > 0
  ) {
    let totalQty = 0;
    let totalValue = 0;

    for (const fill of order.fills) {
      const qty = Number(
        fill.qty || 0
      );

      const price = Number(
        fill.price || 0
      );

      totalQty += qty;
      totalValue +=
        qty * price;
    }

    if (totalQty > 0) {
      return (
        totalValue / totalQty
      );
    }
  }

  if (
    Number(order?.executedQty) > 0 &&
    Number(order?.cummulativeQuoteQty) >
      0
  ) {
    return (
      Number(
        order.cummulativeQuoteQty
      ) /
      Number(order.executedQty)
    );
  }

  return Number(
    order?.price || 0
  );
}

async function processTrade(
  symbol,
  candles
) {
  if (getActiveTrade(symbol)) {
    return;
  }

  if (
    !candles ||
    candles.length < 100
  ) {
    return;
  }

  const {
    signal,
    trade,
  } = generateSignal(candles);

  if (signal !== "BUY") {
    return;
  }

  if (!trade) {
    return;
  }

  try {
    const usdtBalance =
      getCachedBalance("USDT");

    const freeUSDT = Number(
      usdtBalance.free || 0
    );

    if (freeUSDT <= 0) {
      console.log(
        `[TRADER:${symbol}] ⚠️ No free USDT`
      );

      return;
    }

    const pairInfo =
      await getExchangeInfo(symbol);

    const lotFilter =
      getLotSizeFilter(
        pairInfo
      );

    if (!lotFilter) {
      console.error(
        `[TRADER:${symbol}] ❌ LOT_SIZE filter not found`
      );

      return;
    }

    const minQty = Number(
      lotFilter.minQty
    );

    const stepSize = Number(
      lotFilter.stepSize
    );

    const strategyEntry =
      Number(trade.entry);

    if (
      !strategyEntry ||
      strategyEntry <= 0
    ) {
      console.error(
        `[TRADER:${symbol}] ❌ Invalid strategy entry`
      );

      return;
    }

    let quantity =
      (freeUSDT * 0.95) /
      strategyEntry;

    if (quantity < minQty) {
      console.log(
        `[TRADER:${symbol}] ⚠️ Quantity below minimum`
      );

      return;
    }

    quantity =
      normalizeQuantity(
        quantity,
        stepSize
      );

    if (
      !quantity ||
      quantity < minQty
    ) {
      console.log(
        `[TRADER:${symbol}] ⚠️ Normalized quantity invalid`
      );

      return;
    }

    console.log(
      `[TRADER:${symbol}] 🟢 BUY ${quantity}`
    );

    const order =
      await marketOrder(
        symbol,
        "BUY",
        quantity
      );

    if (!order) {
      throw new Error(
        "BUY order returned empty result"
      );
    }

    const executedQty =
      Number(
        order.executedQty ||
          quantity
      );

    const actualEntry =
      getAverageFillPrice(
        order
      );

    if (
      !actualEntry ||
      actualEntry <= 0
    ) {
      throw new Error(
        "Unable to determine actual fill price"
      );
    }

    const strategyTakeProfit =
      Number(
        trade.takeProfit
      );

    let takeProfit =
      strategyTakeProfit;

    if (
      !takeProfit ||
      takeProfit <= actualEntry
    ) {
      console.log(
        `[TRADER:${symbol}] ⚠️ Strategy TP is invalid relative to actual entry`
      );

      return;
    }

    const tpOrder =
      await takeProfitOrder(
        symbol,
        executedQty,
        takeProfit
      );

    if (!tpOrder) {
      throw new Error(
        "TP order was not created"
      );
    }

    const newTrade = {
      symbol,

      entry:
        actualEntry,

      strategyEntry,

      takeProfit,

      quantity:
        executedQty,

      buyOrderId:
        order.orderId,

      takeProfitOrderId:
        tpOrder.orderId,

      status: "OPEN",

      openedAt:
        Date.now(),
    };

    openTrade(newTrade);

    console.log(
      "✅ BUY EXECUTED:",
      newTrade
    );
  } catch (error) {
    console.error(
      `[TRADER:${symbol}] ❌ Failed:`,
      error?.response?.data ||
        error.message ||
        error
    );
  }
}

module.exports = {
  processTrade,
};

*/