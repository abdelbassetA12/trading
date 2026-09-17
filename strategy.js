 
// ============================================================
// PROFESSIONAL SMC RE-ENTRY ENGINE V2
// ============================================================
//
// الهدف:
//
// - اكتشاف الاتجاه الحقيقي
// - CHOCH / BOS
// - Order Block
// - Liquidity Sweep
// - Pullback
// - Momentum Recovery
// - Re-entry داخل نفس الاتجاه
// - TP ديناميكي قصير
// - عدم انتظار CHOCH جديد لكل صفقة
//
// OUTPUT CONTRACT:
//
// BUY
// {
//   signal: "BUY",
//   trade: {
//     entry,
//     takeProfit,
//     orderBlock,
//     choch
//   }
// }
//
// WAIT
// {
//   signal: "WAIT_FOR_RETEST",
//   zone,
//   choch
// }
//
// HOLD
// {
//   signal: "HOLD"
// }
//
// ============================================================


// ============================================================
// CONFIG
// ============================================================

const CONFIG = {
  MIN_CANDLES: 100,

  SWING_LOOKBACK: 3,

  ATR_PERIOD: 14,

  STRUCTURE_LOOKBACK: 40,

  ORDER_BLOCK_LOOKBACK: 40,

  PULLBACK_LOOKBACK: 8,

  MOMENTUM_PERIOD: 4,

  RECENT_RANGE_PERIOD: 24,

  LOCAL_LEVEL_LOOKBACK: 12,

  // ----------------------------------------------------------
  // TP
  // ----------------------------------------------------------

  TP_ATR_BASE: 0.70,

  TP_ATR_MIN: 0.35,

  TP_ATR_MAX: 1.15,

  MAX_TP_PERCENT: 0.0045,

  RESISTANCE_BUFFER: 0.82,

  // ----------------------------------------------------------
  // Pullback
  // ----------------------------------------------------------

  MIN_PULLBACK_RATIO: 0.18,

  MAX_PULLBACK_RATIO: 0.65,

  // ----------------------------------------------------------
  // Momentum
  // ----------------------------------------------------------

  MOMENTUM_MIN: 0.0005,

  STRONG_MOMENTUM: 0.0010,

  // ----------------------------------------------------------
  // Candle quality
  // ----------------------------------------------------------

  MIN_BODY_RATIO: 0.40,

  // ----------------------------------------------------------
  // Re-entry
  // ----------------------------------------------------------

  REENTRY_LOOKBACK: 10,

  REENTRY_MIN_MOVE_ATR: 0.25,

  // ----------------------------------------------------------
  // OB
  // ----------------------------------------------------------

  OB_TOLERANCE: 0.35,
};


// ============================================================
// HELPERS
// ============================================================

const last = (array) =>
  array[array.length - 1];

const previous = (
  array,
  offset = 1
) =>
  array[array.length - 1 - offset];

const clamp = (
  value,
  min,
  max
) =>
  Math.max(
    min,
    Math.min(max, value)
  );


// ============================================================
// SWING POINTS
// ============================================================

const getSwingPoints = (
  highs,
  lows,
  lookback = CONFIG.SWING_LOOKBACK
) => {

  const swingHighs = [];
  const swingLows = [];

  for (
    let i = lookback;
    i < highs.length - lookback;
    i++
  ) {

    let isHigh = true;
    let isLow = true;

    for (
      let j = 1;
      j <= lookback;
      j++
    ) {

      if (
        highs[i] <= highs[i - j] ||
        highs[i] <= highs[i + j]
      ) {
        isHigh = false;
      }

      if (
        lows[i] >= lows[i - j] ||
        lows[i] >= lows[i + j]
      ) {
        isLow = false;
      }
    }

    if (isHigh) {
      swingHighs.push({
        index: i,
        value: highs[i],
      });
    }

    if (isLow) {
      swingLows.push({
        index: i,
        value: lows[i],
      });
    }
  }

  return {
    swingHighs,
    swingLows,
  };
};


// ============================================================
// MARKET STRUCTURE
// ============================================================

