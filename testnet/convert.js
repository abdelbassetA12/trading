// routes/convert.js
const express = require("express");
const router = express.Router();
const { marketOrder } = require("./binanceClient");

router.post("/convert", async (req, res) => {
  try {
    const { fromAsset, toAsset, amount } = req.body;

    if (!fromAsset || !toAsset || !amount) {
      return res.status(400).json({ error: "Missing params" });
    }

    let symbol, side;

    if (toAsset === "USDT") {
      // SELL
      symbol = fromAsset + "USDT";
      side = "SELL";
    } else if (fromAsset === "USDT") {
      // BUY
      symbol = toAsset + "USDT";
      side = "BUY";
    } else {
      return res.status(400).json({
        error: "Only USDT pairs supported حاليا"
      });
    }

    const order = await marketOrder(symbol, side, amount);

    res.json({
      success: true,
      symbol,
      side,
      amount,
      order
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

module.exports = router;