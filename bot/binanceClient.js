const WebSocket = require("ws");
const crypto = require("crypto");

const API_KEY = process.env.BINANCE_KEY;
const SECRET = process.env.BINANCE_SECRET;

const WS_API_URL =
  process.env.BINANCE_WS_API_URL ||
  "wss://ws-api.binance.com:443/ws-api/v3";

let ws = null;
let connected = false;
let connecting = false;

let requestId = 1;

const pendingRequests = new Map();

let serverTimeOffset = 0;
let timeInitialized = false;

const accountState = {
  balances: {},
  orders: {},
  lastUpdate: 0
};

const exchangeInfoCache = {};

let reconnectTimer = null;

const userDataListeners = new Set();


// ============================================================
// REQUEST ID
// ============================================================

function generateId() {
  return `${Date.now()}-${requestId++}`;
}


// ============================================================
// SIGNATURE
// ============================================================

function createSignature(params) {
  const keys = Object.keys(params)
    .filter((key) => key !== "signature")
    .sort();

  const payload = keys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");
}


// ============================================================
// TIMESTAMP
// ============================================================

function getTimestamp() {
  return Date.now() + serverTimeOffset;
}


// ============================================================
// RAW REQUEST
// ============================================================

function sendRaw(message) {
  return new Promise((resolve, reject) => {
    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN
    ) {
      return reject(
        new Error(
          "Binance WebSocket is not connected"
        )
      );
    }

    const id = message.id;

    pendingRequests.set(id, {
      resolve,
      reject,
      createdAt: Date.now()
    });

    try {
      ws.send(
        JSON.stringify(message)
      );
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}


// ============================================================
// CLEANUP REQUESTS
// ============================================================

function cleanupPendingRequests() {
  const now = Date.now();

  for (
    const [id, request]
    of pendingRequests.entries()
  ) {
    if (
      now - request.createdAt >
      30000
    ) {
      request.reject(
        new Error(
          "Binance WebSocket request timeout"
        )
      );

      pendingRequests.delete(id);
    }
  }
}


// ============================================================
// CONNECTION
// ============================================================

async function connect() {
  if (connected && ws) {
    return;
  }

  if (connecting) {
    return new Promise(
      (resolve, reject) => {
        const started = Date.now();

        const check = setInterval(() => {
          if (connected) {
            clearInterval(check);
            resolve();
            return;
          }

          if (
            Date.now() - started >
            15000
          ) {
            clearInterval(check);

            reject(
              new Error(
                "Binance WebSocket connection timeout"
              )
            );
          }
        }, 100);
      }
    );
  }

  connecting = true;

  return new Promise(
    (resolve, reject) => {
      const socket =
        new WebSocket(
          WS_API_URL
        );

      ws = socket;

      let settled = false;

      socket.on(
        "open",
        async () => {
          connected = true;
          connecting = false;

          console.log(
            "🟢 Binance WebSocket API connected"
          );

          try {
            await syncServerTime();

            await subscribeUserDataStream();

            if (!settled) {
              settled = true;
              resolve();
            }
          } catch (error) {
            console.error(
              "❌ Binance WebSocket initialization error:",
              error.message
            );

            if (!settled) {
              settled = true;
              reject(error);
            }
          }
        }
      );

      socket.on(
        "message",
        (message) => {
          handleMessage(message);
        }
      );

      socket.on(
        "error",
        (error) => {
          console.error(
            "❌ Binance WebSocket API error:",
            error.message
          );

          if (!settled) {
            settled = true;
            connecting = false;
            reject(error);
          }
        }
      );

      socket.on(
        "close",
        () => {
          console.log(
            "🔴 Binance WebSocket API disconnected"
          );

          connected = false;
          connecting = false;
          timeInitialized = false;

          ws = null;

          for (
            const [
              id,
              request
            ]
            of pendingRequests.entries()
          ) {
            request.reject(
              new Error(
                "Binance WebSocket disconnected"
              )
            );

            pendingRequests.delete(id);
          }

          scheduleReconnect();
        }
      );
    }
  );
}


// ============================================================
// RECONNECT
// ============================================================

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(
    async () => {
      reconnectTimer = null;

      try {
        await connect();

        console.log(
          "🟢 Binance WebSocket API reconnected"
        );

        await refreshAccountState();
      } catch (error) {
        console.error(
          "❌ Binance WebSocket reconnect failed:",
          error.message
        );

        scheduleReconnect();
      }
    },
    5000
  );
}


// ============================================================
// MESSAGE HANDLER
// ============================================================

function handleMessage(message) {
  try {
    const data =
      JSON.parse(
        message.toString()
      );

    if (
      data.id &&
      pendingRequests.has(data.id)
    ) {
      const request =
        pendingRequests.get(
          data.id
        );

      pendingRequests.delete(
        data.id
      );

      if (
        data.status &&
        data.status >= 400
      ) {
        const error =
          new Error(
            data.error?.msg ||
            data.error?.message ||
            "Binance WebSocket API error"
          );

        error.response = data;

        request.reject(error);
      } else {
        request.resolve(data);
      }

      return;
    }

    handleUserDataEvent(data);
  } catch (error) {
    console.error(
      "❌ Binance WebSocket message error:",
      error.message
    );
  }
}


// ============================================================
// USER DATA EVENT
// ============================================================

function handleUserDataEvent(data) {
  if (!data) {
    return;
  }

  const event =
    data.event || data;

  if (!event) {
    return;
  }

  accountState.lastUpdate =
    Date.now();


  // ==========================================================
  // ACCOUNT POSITION
  // ==========================================================

  if (
    event.e ===
    "outboundAccountPosition"
  ) {
    const balances =
      event.B || [];

    for (
      const balance
      of balances
    ) {
      accountState.balances[
        balance.a
      ] = {
        asset: balance.a,
        free: parseFloat(
          balance.f
        ),
        locked: parseFloat(
          balance.l
        )
      };
    }

    notifyUserDataListeners(
      event
    );

    return;
  }


  // ==========================================================
  // BALANCE UPDATE
  // ==========================================================

  if (
    event.e ===
    "balanceUpdate"
  ) {
    notifyUserDataListeners(
      event
    );

    return;
  }


  // ==========================================================
  // EXECUTION REPORT
  // ==========================================================

  if (
    event.e ===
    "executionReport"
  ) {
    const orderId =
      String(event.i);

    const symbol =
      event.s;

    accountState.orders[
      orderId
    ] = {
      orderId: event.i,
      symbol,
      side: event.S,
      type: event.o,
      status: event.X,
      price: parseFloat(
        event.p || 0
      ),
      quantity: parseFloat(
        event.q || 0
      ),
      executedQty: parseFloat(
        event.z || 0
      ),
      lastExecutedQty:
        parseFloat(
          event.l || 0
        ),
      lastExecutedPrice:
        parseFloat(
          event.L || 0
        ),
      averagePrice:
        parseFloat(
          event.Z || 0
        ) > 0 &&
        parseFloat(
          event.z || 0
        ) > 0
          ? parseFloat(
              event.Z
            ) /
            parseFloat(
              event.z
            )
          : 0,
      time: event.T,
      updateTime: Date.now()
    };

    console.log(
      `[ORDER:${symbol}] ${event.S} ${event.o} -> ${event.X}`
    );

    notifyUserDataListeners(
      event
    );
  }
}


// ============================================================
// USER DATA LISTENERS
// ============================================================

function onUserData(
  callback
) {
  if (
    typeof callback !==
    "function"
  ) {
    return () => {};
  }

  userDataListeners.add(
    callback
  );

  return () => {
    userDataListeners.delete(
      callback
    );
  };
}


function notifyUserDataListeners(
  event
) {
  for (
    const callback
    of userDataListeners
  ) {
    try {
      callback(event);
    } catch (error) {
      console.error(
        "❌ User data listener error:",
        error.message
      );
    }
  }
}


// ============================================================
// SERVER TIME
// ============================================================

async function syncServerTime() {
  const response =
    await sendRaw({
      id: generateId(),
      method: "time"
    });

  if (
    response?.result?.serverTime
  ) {
    serverTimeOffset =
      response.result.serverTime -
      Date.now();

    timeInitialized = true;

    console.log(
      "🕐 Binance time synchronized"
    );
  }

  return response?.result
    ?.serverTime;
}


// ============================================================
// ENSURE CONNECTION
// ============================================================

async function ensureConnected() {
  if (
    !connected ||
    !ws
  ) {
    await connect();
  }

  if (
    !timeInitialized
  ) {
    await syncServerTime();
  }
}


// ============================================================
// PUBLIC CALL
// ============================================================

async function call(
  method,
  params = {}
) {
  await ensureConnected();

  const id =
    generateId();

  return sendRaw({
    id,
    method,
    params
  });
}


// ============================================================
// SIGNED CALL
// ============================================================

async function signedCall(
  method,
  params = {}
) {
  await ensureConnected();

  const finalParams = {
    ...params,
    apiKey: API_KEY,
    timestamp: getTimestamp()
  };

  finalParams.signature =
    createSignature(
      finalParams
    );

  const id =
    generateId();

  return sendRaw({
    id,
    method,
    params: finalParams
  });
}


// ============================================================
// USER DATA STREAM
// ============================================================

async function subscribeUserDataStream() {
  try {
    const params = {
      apiKey: API_KEY,
      timestamp: getTimestamp()
    };

    params.signature =
      createSignature(
        params
      );

    const response =
      await call(
        "userDataStream.subscribe.signature",
        params
      );

    console.log(
      "🟢 Binance User Data Stream subscribed"
    );

    return response;
  } catch (error) {
    console.error(
      "❌ User Data Stream subscription failed:",
      error.message
    );

    throw error;
  }
}


// ============================================================
// ACCOUNT
// ============================================================

async function getAccount() {
  const response =
    await signedCall(
      "account.status"
    );

  const account =
    response?.result;

  if (
    account?.balances
  ) {
    for (
      const balance
      of account.balances
    ) {
      accountState.balances[
        balance.asset
      ] = {
        asset: balance.asset,
        free: parseFloat(
          balance.free
        ),
        locked: parseFloat(
          balance.locked
        )
      };
    }

    accountState.lastUpdate =
      Date.now();
  }

  return account;
}


// ============================================================
// REFRESH ACCOUNT STATE
// ============================================================

async function refreshAccountState() {
  try {
    const account =
      await getAccount();

    if (
      account?.balances
    ) {
      for (
        const balance
        of account.balances
      ) {
        accountState.balances[
          balance.asset
        ] = {
          asset: balance.asset,
          free: parseFloat(
            balance.free
          ),
          locked: parseFloat(
            balance.locked
          )
        };
      }
    }

    const orders =
      await getAllOpenOrders();

    for (
      const order
      of orders
    ) {
      accountState.orders[
        String(order.orderId)
      ] = order;
    }

    return account;
  } catch (error) {
    console.error(
      "❌ Account state refresh failed:",
      error.message
    );

    throw error;
  }
}


// ============================================================
// CACHED BALANCES
// ============================================================

function getCachedBalance(
  asset
) {
  return (
    accountState.balances[
      asset
    ] || {
      asset,
      free: 0,
      locked: 0
    }
  );
}


function getCachedBalances() {
  return Object.values(
    accountState.balances
  );
}


function getCachedOrders() {
  return Object.values(
    accountState.orders
  );
}


function getCachedOpenOrders() {
  return Object.values(
    accountState.orders
  ).filter(
    (order) =>
      order.status ===
        "NEW" ||
      order.status ===
        "PARTIALLY_FILLED"
  );
}


// ============================================================
// KLINES
// ============================================================

async function getKlines(
  symbol,
  interval = "15m",
  limit = 200
) {
  const response =
    await call(
      "klines",
      {
        symbol,
        interval,
        limit
      }
    );

  return response?.result || [];
}


// ============================================================
// EXCHANGE INFO
// ============================================================

async function getExchangeInfo(
  symbol
) {
  if (
    exchangeInfoCache[
      symbol
    ]
  ) {
    return exchangeInfoCache[
      symbol
    ];
  }

  const response =
    await call(
      "exchangeInfo",
      {
        symbol
      }
    );

  const info =
    response?.result?.symbols?.find(
      (item) =>
        item.symbol ===
        symbol
    );

  if (!info) {
    throw new Error(
      `Exchange info not found for ${symbol}`
    );
  }

  exchangeInfoCache[
    symbol
  ] = info;

  return info;
}


// ============================================================
// DECIMAL HELPERS
// ============================================================

function getFilter(
  info,
  filterType
) {
  return info?.filters?.find(
    (filter) =>
      filter.filterType ===
      filterType
  );
}


function getDecimalPlaces(
  value
) {
  const stringValue =
    String(value);

  if (
    stringValue.includes(".")
  ) {
    return (
      stringValue.split(
        "."
      )[1]?.length || 0
    );
  }

  return 0;
}


function floorToStep(
  value,
  stepSize
) {
  const valueNumber =
    Number(value);

  const stepNumber =
    Number(stepSize);

  if (
    !Number.isFinite(
      valueNumber
    ) ||
    !Number.isFinite(
      stepNumber
    ) ||
    stepNumber <= 0
  ) {
    return valueNumber;
  }

  const precision =
    getDecimalPlaces(
      stepSize
    );

  const steps =
    Math.floor(
      valueNumber /
        stepNumber +
        1e-12
    );

  const result =
    steps * stepNumber;

  return Number(
    result.toFixed(
      precision
    )
  );
}


// ============================================================
// MARKET ORDER
// ============================================================
//
// BUY:
// يمكن استعمال quoteOrderQty
// مثال:
// quoteOrderQty = 100
// يعني أنفق 100 USDT.
//
// SELL:
// quantity = كمية BTC/ETH/SOL
//
// ============================================================

async function marketOrder(
  symbol,
  side,
  quantity,
  options = {}
) {
  const normalizedSide =
    String(side).toUpperCase();

  const params = {
    symbol,
    side: normalizedSide,
    type: "MARKET",
    newOrderRespType: "FULL"
  };


  // ==========================================================
  // BUY USING USDT AMOUNT
  // ==========================================================

  if (
    normalizedSide ===
      "BUY" &&
    options.quoteOrderQty
  ) {
    const quoteAmount =
      Number(
        options.quoteOrderQty
      );

    if (
      !Number.isFinite(
        quoteAmount
      ) ||
      quoteAmount <= 0
    ) {
      throw new Error(
        "Invalid quoteOrderQty"
      );
    }

    params.quoteOrderQty =
      quoteAmount;
  } else {
    // ========================================================
    // NORMAL QUANTITY
    // ========================================================

    const info =
      await getExchangeInfo(
        symbol
      );

    const lotSize =
      getFilter(
        info,
        "LOT_SIZE"
      );

    let normalizedQuantity =
      Number(quantity);

    if (
      lotSize?.stepSize
    ) {
      normalizedQuantity =
        floorToStep(
          normalizedQuantity,
          lotSize.stepSize
        );
    }

    if (
      !Number.isFinite(
        normalizedQuantity
      ) ||
      normalizedQuantity <= 0
    ) {
      throw new Error(
        `Invalid quantity for ${symbol}`
      );
    }

    if (
      lotSize?.minQty &&
      normalizedQuantity <
        Number(
          lotSize.minQty
        )
    ) {
      throw new Error(
        `Quantity is below minimum for ${symbol}. Minimum: ${lotSize.minQty}`
      );
    }

    params.quantity =
      normalizedQuantity;
  }


  const response =
    await signedCall(
      "order.place",
      params
    );

  const result =
    response?.result;

  if (
    result?.orderId
  ) {
    accountState.orders[
      String(
        result.orderId
      )
    ] = result;
  }

  return result;
}


// ============================================================
// TAKE PROFIT
// ============================================================

async function takeProfitOrder(
  symbol,
  quantity,
  takeProfitPrice
) {
  try {
    const info =
      await getExchangeInfo(
        symbol
      );

    const lotSize =
      getFilter(
        info,
        "LOT_SIZE"
      );

    const priceFilter =
      getFilter(
        info,
        "PRICE_FILTER"
      );

    let normalizedQuantity =
      Number(quantity);

    let normalizedPrice =
      Number(
        takeProfitPrice
      );


    if (
      lotSize?.stepSize
    ) {
      normalizedQuantity =
        floorToStep(
          normalizedQuantity,
          lotSize.stepSize
        );
    }


    if (
      priceFilter?.tickSize
    ) {
      normalizedPrice =
        floorToStep(
          normalizedPrice,
          priceFilter.tickSize
        );
    }


    if (
      !Number.isFinite(
        normalizedQuantity
      ) ||
      normalizedQuantity <= 0
    ) {
      throw new Error(
        "Invalid TP quantity"
      );
    }


    if (
      !Number.isFinite(
        normalizedPrice
      ) ||
      normalizedPrice <= 0
    ) {
      throw new Error(
        "Invalid TP price"
      );
    }


    const response =
      await signedCall(
        "order.place",
        {
          symbol,
          side: "SELL",
          type: "LIMIT",
          timeInForce: "GTC",
          quantity:
            normalizedQuantity,
          price:
            normalizedPrice,
          newOrderRespType:
            "RESULT"
        }
      );


    const result =
      response?.result;


    if (
      result?.orderId
    ) {
      accountState.orders[
        String(
          result.orderId
        )
      ] = result;
    }


    console.log(
      "✅ TP order created:",
      result
    );


    return result;
  } catch (error) {
    console.error(
      "❌ TP order error:",
      error.message
    );

    throw error;
  }
}


// ============================================================
// ORDER STATUS
// ============================================================

async function getOrder(
  symbol,
  orderId
) {
  const response =
    await signedCall(
      "order.status",
      {
        symbol,
        orderId
      }
    );

  return response?.result;
}


// ============================================================
// MY TRADES
// ============================================================

async function getMyTrades(
  symbol
) {
  const response =
    await signedCall(
      "myTrades",
      {
        symbol
      }
    );

  return response?.result || [];
}


// ============================================================
// ALL ORDERS
// ============================================================

async function getAllOrders(
  symbol
) {
  const response =
    await signedCall(
      "allOrders",
      {
        symbol
      }
    );

  return response?.result || [];
}


// ============================================================
// OPEN ORDERS
// ============================================================
//
// IMPORTANT:
//
// الصحيح في Binance WebSocket API:
//
// openOrders.status
//
// وليس:
//
// openOrders
//
// ============================================================

async function getAllOpenOrders() {
  const response =
    await signedCall(
      "openOrders.status"
    );

  const orders =
    response?.result || [];


  // تحديث الكاش

  const activeIds =
    new Set();


  for (
    const order
    of orders
  ) {
    const id =
      String(
        order.orderId
      );

    activeIds.add(id);

    accountState.orders[
      id
    ] = order;
  }


  // إزالة الأوامر التي لم تعد مفتوحة

  for (
    const [
      orderId,
      order
    ]
    of Object.entries(
      accountState.orders
    )
  ) {
    if (
      order.symbol &&
      !activeIds.has(
        orderId
      ) &&
      (
        order.status ===
          "NEW" ||
        order.status ===
          "PARTIALLY_FILLED"
      )
    ) {
      delete accountState.orders[
        orderId
      ];
    }
  }


  return orders;
}


// ============================================================
// CANCEL ORDER
// ============================================================

async function cancelOrder(
  symbol,
  orderId
) {
  try {
    const response =
      await signedCall(
        "order.cancel",
        {
          symbol,
          orderId
        }
      );

    const result =
      response?.result;


    if (
      result?.orderId
    ) {
      accountState.orders[
        String(
          result.orderId
        )
      ] = result;
    }


    console.log(
      "❌ Order Cancelled:",
      result
    );


    return result;
  } catch (error) {
    console.error(
      "❌ Cancel Error:",
      error.message
    );

    throw error;
  }
}


// ============================================================
// CREATE LIMIT ORDER
// ============================================================

async function createLimitOrder(
  symbol,
  side,
  quantity,
  price
) {
  const info =
    await getExchangeInfo(
      symbol
    );

  const lotSize =
    getFilter(
      info,
      "LOT_SIZE"
    );

  const priceFilter =
    getFilter(
      info,
      "PRICE_FILTER"
    );

  let normalizedQuantity =
    Number(quantity);

  let normalizedPrice =
    Number(price);


  if (
    lotSize?.stepSize
  ) {
    normalizedQuantity =
      floorToStep(
        normalizedQuantity,
        lotSize.stepSize
      );
  }


  if (
    priceFilter?.tickSize
  ) {
    normalizedPrice =
      floorToStep(
        normalizedPrice,
        priceFilter.tickSize
      );
  }


  if (
    !Number.isFinite(
      normalizedQuantity
    ) ||
    normalizedQuantity <= 0
  ) {
    throw new Error(
      "Invalid order quantity"
    );
  }


  if (
    !Number.isFinite(
      normalizedPrice
    ) ||
    normalizedPrice <= 0
  ) {
    throw new Error(
      "Invalid order price"
    );
  }


  const response =
    await signedCall(
      "order.place",
      {
        symbol,
        side,
        type: "LIMIT",
        timeInForce: "GTC",
        quantity:
          normalizedQuantity,
        price:
          normalizedPrice,
        newOrderRespType:
          "RESULT"
      }
    );


  const result =
    response?.result;


  if (
    result?.orderId
  ) {
    accountState.orders[
      String(
        result.orderId
      )
    ] = result;
  }


  return result;
}


// ============================================================
// ACCOUNT STATE
// ============================================================

function getAccountState() {
  return {
    balances:
      getCachedBalances(),

    orders:
      getCachedOrders(),

    openOrders:
      getCachedOpenOrders(),

    lastUpdate:
      accountState.lastUpdate
  };
}


// ============================================================
// CONNECTION STATUS
// ============================================================

function getConnectionStatus() {
  return {
    connected,
    connecting,
    timeInitialized,
    wsApiUrl: WS_API_URL,
    userDataStream:
      connected && timeInitialized,
    pendingRequests:
      pendingRequests.size
  };
}


// ============================================================
// CLEANUP TIMER
// ============================================================

setInterval(() => {
  cleanupPendingRequests();
}, 5000);


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  connect,

  getConnectionStatus,

  onUserData,

  getAccount,

  getAccountState,

  getCachedBalance,

  getCachedBalances,

  getCachedOrders,

  getCachedOpenOrders,

  refreshAccountState,

  getKlines,

  getExchangeInfo,

  marketOrder,

  takeProfitOrder,

  getOrder,

  getMyTrades,

  getAllOrders,

  getAllOpenOrders,

  cancelOrder,

  createLimitOrder
};

