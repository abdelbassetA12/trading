const express = require("express");

const router =
  express.Router();

const {
  marketOrder,
  getExchangeInfo
} = require("./binanceClient");


// ============================================================
// CONVERT
// ============================================================

router.post(
  "/convert",
  async (req, res) => {
    try {
      const {
        fromAsset,
        toAsset,
        amount
      } = req.body;


      // ========================================================
      // VALIDATION
      // ========================================================

      if (
        !fromAsset ||
        !toAsset ||
        amount === undefined ||
        amount === null
      ) {
        return res.status(400).json({
          error:
            "Missing params"
        });
      }


      const normalizedFrom =
        String(
          fromAsset
        )
          .toUpperCase()
          .trim();


      const normalizedTo =
        String(
          toAsset
        )
          .toUpperCase()
          .trim();


      const numericAmount =
        Number(amount);


      if (
        !Number.isFinite(
          numericAmount
        ) ||
        numericAmount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid amount"
        });
      }


      if (
        normalizedFrom ===
        normalizedTo
      ) {
        return res.status(400).json({
          error:
            "Source and destination assets cannot be the same"
        });
      }


      let symbol;
      let side;


      // ========================================================
      // ASSET → USDT
      // ========================================================

      if (
        normalizedTo ===
        "USDT"
      ) {
        symbol =
          normalizedFrom +
          "USDT";

        side = "SELL";
      }


      // ========================================================
      // USDT → ASSET
      // ========================================================

      else if (
        normalizedFrom ===
        "USDT"
      ) {
        symbol =
          normalizedTo +
          "USDT";

        side = "BUY";
      }


      // ========================================================
      // OTHER PAIRS
      // ========================================================

      else {
        return res.status(400).json({
          error:
            "Only USDT pairs are supported currently"
        });
      }


      // ========================================================
      // VERIFY PAIR
      // ========================================================

      const exchangeInfo =
        await getExchangeInfo(
          symbol
        );


      if (
        !exchangeInfo ||
        exchangeInfo.status !==
          "TRADING"
      ) {
        return res.status(400).json({
          error:
            `${symbol} is not available for trading`
        });
      }


      // ========================================================
      // BUY
      // ========================================================
      //
      // Example:
      //
      // fromAsset = USDT
      // toAsset   = BTC
      // amount    = 100
      //
      // This means:
      //
      // "Spend 100 USDT to buy BTC"
      //
      // NOT:
      //
      // "Buy 100 BTC"
      //
      // ========================================================

      let order;


      if (
        side === "BUY"
      ) {
        order =
          await marketOrder(
            symbol,
            "BUY",
            null,
            {
              quoteOrderQty:
                numericAmount
            }
          );
      }


      // ========================================================
      // SELL
      // ========================================================
      //
      // Example:
      //
      // fromAsset = BTC
      // toAsset   = USDT
      // amount    = 0.001
      //
      // Here amount means:
      //
      // "Sell 0.001 BTC"
      //
      // ========================================================

      else {
        order =
          await marketOrder(
            symbol,
            "SELL",
            numericAmount
          );
      }


      // ========================================================
      // RESPONSE
      // ========================================================

      return res.json({
        success: true,

        symbol,

        side,

        fromAsset:
          normalizedFrom,

        toAsset:
          normalizedTo,

        amount:
          numericAmount,

        order
      });


    } catch (err) {
      console.error(
        "Convert Error:",
        err?.response?.data ||
        err?.message ||
        err
      );


      return res.status(500).json({
        success: false,

        error:
          err?.response?.data ||
          err?.message ||
          "Conversion failed"
      });
    }
  }
);


module.exports = router;

/*

const express = require("express");

const router =
  express.Router();

const {
  marketOrder,
} = require("./binanceClient");

router.post(
  "/convert",
  async (req, res) => {
    try {
      const {
        fromAsset,
        toAsset,
        amount,
      } = req.body;

      if (
        !fromAsset ||
        !toAsset ||
        !amount
      ) {
        return res.status(400).json({
          error:
            "Missing params",
        });
      }

      const normalizedFrom =
        String(
          fromAsset
        ).toUpperCase();

      const normalizedTo =
        String(
          toAsset
        ).toUpperCase();

      const numericAmount =
        Number(amount);

      if (
        !Number.isFinite(
          numericAmount
        ) ||
        numericAmount <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid amount",
        });
      }

      let symbol;
      let side;

      if (
        normalizedTo ===
        "USDT"
      ) {
        symbol =
          normalizedFrom +
          "USDT";

        side = "SELL";
      } else if (
        normalizedFrom ===
        "USDT"
      ) {
        symbol =
          normalizedTo +
          "USDT";

        side = "BUY";
      } else {
        return res.status(400).json({
          error:
            "Only USDT pairs supported حاليا",
        });
      }

      const order =
        await marketOrder(
          symbol,
          side,
          numericAmount
        );

      res.json({
        success: true,
        symbol,
        side,
        amount:
          numericAmount,
        order,
      });
    } catch (err) {
      console.error(
        "Convert Error:",
        err.message
      );

      res.status(500).json({
        error:
          err.message ||
          "Conversion failed",
      });
    }
  }
);

module.exports = router;
*/