const detectTrend = (
  highs,
  lows
) => {

  const {
    swingHighs,
    swingLows,
  } =
    getSwingPoints(
      highs,
      lows
    );

  if (
    swingHighs.length < 2 ||
    swingLows.length < 2
  ) {
    return "sideways";
  }

  const h1 =
    previous(swingHighs, 1);

  const h2 =
    previous(swingHighs, 2);

  const l1 =
    previous(swingLows, 1);

  const l2 =
    previous(swingLows, 2);

  const higherHigh =
    h1.value > h2.value;

  const higherLow =
    l1.value > l2.value;

  const lowerHigh =
    h1.value < h2.value;

  const lowerLow =
    l1.value < l2.value;

  if (
    higherHigh &&
    higherLow
  ) {
    return "bullish";
  }

  if (
    lowerHigh &&
    lowerLow
  ) {
    return "bearish";
  }

  // السماح باستمرار الاتجاه
  // حتى لو لم تتأكد HH + HL معًا

  if (higherHigh) {
    return "bullish";
  }

  if (higherLow) {
    return "bullish";
  }

  if (lowerLow) {
    return "bearish";
  }

  if (lowerHigh) {
    return "bearish";
  }

  return "sideways";
};


// ============================================================
// STRUCTURE BREAK
// ============================================================

const detectStructureBreak = (
  highs,
  lows,
  closes
) => {

  const {
    swingHighs,
    swingLows,
  } =
    getSwingPoints(
      highs,
      lows
    );

  if (
    swingHighs.length < 2 ||
    swingLows.length < 2
  ) {
    return null;
  }

  const price =
    last(closes);

  const latestHigh =
    last(swingHighs);

  const previousHigh =
    previous(swingHighs);

  const latestLow =
    last(swingLows);

  const previousLow =
    previous(swingLows);

  // ----------------------------------------------------------
  // Bullish BOS / CHOCH
  // ----------------------------------------------------------

  if (
    price > latestHigh.value &&
    price > previousHigh.value
  ) {

    return {
      type: "CHOCH_BUY",
      direction: "bullish",
      level: previousHigh.value,
      breakLevel: latestHigh.value,
      index: closes.length - 1,
    };
  }

  // ----------------------------------------------------------
  // Bearish
  // ----------------------------------------------------------

  if (
    price < latestLow.value &&
    price < previousLow.value
  ) {

    return {
      type: "CHOCH_SELL",
      direction: "bearish",
      level: previousLow.value,
      breakLevel: latestLow.value,
      index: closes.length - 1,
    };
  }

  return null;
};


// ============================================================
// ATR
// ============================================================

const calculateATR = (
  candles,
  period = CONFIG.ATR_PERIOD
) => {

  if (
    candles.length <
    period + 1
  ) {
    return null;
  }

  const ranges = [];

  for (
    let i = 1;
    i < candles.length;
    i++
  ) {

    const current =
      candles[i];

    const previousCandle =
      candles[i - 1];

    const tr1 =
      current.high -
      current.low;

    const tr2 =
      Math.abs(
        current.high -
        previousCandle.close
      );

    const tr3 =
      Math.abs(
        current.low -
        previousCandle.close
      );

    ranges.push(
      Math.max(
        tr1,
        tr2,
        tr3
      )
    );
  }

  const recent =
    ranges.slice(-period);

  if (!recent.length) {
    return null;
  }

  return (
    recent.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / recent.length
  );
};


// ============================================================
// ORDER BLOCK
// ============================================================

const findOrderBlock = (
  candles,
  breakIndex,
  direction
) => {

  const start =
    Math.max(
      0,
      breakIndex -
        CONFIG.ORDER_BLOCK_LOOKBACK
    );

  for (
    let i = breakIndex - 1;
    i >= start;
    i--
  ) {

    const candle =
      candles[i];

    if (!candle) {
      continue;
    }

    // --------------------------------------------------------
    // Bullish OB
    // --------------------------------------------------------

    if (
      direction === "bullish" &&
      candle.close < candle.open
    ) {

      return {
        high: candle.high,
        low: candle.low,
        index: i,
        direction: "bullish",
      };
    }

    // --------------------------------------------------------
    // Bearish OB
    // --------------------------------------------------------

    if (
      direction === "bearish" &&
      candle.close > candle.open
    ) {

      return {
        high: candle.high,
        low: candle.low,
        index: i,
        direction: "bearish",
      };
    }
  }

  return null;
};


// ============================================================
// FIND MOST RELEVANT BULLISH OB
// ============================================================

