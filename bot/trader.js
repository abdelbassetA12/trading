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