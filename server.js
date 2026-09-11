 // ============================================================
// 1. ENVIRONMENT & CORE IMPORTS
// ============================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const {
  getData: getMarketData,
  getHistoricalData
} = require("./bot/marketData");


// ============================================================
// 2. TRADING SYSTEM IMPORTS
// ============================================================

const { generateSignal } = require("./bot/strategy");

const { replayBacktest } = require("./backtest");

const { replaySignals } = require("./signalReplay");


// ============================================================
// 3. REAL / TESTNET TRADING
// ============================================================

const { run } = require("./bot/runner");

const testnetRoutes = require("./bot/routes");

const convertRoute = require("./bot/convert");


// ============================================================
// 4. OTHER APPLICATION ROUTES
// ============================================================

const tradeRoutes = require("./routes/trades");

const authRoutes = require("./routes/auth");

const profileRoutes = require("./routes/profile");


// ============================================================
// 5. EXPRESS APP
// ============================================================

const app = express();

app.use(express.json());

app.use(cookieParser());


// ============================================================
// 6. CORS
// ============================================================

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true
  })
);


// ============================================================
// 7. HTTP SERVER
// ============================================================

const server = http.createServer(app);

const PORT = process.env.PORT || 5000;


// ============================================================
// 8. SYMBOLS USED BY THE TRADING SYSTEM
// ============================================================

const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT"
];


// ============================================================
// 9. APPLICATION ROUTES
// ============================================================

// ------------------------------------------------------------
// Currency conversion
// ------------------------------------------------------------

app.use("/api", convertRoute);


// ------------------------------------------------------------
// Testnet trading API
// ------------------------------------------------------------

app.use("/api/testnet", testnetRoutes);


// ------------------------------------------------------------
// MongoDB trades
// ------------------------------------------------------------

app.use("/api/trades", tradeRoutes);


// ------------------------------------------------------------
// Authentication
// ------------------------------------------------------------

app.use("/api/auth", authRoutes);


// ------------------------------------------------------------
// Profile
// ------------------------------------------------------------

app.use("/api/profile", profileRoutes);


// ============================================================
// 10. HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "trading-bot",
    websocket: true,
    trading: "spot"
  });
});


// ============================================================
// 11. LIVE SIGNALS
// ============================================================
//
// IMPORTANT:
//
// هذا endpoint لا يجلب البيانات من Binance REST.
//
// البيانات تأتي من marketData.js
// الذي يستقبل الشموع عن طريق WebSocket.
//
// ============================================================

app.get("/signals", async (req, res) => {
  try {
    const results = [];

    for (const symbol of SYMBOLS) {
      const data = getMarketData(symbol);

      if (!data || data.length === 0) {
        results.push({
          symbol,
          signal: "WAIT",
          trade: null,
          message: "Market data is not ready yet"
        });

        continue;
      }

      const analysis = generateSignal(data);

      results.push({
        symbol,
        ...analysis
      });
    }

    res.json(results);
  } catch (error) {
    console.error(
      "❌ SIGNALS ERROR:",
      error?.message || error
    );

    res.status(500).json({
      error: error?.message || "Failed to generate signals"
    });
  }
});


// ============================================================
// 12. BINANCE CONNECTION TEST
// ============================================================
//
// هذا endpoint لا يستخدم REST.
//
// الهدف منه فقط معرفة هل نظام WebSocket/API
// الخاص بـ Binance جاهز.
//
// ============================================================

app.get("/binance-test", async (req, res) => {
  try {
    const {
      getConnectionStatus,
      getAccount
    } = require("./testnet/binanceClient");

    const connection = getConnectionStatus();

    if (!connection.connected) {
      return res.status(503).json({
        success: false,
        websocket: false,
        message: "Binance WebSocket API is not connected",
        connection
      });
    }

    let account = null;

    try {
      account = await getAccount();
    } catch (accountError) {
      console.error(
        "❌ BINANCE ACCOUNT TEST ERROR:",
        accountError?.message || accountError
      );
    }

    res.json({
      success: true,
      websocket: true,
      connection,
      accountReady: !!account,
      message: "Binance WebSocket API is connected"
    });
  } catch (error) {
    console.error(
      "❌ BINANCE TEST ERROR:",
      error?.message || error
    );

    res.status(500).json({
      success: false,
      error: error?.message || "Binance connection test failed"
    });
  }
});


// ============================================================
// 13. BACKTEST
// ============================================================
//
// هذا الجزء LOCAL ONLY.
//
// لا يتم تشغيله في Production.
//
// لذلك لا توجد أي طلبات تاريخية من Binance
// عند تشغيل السيرفر على Render.
//
// ============================================================

