const API_KEY =
  "dc5b16db1d772499cc70f00f5aaee937b4a0b03f343222d134ca65bc52f1a70a";

const tickersHandlers = new Map(); // tickerKey, [cb]
const socket = new WebSocket(
  `wss://streamer.cryptocompare.com/v2?api_key=${API_KEY}`
);

const targetTicker = "RUB";
const helperTicker = "BTC";
const knownTransformsValues = new Map(); // tickerKey, price

const AGGREGATE_INDEX = "5";
const SUB_ERROR = "500";
const INVALID_SUB = "INVALID_SUB";

function doCallbacks(tickerKey, newPrice, isValid) {
  const handlers = tickersHandlers.get(tickerKey) ?? [];
  handlers.forEach((fn) => fn(newPrice, isValid));
}

function sendToWebSocket(message) {
  const stringifiedMessage = JSON.stringify(message);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(stringifiedMessage);
    return;
  }

  socket.addEventListener(
    "open",
    () => {
      socket.send(stringifiedMessage);
    },
    { once: true }
  );
}

function getTickerKey(fromTicker, toTicker) {
  return `${fromTicker}~${toTicker}`;
}
function getParameterString(tickerKey) {
  return `5~CCCAGG~${tickerKey}`;
}
function getSubAddMessage(tickerKey) {
  return {
    action: "SubAdd",
    subs: [getParameterString(tickerKey)]
  };
}
function getSubRemoveMessage(tickerKey) {
  return {
    action: "SubRemove",
    subs: [getParameterString(tickerKey)]
  };
}

function subscribeToTickerOnWs(tickerKey) {
  sendToWebSocket(getSubAddMessage(tickerKey));
}
function unsubscribeFromTickerOnWs(tickerKey) {
  sendToWebSocket(getSubRemoveMessage(tickerKey));
}

export const subscribeToTicker = (
  callback,
  fromTicker,
  toTicker = targetTicker
) => {
  const tickerKey = getTickerKey(fromTicker, toTicker);
  const subscribers = tickersHandlers.get(tickerKey) || [];
  tickersHandlers.set(tickerKey, [...subscribers, callback]);
  subscribeToTickerOnWs(tickerKey);
};

export const unsubscribeFromTicker = (fromTicker, toTicker = targetTicker) => {
  const tickerKey = getTickerKey(fromTicker, toTicker);
  tickersHandlers.delete(tickerKey);
  unsubscribeFromTickerOnWs(tickerKey);
  // const subscribers = tickersHandlers.get(ticker) || [];
  // tickersHandlers.set(
  //   ticker,
  //   subscribers.filter((fn) => fn !== cb)
  // );
};

socket.addEventListener("message", (e) => {
  let {
    TYPE: type,
    FROMSYMBOL: fromCurrency,
    TOSYMBOL: toCurrency,
    PRICE: newPrice,
    MESSAGE: message,
    PARAMETER: parameter
  } = JSON.parse(e.data);

  if (type === SUB_ERROR && message === INVALID_SUB) {
    const splittedParams = parameter.split("~");
    fromCurrency = splittedParams[2];
    toCurrency = splittedParams[3];
    doCallbacks(getTickerKey(fromCurrency, toCurrency), "-", false);
    if (toCurrency === targetTicker) subscribeToHelperTicker(fromCurrency);
    return;
  }

  if (type === AGGREGATE_INDEX && newPrice !== undefined) {
    const tickerKey = getTickerKey(fromCurrency, toCurrency);
    doCallbacks(tickerKey, newPrice, true);
    checkKnownTransformValues(fromCurrency, toCurrency, newPrice);
  }
});

function subscribeToHelperTicker(fromCurrency) {
  subscribeToTicker(
    (newPrice, isValid) => {
      if (isValid) {
        knownTransformsValues.set(
          getTickerKey(fromCurrency, helperTicker),
          newPrice
        );
      }
    },
    fromCurrency,
    helperTicker
  );
}

function checkKnownTransformValues(fromCurrency, toCurrency, newPrice) {
  const tickerKey = getTickerKey(fromCurrency, toCurrency);
  if (!knownTransformsValues.has(tickerKey)) return;
  const keys = [...knownTransformsValues.keys()];
  keys.forEach((key) => {
    const splittedKey = key.split("~");
    const from = splittedKey[0];
    const to = splittedKey[1];

    if (
      tickerKey === getTickerKey(helperTicker, targetTicker) &&
      to === helperTicker
    ) {
      const calculatedPrice = newPrice * knownTransformsValues.get(key);
      doCallbacks(getTickerKey(from, targetTicker), calculatedPrice, true);
    }

    if (toCurrency === helperTicker) {
      const calculatedPrice =
        newPrice *
        knownTransformsValues.get(getTickerKey(helperTicker, targetTicker));
      doCallbacks(
        getTickerKey(fromCurrency, targetTicker),
        calculatedPrice,
        true
      );
    }
  });
}

function initKnownTransforms() {
  subscribeToTicker(
    (newPrice, isValid) => {
      if (isValid)
        knownTransformsValues.set(
          getTickerKey(helperTicker, targetTicker),
          newPrice
        );
    },
    helperTicker,
    targetTicker
  );
}

initKnownTransforms();