const findRecentBullishOB = (
  candles
) => {

  const start =
    Math.max(
      0,
      candles.length -
        CONFIG.ORDER_BLOCK_LOOKBACK
    );

  for (
    let i = candles.length - 2;
    i >= start;
    i--
  ) {

    const candle =
      candles[i];

    if (
      candle.close <
      candle.open
    ) {

      const following =
        candles.slice(
          i + 1,
          Math.min(
            candles.length,
            i + 5
          )
        );

      const highestAfter =
        following.length
          ? Math.max(
              ...following.map(
                c => c.high
              )
            )
          : candle.high;

      if (
        highestAfter >
        candle.high
      ) {

        return {
          high: candle.high,
          low: candle.low,
          index: i,
          direction: "bullish",
        };
      }
    }
  }

  return null;
};


// ============================================================
// ORDER BLOCK PROXIMITY
// ============================================================

const isNearOB = (
  price,
  ob,
  atr
) => {

  if (!ob) {
    return false;
  }

  const size =
    Math.max(
      ob.high - ob.low,
      0
    );

  const tolerance =
    Math.max(
      size *
        CONFIG.OB_TOLERANCE,
      atr * 0.20
    );

  return (
    price >=
      ob.low - tolerance &&
    price <=
      ob.high + tolerance
  );
};


// ============================================================
// LIQUIDITY SWEEP
// ============================================================

const detectBullishSweep = (
  candles
) => {

  if (candles.length < 6) {
    return false;
  }

  const current =
    last(candles);

  const previousCandles =
    candles.slice(-6, -1);

  const previousLow =
    Math.min(
      ...previousCandles.map(
        c => c.low
      )
    );

  return (
    current.low <
      previousLow &&
    current.close >
      previousLow
  );
};


// ============================================================
// MOMENTUM
// ============================================================

const calculateMomentum = (
  candles,
  period = CONFIG.MOMENTUM_PERIOD
) => {

  if (
    candles.length <= period
  ) {
    return 0;
  }

  const current =
    last(candles).close;

  const old =
    candles[
      candles.length -
        1 -
        period
    ].close;

  if (!old) {
    return 0;
  }

  return (
    (current - old) /
    old
  );
};


// ============================================================
// CANDLE QUALITY
// ============================================================

const isStrongBullishCandle = (
  candle
) => {

  const range =
    candle.high -
    candle.low;

  if (range <= 0) {
    return false;
  }

  const body =
    Math.abs(
      candle.close -
      candle.open
    );

  const bodyRatio =
    body / range;

  return (
    candle.close >
      candle.open &&
    bodyRatio >=
      CONFIG.MIN_BODY_RATIO
  );
};


// ============================================================
// BULLISH MOMENTUM RECOVERY
// ============================================================

const detectMomentumRecovery = (
  candles
) => {

  if (candles.length < 4) {
    return false;
  }

  const current =
    last(candles);

  const previousCandle =
    previous(candles);

  const twoBack =
    previous(candles, 2);

  const currentBullish =
    isStrongBullishCandle(
      current
    );

  if (!currentBullish) {
    return false;
  }

  // شمعة سابقة هابطة أو ضعيفة
  const pullback =
    previousCandle.close <=
    previousCandle.open ||
    previousCandle.close <
    twoBack.close;

  // استعادة جزء من الحركة
  const recovery =
    current.close >
      previousCandle.high ||
    current.close >
      twoBack.close;

  return (
    pullback &&
    recovery
  );
};


// ============================================================
// PULLBACK ANALYSIS
// ============================================================

const analyzePullback = (
  candles,
  atr
) => {

  if (
    candles.length <
    CONFIG.PULLBACK_LOOKBACK + 2
  ) {
    return {
      valid: false,
      ratio: 0,
    };
  }

  const recent =
    candles.slice(
      -CONFIG.PULLBACK_LOOKBACK
    );

  const high =
    Math.max(
      ...recent.map(
        c => c.high
      )
    );

  const low =
    Math.min(
      ...recent.map(
        c => c.low
      )
    );

  const range =
    high - low;

  if (range <= 0) {
    return {
      valid: false,
      ratio: 0,
    };
  }

  const current =
    last(candles).close;

  const distanceFromHigh =
    high - current;

  const ratio =
    distanceFromHigh /
    range;

  const enoughMove =
    range >=
    atr *
      CONFIG.REENTRY_MIN_MOVE_ATR;

  const valid =
    ratio >=
      CONFIG.MIN_PULLBACK_RATIO &&
    ratio <=
      CONFIG.MAX_PULLBACK_RATIO &&
    enoughMove;

  return {
    valid,
    ratio,
    high,
    low,
    range,
  };
};