/*

const WebSocket = require("ws");
const crypto = require("crypto");

const API_KEY = process.env.BINANCE_KEY;
const SECRET = process.env.BINANCE_SECRET;

const WS_API_URL =
  process.env.BINANCE_WS_API_URL ||
  "wss://ws-api.binance.com:443/ws-api/v3";

let ws = null;
let connected = false;
let connecting = false;

let requestId = 1;

const pendingRequests = new Map();

let serverTimeOffset = 0;
let timeInitialized = false;

const accountState = {
  balances: {},
  orders: {},
  lastUpdate: 0,
};

const exchangeInfoCache = {};

let reconnectTimer = null;

function generateId() {
  return `${Date.now()}-${requestId++}`;
}

function createSignature(params) {
  const keys = Object.keys(params)
    .filter((key) => key !== "signature")
    .sort();

  const payload = keys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");
}

function getTimestamp() {
  return Date.now() + serverTimeOffset;
}

function sendRaw(message) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return reject(new Error("Binance WebSocket is not connected"));
    }

    const id = message.id;

    pendingRequests.set(id, {
      resolve,
      reject,
      createdAt: Date.now(),
    });

    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}

function cleanupPendingRequests() {
  const now = Date.now();

  for (const [id, request] of pendingRequests.entries()) {
    if (now - request.createdAt > 30000) {
      request.reject(new Error("Binance WebSocket request timeout"));
      pendingRequests.delete(id);
    }
  }
}

async function connect() {
  if (connected && ws) {
    return;
  }

  if (connecting) {
    return new Promise((resolve, reject) => {
      const started = Date.now();

      const check = setInterval(() => {
        if (connected) {
          clearInterval(check);
          resolve();
          return;
        }

        if (Date.now() - started > 15000) {
          clearInterval(check);
          reject(new Error("Binance WebSocket connection timeout"));
        }
      }, 100);
    });
  }

  connecting = true;

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_API_URL);

    ws = socket;

    let settled = false;

    socket.on("open", async () => {
      connected = true;
      connecting = false;

      console.log("🟢 Binance WebSocket API connected");

      try {
        await syncServerTime();
        await subscribeUserDataStream();

        if (!settled) {
          settled = true;
          resolve();
        }
      } catch (error) {
        console.error(
          "❌ Binance WebSocket initialization error:",
          error.message
        );

        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });

    socket.on("message", (message) => {
      handleMessage(message);
    });

    socket.on("error", (error) => {
      console.error(
        "❌ Binance WebSocket API error:",
        error.message
      );

      if (!settled) {
        settled = true;
        connecting = false;
        reject(error);
      }
    });

    socket.on("close", () => {
      console.log(
        "🔴 Binance WebSocket API disconnected"
      );

      connected = false;
      connecting = false;
      ws = null;

      for (const [id, request] of pendingRequests.entries()) {
        request.reject(
          new Error("Binance WebSocket disconnected")
        );

        pendingRequests.delete(id);
      }

      scheduleReconnect();
    });
  });
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    try {
      await connect();

      console.log(
        "🟢 Binance WebSocket API reconnected"
      );

      await refreshAccountState();
    } catch (error) {
      console.error(
        "❌ Binance WebSocket reconnect failed:",
        error.message
      );

      scheduleReconnect();
    }
  }, 5000);
}

function handleMessage(message) {
  try {
    const data = JSON.parse(message.toString());

    if (data.id && pendingRequests.has(data.id)) {
      const request = pendingRequests.get(data.id);

      pendingRequests.delete(data.id);

      if (data.status && data.status >= 400) {
        const error = new Error(
          data.error?.msg ||
            data.error?.message ||
            "Binance WebSocket API error"
        );

        error.response = data;

        request.reject(error);
      } else {
        request.resolve(data);
      }

      return;
    }

    handleUserDataEvent(data);
  } catch (error) {
    console.error(
      "❌ Binance WebSocket message error:",
      error.message
    );
  }
}

function handleUserDataEvent(data) {
  if (!data || !data.event) {
    return;
  }

  accountState.lastUpdate = Date.now();

  if (data.event === "outboundAccountPosition") {
    const balances = data.B || [];

    for (const balance of balances) {
      accountState.balances[balance.a] = {
        asset: balance.a,
        free: parseFloat(balance.f),
        locked: parseFloat(balance.l),
      };
    }

    return;
  }

  if (data.event === "balanceUpdate") {
    const asset = data.a;

    if (!accountState.balances[asset]) {
      accountState.balances[asset] = {
        asset,
        free: 0,
        locked: 0,
      };
    }

    return;
  }

  if (data.event === "executionReport") {
    const orderId = String(data.i);
    const symbol = data.s;

    accountState.orders[orderId] = {
      orderId: data.i,
      symbol,
      side: data.S,
      type: data.o,
      status: data.X,
      price: parseFloat(data.p || 0),
      quantity: parseFloat(data.q || 0),
      executedQty: parseFloat(data.z || 0),
      lastExecutedQty: parseFloat(data.l || 0),
      lastExecutedPrice: parseFloat(data.L || 0),
      averagePrice:
        parseFloat(data.Z || 0) > 0 &&
        parseFloat(data.z || 0) > 0
          ? parseFloat(data.Z) / parseFloat(data.z)
          : 0,
      time: data.T,
      updateTime: Date.now(),
    };

    console.log(
      `[ORDER:${symbol}] ${data.S} ${data.o} -> ${data.X}`
    );
  }
}

async function syncServerTime() {
  const response = await sendRaw({
    id: generateId(),
    method: "time",
  });

  if (response?.result?.serverTime) {
    serverTimeOffset =
      response.result.serverTime - Date.now();

    timeInitialized = true;

    console.log(
      "🕐 Binance time synchronized"
    );
  }

  return response?.result?.serverTime;
}

async function ensureConnected() {
  if (!connected || !ws) {
    await connect();
  }

  if (!timeInitialized) {
    await syncServerTime();
  }
}

async function call(method, params = {}) {
  await ensureConnected();

  const id = generateId();

  return sendRaw({
    id,
    method,
    params,
  });
}

async function signedCall(method, params = {}) {
  await ensureConnected();

  const finalParams = {
    ...params,
    apiKey: API_KEY,
    timestamp: getTimestamp(),
  };

  finalParams.signature = createSignature(finalParams);

  const id = generateId();

  return sendRaw({
    id,
    method,
    params: finalParams,
  });
}

async function subscribeUserDataStream() {
  try {
    const params = {
      apiKey: API_KEY,
      timestamp: getTimestamp(),
    };

    params.signature = createSignature(params);

    const response = await call(
      "userDataStream.subscribe.signature",
      params
    );

    console.log(
      "🟢 Binance User Data Stream subscribed"
    );

    return response;
  } catch (error) {
    console.error(
      "❌ User Data Stream subscription failed:",
      error.message
    );

    throw error;
  }
}

async function getAccount() {
  const response = await signedCall(
    "account.status"
  );

  const account = response.result;

  if (account?.balances) {
    for (const balance of account.balances) {
      accountState.balances[balance.asset] = {
        asset: balance.asset,
        free: parseFloat(balance.free),
        locked: parseFloat(balance.locked),
      };
    }
  }

  return account;
}

async function refreshAccountState() {
  try {
    const account = await getAccount();

    if (account?.balances) {
      for (const balance of account.balances) {
        accountState.balances[balance.asset] = {
          asset: balance.asset,
          free: parseFloat(balance.free),
          locked: parseFloat(balance.locked),
        };
      }
    }

    const orders = await getAllOpenOrders();

    for (const order of orders) {
      accountState.orders[String(order.orderId)] =
        order;
    }

    return account;
  } catch (error) {
    console.error(
      "❌ Account state refresh failed:",
      error.message
    );

    throw error;
  }
}

function getCachedBalance(asset) {
  return (
    accountState.balances[asset] || {
      asset,
      free: 0,
      locked: 0,
    }
  );
}

function getCachedBalances() {
  return Object.values(accountState.balances);
}

function getCachedOrders() {
  return Object.values(accountState.orders);
}

function getCachedOpenOrders() {
  return Object.values(accountState.orders).filter(
    (order) =>
      order.status === "NEW" ||
      order.status === "PARTIALLY_FILLED"
  );
}

async function getKlines(
  symbol,
  interval = "15m",
  limit = 200
) {
  const response = await call("klines", {
    symbol,
    interval,
    limit,
  });

  return response.result || [];
}

async function getExchangeInfo(symbol) {
  if (exchangeInfoCache[symbol]) {
    return exchangeInfoCache[symbol];
  }

  const response = await call("exchangeInfo", {
    symbol,
  });

  const info = response.result?.symbols?.find(
    (item) => item.symbol === symbol
  );

  if (!info) {
    throw new Error(
      `Exchange info not found for ${symbol}`
    );
  }

  exchangeInfoCache[symbol] = info;

  return info;
}

async function marketOrder(
  symbol,
  side,
  quantity
) {
  const response = await signedCall(
    "order.place",
    {
      symbol,
      side,
      type: "MARKET",
      quantity,
      newOrderRespType: "FULL",
    }
  );

  return response.result;
}

async function takeProfitOrder(
  symbol,
  quantity,
  takeProfitPrice
) {
  try {
    const response = await signedCall(
      "order.place",
      {
        symbol,
        side: "SELL",
        type: "LIMIT",
        timeInForce: "GTC",
        quantity,
        price: takeProfitPrice,
        newOrderRespType: "RESULT",
      }
    );

    console.log(
      "✅ TP order created:",
      response.result
    );

    return response.result;
  } catch (error) {
    console.error(
      "❌ TP order error:",
      error.message
    );

    throw error;
  }
}

async function getOrder(
  symbol,
  orderId
) {
  const response = await signedCall(
    "order.status",
    {
      symbol,
      orderId,
    }
  );

  return response.result;
}

async function getMyTrades(symbol) {
  const response = await signedCall(
    "myTrades",
    {
      symbol,
    }
  );

  return response.result || [];
}

async function getAllOrders(symbol) {
  const response = await signedCall(
    "allOrders",
    {
      symbol,
    }
  );

  return response.result || [];
}

async function getAllOpenOrders() {
  const response = await signedCall(
    "openOrders"
  );

  const orders = response.result || [];

  for (const order of orders) {
    accountState.orders[String(order.orderId)] =
      order;
  }

  return orders;
}

async function cancelOrder(
  symbol,
  orderId
) {
  try {
    const response = await signedCall(
      "order.cancel",
      {
        symbol,
        orderId,
      }
    );

    const result = response.result;

    if (result?.orderId) {
      accountState.orders[
        String(result.orderId)
      ] = result;
    }

    console.log(
      "❌ Order Cancelled:",
      result
    );

    return result;
  } catch (error) {
    console.error(
      "❌ Cancel Error:",
      error.message
    );

    throw error;
  }
}

async function createLimitOrder(
  symbol,
  side,
  quantity,
  price
) {
  const response = await signedCall(
    "order.place",
    {
      symbol,
      side,
      type: "LIMIT",
      timeInForce: "GTC",
      quantity,
      price,
      newOrderRespType: "RESULT",
    }
  );

  const result = response.result;

  if (result?.orderId) {
    accountState.orders[
      String(result.orderId)
    ] = result;
  }

  return result;
}

function getAccountState() {
  return {
    balances: getCachedBalances(),
    orders: getCachedOrders(),
    openOrders: getCachedOpenOrders(),
    lastUpdate: accountState.lastUpdate,
  };
}

setInterval(() => {
  cleanupPendingRequests();
}, 5000);

module.exports = {
  connect,
  getAccount,
  getAccountState,
  getCachedBalance,
  getCachedBalances,
  getCachedOrders,
  getCachedOpenOrders,
  refreshAccountState,

  getKlines,
  getExchangeInfo,

  marketOrder,
  takeProfitOrder,

  getOrder,
  getMyTrades,
  getAllOrders,
  getAllOpenOrders,

  cancelOrder,
  createLimitOrder,
};
*/