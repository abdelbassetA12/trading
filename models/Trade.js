const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema({
  userId: { type: String, required: true },

  pair: { type: String, required: true },
  type: { type: String, enum: ["BUY", "SELL"], required: true },

  entry: { type: Number, required: true },
  exit: { type: Number, required: true },
  lot: { type: Number, required: true },

  stopLoss: Number,
  takeProfit: Number,

  // 🔥 تحليل احترافي
  result: Number,
  resultPercent: Number,
  rr: Number,

  strategy: String, // BOS / CHOCH / OB

  emotion: String, // fear / confident / revenge
  mistake: String,
  setupQuality: Number, // 1-5

  duration: Number,
  notes: String,
  image: String, // 🔥 رابط الصورة

  entryTime: Date,

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Trade", tradeSchema);

/*
const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  pair: { type: String, required: true },
  type: { type: String, enum: ["BUY", "SELL"], required: true },
  entry: { type: Number, required: true },
  exit: { type: Number, required: true },
  lot: { type: Number, required: true },
  stopLoss: { type: Number },
  takeProfit: { type: Number },
  result: { type: Number, required: true },
  resultPercent: { type: Number },
  duration: { type: Number }, // بالثواني
  notes: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Trade", tradeSchema);
*/