// ============================================================
// RECENT SUPPORT
// ============================================================

const findSupport = (
  candles,
  entry
) => {

  const lows =
    candles
      .slice(
        -CONFIG.LOCAL_LEVEL_LOOKBACK
      )
      .map(c => c.low)
      .filter(
        low => low < entry
      );

  if (!lows.length) {
    return null;
  }

  return Math.max(
    ...lows
  );
};


// ============================================================
// RECENT RESISTANCE
// ============================================================

const findResistance = (
  candles,
  entry
) => {

  const highs =
    candles
      .slice(
        -CONFIG.LOCAL_LEVEL_LOOKBACK
      )
      .map(c => c.high)
      .filter(
        high => high > entry
      );

  if (!highs.length) {
    return null;
  }

  return Math.min(
    ...highs
  );
};


// ============================================================
// RANGE POSITION
// ============================================================

const getRangePosition = (
  candles
) => {

  const recent =
    candles.slice(
      -CONFIG.RECENT_RANGE_PERIOD
    );

  if (!recent.length) {
    return 0.5;
  }

  const high =
    Math.max(
      ...recent.map(
        c => c.high
      )
    );

  const low =
    Math.min(
      ...recent.map(
        c => c.low
      )
    );

  const price =
    last(candles).close;

  if (high === low) {
    return 0.5;
  }

  return (
    (price - low) /
    (high - low)
  );
};


// ============================================================
// TP ENGINE V2
// ============================================================
 

 
 
const calculateTakeProfit = ({
  entry,
  atr,
  candles,
  momentum,
}) => {

  // ----------------------------------------------------------
  // قوة الحركة
  // ----------------------------------------------------------

  let multiplier =
    CONFIG.TP_ATR_BASE;

  if (
    momentum >=
    CONFIG.STRONG_MOMENTUM
  ) {

    multiplier =
      CONFIG.TP_ATR_BASE *
      1.20;
  }

  if (
    momentum <
    CONFIG.MOMENTUM_MIN
  ) {

    multiplier =
      CONFIG.TP_ATR_BASE *
      0.85;
  }

  multiplier =
    clamp(
      multiplier,
      CONFIG.TP_ATR_MIN,
      CONFIG.TP_ATR_MAX
    );

  let distance =
    atr * multiplier;

  // ----------------------------------------------------------
  // الحد الأقصى بالنسبة للسعر
  // ----------------------------------------------------------

  const maxDistance =
    entry *
    CONFIG.MAX_TP_PERCENT;

  distance =
    Math.min(
      distance,
      maxDistance
    );

  // ----------------------------------------------------------
  // المقاومة القريبة
  // ----------------------------------------------------------

  const resistance =
    findResistance(
      candles,
      entry
    );

  if (
    resistance &&
    resistance > entry
  ) {

    const resistanceDistance =
      resistance - entry;

    if (
      resistanceDistance >
        atr *
          CONFIG.TP_ATR_MIN &&
      resistanceDistance <
        distance
    ) {

      distance =
        resistanceDistance *
        CONFIG.RESISTANCE_BUFFER;
    }
  }

  // ----------------------------------------------------------
  // minimum
  // ----------------------------------------------------------

  const minimum =
    atr *
    CONFIG.TP_ATR_MIN;

  distance =
    Math.max(
      distance,
      minimum
    );

  return entry + distance;
}; 
 

// ============================================================
// ENTRY QUALITY
// ============================================================

const calculateEntryQuality = ({
  trend,
  momentum,
  sweep,
  continuation,
  pullback,
  nearOB,
}) => {

  let score = 0;

  if (
    trend === "bullish"
  ) {
    score += 2;
  }

  if (
    momentum >=
    CONFIG.MOMENTUM_MIN
  ) {
    score += 2;
  }

  if (sweep) {
    score += 2;
  }

  if (continuation) {
    score += 2;
  }

  if (pullback) {
    score += 2;
  }

  if (nearOB) {
    score += 2;
  }

  return score;
};


// ============================================================
// BUILD BUY SIGNAL
// ============================================================

