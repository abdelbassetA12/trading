const axios = require("axios");
const crypto = require("crypto");


const BASE_URL = "https://testnet.binance.vision";

const API_KEY = process.env.BINANCE_KEY;
const SECRET = process.env.BINANCE_SECRET;

// ===== دالة توقيع query =====
function sign(query) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(query)
    .digest("hex");
}

// ===== جلب الوقت من Binance =====
async function getServerTime() {
  const res = await axios.get(`${BASE_URL}/api/v3/time`);
  return res.data.serverTime;
}

// ===== GET account =====
async function getAccount() {
  const timestamp = await getServerTime();
  const query = `timestamp=${timestamp}`;
  const signature = sign(query);

  const res = await axios.get(
    `${BASE_URL}/api/v3/account?${query}&signature=${signature}`,
    { headers: { "X-MBX-APIKEY": API_KEY } }
  );

  return res.data;
}

// ===== MARKET ORDER =====
async function marketOrder(symbol, side, quantity) {
  const timestamp = await getServerTime(); // ← الآن معرفة

  const recvWindow = 5000; // 5 ثواني
  const query = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = sign(query);

  const res = await axios.post(
    `${BASE_URL}/api/v3/order?${query}&signature=${signature}`,
    null, // مهم
    { headers: { "X-MBX-APIKEY": API_KEY } }
  );

  return res.data;
}


//جديد ل pt limit order

async function takeProfitOrder(symbol, quantity, takeProfitPrice) {
  const timestamp = await getServerTime();

  const recvWindow = 5000;

  const query = 
    `symbol=${symbol}` +
    `&side=SELL` +
    `&type=LIMIT` +
    `&timeInForce=GTC` +
    `&price=${takeProfitPrice}` +
    `&quantity=${quantity}` +
    `&timestamp=${timestamp}` +
    `&recvWindow=${recvWindow}`;

  const signature = sign(query);

  try {
    const res = await axios.post(
      `${BASE_URL}/api/v3/order?${query}&signature=${signature}`,
      null,
      { headers: { "X-MBX-APIKEY": API_KEY } }
    );

    console.log("✅ TP order created:", res.data);
    return res.data;

  } catch (err) {
    console.log("❌ ERROR:", err.response?.data || err.message);
  }
}
/*
async function takeProfitOrder(symbol, quantity, takeProfitPrice) {
  const timestamp = await getServerTime();

  const recvWindow = 5000;

  const query = 
    `symbol=${symbol}` +
    `&side=SELL` +
    `&type=TAKE_PROFIT_MARKET` +
    `&stopPrice=${takeProfitPrice}` +
    `&quantity=${quantity}` +
    `&timestamp=${timestamp}` +
    `&recvWindow=${recvWindow}`;

  const signature = sign(query);

  const res = await axios.post(
    `${BASE_URL}/api/v3/order?${query}&signature=${signature}`,
    null,
    { headers: { "X-MBX-APIKEY": API_KEY } }
  );

  return res.data;
}
*/



async function getMyTrades(symbol) {
  const timestamp = await getServerTime();

  const query = `symbol=${symbol}&timestamp=${timestamp}`;
  const signature = sign(query);

  const res = await axios.get(
    `${BASE_URL}/api/v3/myTrades?${query}&signature=${signature}`,
    { headers: { "X-MBX-APIKEY": API_KEY } }
  );

  return res.data;
}

async function getAllOrders(symbol) {
  const timestamp = await getServerTime();

  const query = `symbol=${symbol}&timestamp=${timestamp}`;
  const signature = sign(query);

  const res = await axios.get(
    `${BASE_URL}/api/v3/allOrders?${query}&signature=${signature}`,
    { headers: { "X-MBX-APIKEY": API_KEY } }
  );

  return res.data;
}
  



async function getAllOpenOrders() {
  const timestamp = await getServerTime();

  const query = `timestamp=${timestamp}`;
  const signature = sign(query);

  const res = await axios.get(
    `${BASE_URL}/api/v3/openOrders?${query}&signature=${signature}`,
    { headers: { "X-MBX-APIKEY": API_KEY } }
  );

  return res.data;
}

async function cancelOrder(symbol, orderId) {
  const timestamp = await getServerTime();

  const query =
    `symbol=${symbol}` +
    `&orderId=${orderId}` +
    `&timestamp=${timestamp}`;

  const signature = sign(query);

  try {
    const res = await axios.delete(
      `${BASE_URL}/api/v3/order?${query}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": API_KEY } }
    );

    console.log("❌ Order Cancelled:", res.data);
    return res.data;

  } catch (err) {
    console.error("❌ Cancel Error:", err.response?.data || err.message);
    throw err;
  }
}


async function createLimitOrder(symbol, side, quantity, price) {
  const timestamp = await getServerTime();

  const query =
    `symbol=${symbol}` +
    `&side=${side}` +
    `&type=LIMIT` +
    `&timeInForce=GTC` +
    `&quantity=${quantity}` +
    `&price=${price}` +
    `&timestamp=${timestamp}`;

  const signature = sign(query);

  const res = await axios.post(
    `${BASE_URL}/api/v3/order?${query}&signature=${signature}`,
    null,
    { headers: { "X-MBX-APIKEY": API_KEY } }
  );

  return res.data;
}

module.exports = { getAccount, marketOrder, takeProfitOrder, getMyTrades, getAllOrders, getAllOpenOrders, cancelOrder, createLimitOrder };



