let trades = [];
let activeTrades = {};

async function updateTrades(
  candle,
  trade
) {
  if (!trade) {
    return null;
  }

  if (
    trade.takeProfit &&
    candle &&
    Number(candle.high) >=
      Number(trade.takeProfit)
  ) {
    trade.status = "CLOSED";
    trade.exit = Number(
      trade.takeProfit
    );
    trade.exitTime = candle.time;

    const profit =
      (trade.exit - trade.entry) *
      trade.quantity;

    trade.profit = profit;

    trades.push({
      ...trade,
    });

    delete activeTrades[
      trade.symbol
    ];

    console.log(
      `💰 [${trade.symbol}] Trade closed | Profit: ${profit}`
    );

    return null;
  }

  return trade;
}

function openTrade(trade) {
  if (!trade || !trade.symbol) {
    return;
  }

  activeTrades[trade.symbol] = {
    ...trade,
  };

  console.log(
    `📈 [${trade.symbol}] Active trade stored`
  );
}

function closeTrade(
  symbol,
  exitPrice,
  exitTime
) {
  const trade =
    activeTrades[symbol];

  if (!trade) {
    return null;
  }

  const profit =
    (Number(exitPrice) -
      Number(trade.entry)) *
    Number(trade.quantity);

  const closedTrade = {
    ...trade,
    exit: Number(exitPrice),
    exitTime,
    profit,
    status: "CLOSED",
  };

  trades.push(closedTrade);

  delete activeTrades[symbol];

  return closedTrade;
}

function getActiveTrade(symbol) {
  return activeTrades[symbol];
}

function getActiveTrades() {
  return Object.values(activeTrades);
}

function getTradesIncludingActive() {
  return [
    ...Object.values(activeTrades),
    ...trades,
  ];
}

function getHistoricalTrades() {
  return [...trades];
}

function removeActiveTrade(symbol) {
  delete activeTrades[symbol];
}

module.exports = {
  openTrade,
  closeTrade,
  updateTrades,
  getActiveTrade,
  getActiveTrades,
  getTradesIncludingActive,
  getHistoricalTrades,
  removeActiveTrade,
};