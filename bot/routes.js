const express = require("express");

const router =
  express.Router();

const {
  getTradesIncludingActive,
} = require("./positionManager");

const {
  getAccount,
  getAccountState,
  getCachedBalances,
  getCachedOpenOrders,
  getMyTrades,
  getAllOrders,
  cancelOrder,
  createLimitOrder,
} = require("./binanceClient");

function formatTrades(trades) {
  const results = [];

  let current = null;

  const sortedTrades = [
    ...trades,
  ].sort(
    (a, b) =>
      Number(a.time || 0) -
      Number(b.time || 0)
  );

  sortedTrades.forEach((t) => {
    if (t.isBuyer) {
      current = {
        symbol: t.symbol,
        entry: parseFloat(
          t.price
        ),
        qty: parseFloat(
          t.qty
        ),
        entryTime: t.time,
        status: "OPEN",
      };
    } else if (current) {
      const exitTime =
        t.time;

      const exitPrice =
        parseFloat(
          t.price
        );

      const profit =
        (exitPrice -
          current.entry) *
        current.qty;

      results.push({
        ...current,

        exit: exitPrice,

        exitTime,

        profit,

        duration: Math.round(
          (exitTime -
            current.entryTime) /
            60000
        ),

        status: "CLOSED",

        result:
          exitPrice >
          current.entry
            ? "WIN"
            : "LOSS",
      });

      current = null;
    }
  });

  return results;
}

router.get(
  "/trades",
  (req, res) => {
    res.json(
      getTradesIncludingActive()
    );
  }
);

router.get(
  "/balance",
  async (req, res) => {
    try {
      const cachedBalances =
        getCachedBalances();

      if (
        cachedBalances.length > 0
      ) {
        return res.json(
          cachedBalances.filter(
            (balance) =>
              Number(
                balance.free
              ) > 0 ||
              Number(
                balance.locked
              ) > 0
          )
        );
      }

      const account =
        await getAccount();

      const balances =
        account.balances.filter(
          (b) =>
            parseFloat(
              b.free
            ) > 0 ||
            parseFloat(
              b.locked
            ) > 0
        );

      res.json(balances);
    } catch (err) {
      console.error(
        "Error fetching balance:",
        err.message || err
      );

      res.status(500).json({
        error:
          "Failed to fetch balance",
      });
    }
  }
);

router.get(
  "/account-state",
  async (req, res) => {
    try {
      const state =
        getAccountState();

      if (
        state.balances.length ===
          0 &&
        state.orders.length === 0
      ) {
        await getAccount();
      }

      res.json(
        getAccountState()
      );
    } catch (error) {
      console.error(
        "Account state error:",
        error.message
      );

      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

router.get(
  "/trades/:symbol",
  async (req, res) => {
    try {
      const raw =
        await getMyTrades(
          req.params.symbol
        );

      const formatted =
        formatTrades(raw);

      res.json(formatted);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

router.get(
  "/trades-all",
  async (req, res) => {
    try {
      const symbols = [
        "BTCUSDT",
        "ETHUSDT",
        "SOLUSDT",
      ];

      let allTrades = [];

      for (const symbol of symbols) {
        const raw =
          await getMyTrades(
            symbol
          );

        const formatted =
          formatTrades(raw);

        allTrades = [
          ...allTrades,
          ...formatted,
        ];
      }

      allTrades.sort(
        (a, b) =>
          b.entryTime -
          a.entryTime
      );

      res.json(allTrades);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

router.get(
  "/pending-orders/:symbol",
  async (req, res) => {
    try {
      const symbol =
        req.params.symbol;

      const cached =
        getCachedOpenOrders();

      const filtered =
        cached.filter(
          (order) =>
            order.symbol ===
              symbol &&
            (
              order.status ===
                "NEW" ||
              order.status ===
                "PARTIALLY_FILLED"
            )
        );

      if (filtered.length > 0) {
        return res.json(
          filtered
        );
      }

      const orders =
        await getAllOrders(
          symbol
        );

      const pending =
        orders.filter(
          (o) =>
            o.status === "NEW" ||
            o.status ===
              "PARTIALLY_FILLED"
        );

      res.json(pending);
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

router.get(
  "/open-orders",
  async (req, res) => {
    try {
      const cached =
        getCachedOpenOrders();

      if (
        cached.length > 0
      ) {
        return res.json(
          cached
        );
      }

      const orders =
        await require(
          "./binanceClient"
        ).getAllOpenOrders();

      res.json(orders);
    } catch (err) {
      console.error(
        "OpenOrders Error:",
        err.message
      );

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

router.delete(
  "/cancel-order",
  async (req, res) => {
    try {
      const {
        symbol,
        orderId,
      } = req.body;

      if (
        !symbol ||
        !orderId
      ) {
        return res
          .status(400)
          .json({
            error:
              "Missing params",
          });
      }

      const result =
        await cancelOrder(
          symbol,
          orderId
        );

      res.json({
        success: true,
        result,
      });
    } catch (err) {
      console.error(
        "Cancel API Error:",
        err.message
      );

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

router.post(
  "/modify-order",
  async (req, res) => {
    try {
      const {
        symbol,
        orderId,
        price,
        quantity,
        side,
      } = req.body;

      if (
        !symbol ||
        !orderId ||
        !price
      ) {
        return res
          .status(400)
          .json({
            error:
              "Missing params",
          });
      }

      await cancelOrder(
        symbol,
        orderId
      );

      const newOrder =
        await createLimitOrder(
          symbol,
          side,
          quantity,
          price
        );

      res.json({
        success: true,
        newOrder,
      });
    } catch (err) {
      console.error(
        "Modify Error:",
        err.message
      );

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

module.exports = router;