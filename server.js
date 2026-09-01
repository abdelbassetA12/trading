 
// ============================================================
// 1. ENVIRONMENT & CORE IMPORTS
// ============================================================

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const http = require("http");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");


// ============================================================
// 2. TRADING SYSTEM IMPORTS
// ============================================================

// توليد الإشارة الحقيقية للاستراتيجية
const { generateSignal } = require("./strategy");

// تشغيل الـ Backtest فقط
const { replayBacktest } = require("./backtest");

// Replay للإشارات التاريخية فقط
const { replaySignals } = require("./signalReplay");


// ============================================================
// 3. REAL / TESTNET TRADING
// ============================================================

// تشغيل البوت
const { run } = require("./testnet/runner");

// Routes الخاصة بالـ Testnet
const testnetRoutes = require("./testnet/routes");

// تحويل العملات في Testnet
const convertRoute = require("./testnet/convert");


// ============================================================
// 4. OTHER APPLICATION ROUTES
// ============================================================

// التداولات المخزنة في MongoDB
const tradeRoutes = require("./routes/trades");

// المصادقة
const authRoutes = require("./routes/auth");

// الملف الشخصي
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
    //origin: "http://localhost:3001",
    origin: "https://trading-server-ten.vercel.app",
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
// 9. BINANCE MARKET DATA
// ============================================================
//
// هذه الدالة فقط تجلب بيانات الشموع من Binance.
// لا تفتح صفقة.
// لا تغلق صفقة.
// لا تحسب Profit.
// لا تقوم بـ Backtest.
//
// ============================================================
async function getData(
  symbol,
  interval = "15m",
  limit = 200
) {
  try {
    const res = await axios.get(
      `https://testnet.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
 
    );

    return res.data.map(c => ({
      time: c[0],
      open: +c[1],
      high: +c[2],
      low: +c[3],
      close: +c[4],
      volume: +c[5]
    }));

  } catch (error) {
    console.error(
      "❌ BINANCE KLINES ERROR:",
      error.response?.status,
      error.response?.data || error.message
    );

    throw error;
  }
}
 

// ============================================================
// 10. APPLICATION ROUTES
// ============================================================

// تحويل العملات
app.use("/api", convertRoute);

// Testnet API
app.use("/api/testnet", testnetRoutes);

// MongoDB trades
app.use("/api/trades", tradeRoutes);

// Authentication
app.use("/api/auth", authRoutes);

// Profile
app.use("/api/profile", profileRoutes);


// ============================================================
// 11. REAL / TESTNET BOT
// ============================================================
//
// ⚠️⚠️⚠️ مهم جدًا
//
// هذا هو الجزء الذي يجب أن نركز عليه عندما تريد معرفة:
// "من الذي يشغل البوت؟"
//
// هذا السطر:
//
//     run(SYMBOLS);
//
// يقوم بتشغيل الـ runner.
//
// إذا كان runner يقوم بإرسال أوامر إلى Binance Testnet,
// فهذا هو المسار المسؤول عن التداول في Testnet.
//
//
//
// ❌ هذا ليس Backtest.
// ❌ هذا ليس /replay.
// ❌ هذا ليس /signals-replay.
//
// ============================================================

run(SYMBOLS);


// ============================================================
// 12. LIVE SIGNALS
// ============================================================
//
// GET /signals
//
// هذا endpoint يقوم بـ:
// 1. جلب بيانات السوق الحالية.
// 2. إرسالها إلى generateSignal().
// 3. إرجاع الإشارة.
//
//
//
// ⚠️ هذا الجزء لا يقوم بفتح الصفقة بنفسه.
//
// generateSignal() = تحليل + Signal
//
// ============================================================

app.get("/signals", async (req, res) => {
  try {
    let results = [];

    for (let symbol of SYMBOLS) {
      const data = await getData(symbol);

      const analysis = generateSignal(data);

      results.push({
        symbol,
        ...analysis
      });
    }

    res.json(results);
  } catch (err) {
    console.error("SIGNALS ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
});


// ============================================================
// 13. BACKTEST
// ============================================================
//
// GET /replay
//
// ⚠️ هذا الجزء خاص بالاختبار التاريخي فقط.
//
// المسار:
//
// Frontend
//    ↓
// /replay
//    ↓
// getData()
//    ↓
// replayBacktest()
//    ↓
// نتيجة Backtest
//
//
//
// ❌ لا يفتح صفقة حقيقية.
// ❌ لا يرسل أمر شراء إلى Binance.
// ❌ لا يتداول بأموال حقيقية.
//
// ============================================================

app.get("/replay", async (req, res) => {
  try {
    const symbol =
      req.query.symbol || "BTCUSDT";

    const interval =
      req.query.interval || "15m";

    // جلب 1000 شمعة تاريخية
    const data = await getData(
      symbol,
      interval,
      1000
    );

    // تشغيل Backtest
    const result = replayBacktest(data);

    res.json(result);

  } catch (err) {
    console.error("BACKTEST ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
});


// ============================================================
// 14. SIGNAL REPLAY
// ============================================================
//
// GET /signals-replay
//
// هذا أيضًا اختبار تاريخي.
//
// لكنه مختلف عن Backtest.
//
// يقوم بإعادة الإشارات التاريخية فقط.
//
// لا يفتح صفقات.
// لا يرسل أوامر Binance.
//
// ============================================================

app.get("/signals-replay", async (req, res) => {
  try {
    const symbol =
      req.query.symbol || "BTCUSDT";

    const interval =
      req.query.interval || "15m";

    const data = await getData(
      symbol,
      interval,
      1000
    );

    const signals = replaySignals(data);

    res.json({
      total: signals.length,
      signals
    });

  } catch (err) {
    console.error(
      "SIGNALS REPLAY ERROR:",
      err
    );

    res.status(500).json({
      error: err.message
    });
  }
});




 

// ============================================================
// 15. MONGODB
// ============================================================
//
// هذا خاص بتخزين بيانات التطبيق.
// ليس مسؤولًا عن Backtest.
// وليس مسؤولًا مباشرة عن إرسال أوامر التداول.
//
// ============================================================

mongoose
  .connect(process.env.MONGO_URI)

  .then(() => {
    console.log(
      "MongoDB Connected Successfully"
    );
  })

  .catch((err) => {
    console.error(
      "MongoDB Connection Error:",
      err
    );
  });


// ============================================================
// 16. START SERVER
// ============================================================

server.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  );
});
 




