const mongoose = require('mongoose');

module.exports = mongoose.model('Link', {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String,
  url: String,
  active: { type: Boolean, default: true } // 👈 جديد: التحكم بالظهور
});