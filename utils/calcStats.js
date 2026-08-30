// utils/calcStats.js
module.exports = (trades) => {
  let total = trades.length;
  let wins = trades.filter(t => t.result > 0);
  let losses = trades.filter(t => t.result < 0);

  let winrate = total ? (wins.length / total) * 100 : 0;

  let totalProfit = wins.reduce((a, t) => a + t.result, 0);
  let totalLoss = losses.reduce((a, t) => a + t.result, 0);

  let avgWin = wins.length ? totalProfit / wins.length : 0;
  let avgLoss = losses.length ? totalLoss / losses.length : 0;

  let rr = Math.abs(avgWin / avgLoss || 0);

  let expectancy = (winrate / 100 * avgWin) - ((1 - winrate / 100) * Math.abs(avgLoss));

  let balance = 0, peak = 0, maxDD = 0;
  let equity = [];

  trades.forEach((t, i) => {
    balance += t.result;
    peak = Math.max(peak, balance);
    let dd = peak - balance;
    if (dd > maxDD) maxDD = dd;

    equity.push({ index: i, equity: balance, drawdown: dd });
  });

  return {
    total,
    winrate,
    totalProfit,
    totalLoss,
    avgWin,
    avgLoss,
    rr,
    expectancy,
    maxDrawdown: maxDD,
    equity
  };
};