const buildBuySignal = ({
  price,
  atr,
  candles,
  orderBlock,
  structureBreak,
  momentum,
}) => {

  const tp =
    calculateTakeProfit({
      entry: price,
      atr,
      candles,
      momentum,
    });

  if (
    !tp ||
    tp <= price
  ) {
    return null;
  }

  return {
    signal: "BUY",

    trade: {
      entry: price,

      takeProfit: tp,

      orderBlock,

      choch:
        structureBreak || {
          type: "REENTRY_BUY",
          direction: "bullish",
          level:
            orderBlock
              ? orderBlock.high
              : price,
          index:
            candles.length - 1,
        },
    },
  };
};


// ============================================================
// MAIN
// ============================================================

const generateSignal = (
  candles
) => {

  // ----------------------------------------------------------
  // Validation
  // ----------------------------------------------------------

  if (
    !Array.isArray(candles) ||
    candles.length <
      CONFIG.MIN_CANDLES
  ) {
    return {
      signal: "HOLD",
    };
  }

  // ----------------------------------------------------------
  // Normalize
  // ----------------------------------------------------------

  const data =
    candles
      .map(c => ({
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
      .filter(
        c =>
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
      );

  if (
    data.length <
    CONFIG.MIN_CANDLES
  ) {
    return {
      signal: "HOLD",
    };
  }

  const closes =
    data.map(
      c => c.close
    );

  const highs =
    data.map(
      c => c.high
    );

  const lows =
    data.map(
      c => c.low
    );

  const price =
    last(closes);

  // ----------------------------------------------------------
  // ATR
  // ----------------------------------------------------------

  const atr =
    calculateATR(data);

  if (
    !atr ||
    atr <= 0
  ) {
    return {
      signal: "HOLD",
    };
  }

  // ----------------------------------------------------------
  // Trend
  // ----------------------------------------------------------

  const trend =
    detectTrend(
      highs,
      lows
    );

  // ----------------------------------------------------------
  // Structure break
  // ----------------------------------------------------------

  const structureBreak =
    detectStructureBreak(
      highs,
      lows,
      closes
    );

  // ----------------------------------------------------------
  // Momentum
  // ----------------------------------------------------------

  const momentum =
    calculateMomentum(
      data
    );

  const momentumConfirmed =
    momentum >=
    CONFIG.MOMENTUM_MIN;

  const strongMomentum =
    momentum >=
    CONFIG.STRONG_MOMENTUM;

  // ----------------------------------------------------------
  // Sweep
  // ----------------------------------------------------------

  const liquiditySweep =
    detectBullishSweep(
      data
    );

  // ----------------------------------------------------------
  // Momentum recovery
  // ----------------------------------------------------------

  const momentumRecovery =
    detectMomentumRecovery(
      data
    );

  // ----------------------------------------------------------
  // Pullback
  // ----------------------------------------------------------

  const pullback =
    analyzePullback(
      data,
      atr
    );

  // ----------------------------------------------------------
  // Order Block
  // ----------------------------------------------------------

  let orderBlock = null;

  if (
    structureBreak &&
    structureBreak.direction ===
      "bullish"
  ) {

    orderBlock =
      findOrderBlock(
        data,
        structureBreak.index,
        "bullish"
      );
  }

  if (!orderBlock) {

    orderBlock =
      findRecentBullishOB(
        data
      );
  }

  // ----------------------------------------------------------
  // OB proximity
  // ----------------------------------------------------------

  const nearOB =
    isNearOB(
      price,
      orderBlock,
      atr
    );

  // ==========================================================
  // MARKET FILTER
  // ==========================================================

  //
  // لا نريد شراء داخل اتجاه هابط واضح.
  //

  if (
    trend === "bearish" &&
    !liquiditySweep
  ) {

    return {
      signal: "HOLD",
    };
  }

  // ==========================================================
  // SETUP A
  // FRESH STRUCTURE BREAK
  // ==========================================================

  if (
    structureBreak &&
    structureBreak.direction ===
      "bullish"
  ) {

    const strongSetup =
      momentumConfirmed ||
      liquiditySweep ||
      momentumRecovery;

    if (
      strongSetup &&
      orderBlock
    ) {

      if (nearOB) {

        const signal =
          buildBuySignal({
            price,
            atr,
            candles: data,
            orderBlock,
            structureBreak,
            momentum,
          });

        if (signal) {
          return signal;
        }
      }

      // إذا كسر السعر الهيكل
      // لكن لم يعد للـ OB بعد
      return {
        signal: "WAIT_FOR_RETEST",

        zone: orderBlock,

        choch: structureBreak,
      };
    }
  }

  // ==========================================================
  // SETUP B
  // RE-ENTRY NEAR ORDER BLOCK
  // ==========================================================

  if (
    trend === "bullish" &&
    nearOB
  ) {

    const confirmation =
      liquiditySweep ||
      momentumRecovery ||
      strongMomentum;

    if (confirmation) {

      const signal =
        buildBuySignal({
          price,
          atr,
          candles: data,
          orderBlock,
          structureBreak,
          momentum,
        });

      if (signal) {
        return signal;
      }
    }

    return {
      signal: "WAIT_FOR_RETEST",

      zone: orderBlock,

      choch:
        structureBreak || {
          type: "REENTRY_OB",
          direction: "bullish",
          level: orderBlock.high,
          index: orderBlock.index,
        },
    };
  }

  // ==========================================================
  // SETUP C
  // PULLBACK + MOMENTUM RECOVERY
  // ==========================================================
  //
  // هذا هو الجزء الأساسي للـ RE-ENTRY.
  //
  // لا نحتاج CHOCH جديد.
  //
  // الاتجاه موجود
  // ↓
  // السعر يصحح
  // ↓
  // الزخم يعود
  // ↓
  // BUY
  //
  // ==========================================================

  if (
    trend === "bullish" &&
    pullback.valid
  ) {

    const confirmation =
      momentumRecovery ||
      liquiditySweep ||
      strongMomentum;

    if (confirmation) {

      const support =
        findSupport(
          data,
          price
        );

      if (
        support &&
        support < price
      ) {

        const syntheticOB =
          orderBlock || {
            high: price,
            low: support,
            index:
              data.length - 1,
            direction: "bullish",
          };

        const signal =
          buildBuySignal({
            price,
            atr,
            candles: data,
            orderBlock:
              syntheticOB,
            structureBreak,
            momentum,
          });

        if (signal) {
          return signal;
        }
      }
    }
  }

  // ==========================================================
  // SETUP D
  // LIQUIDITY SWEEP RE-ENTRY
  // ==========================================================

  if (
    trend === "bullish" &&
    liquiditySweep &&
    price >
      previous(lows)
  ) {

    const support =
      findSupport(
        data,
        price
      );

    if (
      support &&
      support < price
    ) {

      const syntheticOB =
        orderBlock || {
          high: price,
          low: support,
          index:
            data.length - 1,
          direction: "bullish",
        };

      const signal =
        buildBuySignal({
          price,
          atr,
          candles: data,
          orderBlock:
            syntheticOB,
          structureBreak,
          momentum,
        });

      if (signal) {
        return signal;
      }
    }
  }

  // ==========================================================
  // SETUP E
  // PURE CONTINUATION
  // ==========================================================
  //
  // إذا كان الاتجاه قويًا جدًا،
  // والسعر استعاد الزخم بعد Pullback،
  // لا ننتظر OB جديد.
  //
  // ==========================================================

  if (
    trend === "bullish" &&
    pullback.valid &&
    momentumRecovery &&
    momentumConfirmed
  ) {

    const support =
      findSupport(
        data,
        price
      );

    if (
      support &&
      price > support
    ) {

      const continuationOB =
        orderBlock || {
          high: price,
          low: support,
          index:
            data.length - 1,
          direction: "bullish",
        };

      const signal =
        buildBuySignal({
          price,
          atr,
          candles: data,
          orderBlock:
            continuationOB,
          structureBreak,
          momentum,
        });

      if (signal) {
        return signal;
      }
    }
  }

  // ==========================================================
  // WAIT FOR PULLBACK
  // ==========================================================

  if (
    trend === "bullish" &&
    orderBlock &&
    !nearOB
  ) {

    return {
      signal: "WAIT_FOR_RETEST",

      zone: orderBlock,

      choch:
        structureBreak || {
          type: "BULLISH_REENTRY_ZONE",
          direction: "bullish",
          level: orderBlock.high,
          index: orderBlock.index,
        },
    };
  }

  // ==========================================================
  // HOLD
  // ==========================================================

  return {
    signal: "HOLD",
  };
};


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  generateSignal,
};
 