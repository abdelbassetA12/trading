

//const { marketOrder } = require("./binanceClient");

let trades = [];
let activeTrades = {};

async function updateTrades(candle, trade) {
  if (!trade) return null;

   
  return trade;
}

function openTrade(trade) {
  activeTrades[trade.symbol] = trade;
}

function getActiveTrade(symbol) {
  return activeTrades[symbol];
}

function getTradesIncludingActive() {
  return [
    ...Object.values(activeTrades),
    ...trades
  ];
}

module.exports = {
  openTrade,
  updateTrades,
  getTradesIncludingActive,
  getActiveTrade
};