app.get("/replay", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      error: "Replay is available locally only"
    });
  }

  try {
    const symbol =
      req.query.symbol || "BTCUSDT";

    const interval =
      req.query.interval || "15m";

    const limit =
      Number(req.query.limit) || 1000;


    let data;


    // --------------------------------------------------------
    // Try historical data provider
    // --------------------------------------------------------

    if (typeof getHistoricalData === "function") {
      data = await getHistoricalData(
        symbol,
        interval,
        limit
      );
    } else {
      // ------------------------------------------------------
      // Fallback to current market cache
      // ------------------------------------------------------

      data = getMarketData(symbol);
    }


    if (!data || data.length === 0) {
      return res.status(503).json({
        error: "Historical market data is not available"
      });
    }


    const result = replayBacktest(data);


    res.json(result);
  } catch (err) {
    console.error(
      "❌ BACKTEST ERROR:",
      err?.message || err
    );

    res.status(500).json({
      error: err?.message || "Backtest failed"
    });
  }
});


// ============================================================
// 14. SIGNAL REPLAY
// ============================================================
//
// LOCAL ONLY.
//
// لا يرسل أي أمر إلى Binance.
//
// ============================================================

app.get("/signals-replay", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      error: "Signals Replay is available locally only"
    });
  }

  try {
    const symbol =
      req.query.symbol || "BTCUSDT";

    const interval =
      req.query.interval || "15m";

    const limit =
      Number(req.query.limit) || 1000;


    let data;


    if (typeof getHistoricalData === "function") {
      data = await getHistoricalData(
        symbol,
        interval,
        limit
      );
    } else {
      data = getMarketData(symbol);
    }


    if (!data || data.length === 0) {
      return res.status(503).json({
        error: "Historical market data is not available"
      });
    }


    const signals = replaySignals(data);


    res.json({
      symbol,
      interval,
      total: signals.length,
      signals
    });
  } catch (err) {
    console.error(
      "❌ SIGNAL REPLAY ERROR:",
      err?.message || err
    );

    res.status(500).json({
      error: err?.message || "Signal replay failed"
    });
  }
});


// ============================================================
// 15. 404 HANDLER
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl
  });
});


// ============================================================
// 16. MONGODB
// ============================================================

async function connectMongoDB() {
  try {
    if (!process.env.MONGO_URI) {
      console.error(
        "❌ MONGO_URI is missing"
      );

      return;
    }

    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log(
      "MongoDB Connected Successfully"
    );
  } catch (err) {
    console.error(
      "MongoDB Connection Error:",
      err?.message || err
    );
  }
}


// ============================================================
// 17. START TRADING BOT
// ============================================================
//
// مهم:
//
// هنا يتم تشغيل البوت الحقيقي.
//
// runner.js مسؤول عن:
//
// WebSocket Market Data
//        ↓
// candles
//        ↓
// strategy
//        ↓
// BUY
//        ↓
// WebSocket API
//        ↓
// Binance
//
// لا يوجد هنا REST polling.
//
// ============================================================

async function startTradingBot() {
  try {
    console.log("");
    console.log("==========================================");
    console.log("🤖 STARTING SPOT TRADING BOT");
    console.log("==========================================");

    console.log(
      "📊 Symbols:",
      SYMBOLS.join(", ")
    );

    console.log(
      "⏱️ Interval: 15m"
    );

    console.log(
      "💱 Trading mode: SPOT"
    );

    console.log(
      "📡 Market data: WebSocket"
    );

    console.log(
      "📡 Orders/API: WebSocket API"
    );

    console.log(
      "==========================================");
    console.log("");


    await run(SYMBOLS);


    console.log("");
    console.log(
      "🟢 Trading bot started successfully"
    );
    console.log("");
  } catch (error) {
    console.error("");
    console.error(
      "❌ TRADING BOT START ERROR:"
    );

    console.error(
      error?.response?.data ||
      error?.message ||
      error
    );

    console.error("");
  }
}


// ============================================================
// 18. START SERVER
// ============================================================

async function startServer() {
  try {
    await connectMongoDB();


    server.listen(PORT, () => {
      console.log("");
      console.log(
        `🚀 Server running on port ${PORT}`
      );

      console.log(
        `🌐 Environment: ${
          process.env.NODE_ENV || "development"
        }`
      );

      console.log(
        "💱 Binance mode: SPOT"
      );

      console.log(
        "📡 Market data: WebSocket"
      );

      console.log(
        "📡 Binance API: WebSocket API"
      );

      console.log("");
    });


    // --------------------------------------------------------
    // Start bot AFTER server is listening
    // --------------------------------------------------------

    await startTradingBot();
  } catch (error) {
    console.error(
      "❌ SERVER START ERROR:",
      error?.message || error
    );
  }
}


// ============================================================
// 19. GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal) {
  console.log("");
  console.log(
    `🛑 ${signal} received`
  );

  try {
    server.close(() => {
      console.log(
        "🔌 HTTP server closed"
      );
    });


    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();

      console.log(
        "🔌 MongoDB connection closed"
      );
    }
  } catch (error) {
    console.error(
      "❌ Shutdown error:",
      error?.message || error
    );
  } finally {
    process.exit(0);
  }
}


process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);


// ============================================================
// 20. UNHANDLED ERRORS
// ============================================================

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "❌ UNHANDLED REJECTION:",
      reason
    );
  }
);


process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "❌ UNCAUGHT EXCEPTION:",
      error
    );
  }
);


// ============================================================
// 21. START APPLICATION
// ============================================================

startServer();

