const API_KEY =
  "dc5b16db1d772499cc70f00f5aaee937b4a0b03f343222d134ca65bc52f1a70a";

const tickersHandlers = new Map(); // tickerKey, [cb]
const socket = new WebSocket(
  `wss://streamer.cryptocompare.com/v2?api_key=${API_KEY}`
);

const targetTicker = "USD";
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

function getTickersKey(fromTicker, toTicker) {
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
  const tickerKey = getTickersKey(fromTicker, toTicker);
  const subscribers = tickersHandlers.get(tickerKey) || [];
  tickersHandlers.set(tickerKey, [...subscribers, callback]);
  subscribeToTickerOnWs(tickerKey);
};

export const unsubscribeFromTicker = (fromTicker, toTicker = targetTicker) => {
  const tickerKey = getTickersKey(fromTicker, toTicker);
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
    doCallbacks(getTickersKey(fromCurrency, toCurrency), "-", false);

    if (toCurrency === targetTicker) {
      subscribeToTicker(
        (newPrice, isValid) => {
          if (isValid) {
            knownTransformsValues.set(
              getTickersKey(fromCurrency, helperTicker),
              newPrice
            );
          }
        },
        fromCurrency,
        helperTicker
      );
    }

    return;
  }

  if (type === AGGREGATE_INDEX && newPrice !== undefined) {
    const tickerKey = getTickersKey(fromCurrency, toCurrency);
    doCallbacks(tickerKey, newPrice, true);
    if (knownTransformsValues.has(tickerKey)) {
      const keys = [...knownTransformsValues.keys()];
      keys.forEach((key) => {
        const splittedKey = key.split("~");
        const from = splittedKey[0];
        const to = splittedKey[1];

        if (
          tickerKey === getTickersKey(helperTicker, targetTicker) &&
          to === helperTicker
        ) {
          const price = newPrice * knownTransformsValues.get(key);
          doCallbacks(getTickersKey(from, targetTicker), price, true);
        }

        if (toCurrency === helperTicker) {
          const price =
            newPrice *
            knownTransformsValues.get(
              getTickersKey(helperTicker, targetTicker)
            );
          doCallbacks(getTickersKey(fromCurrency, targetTicker), price, true);
        }
      });
    }
  }
});

function initKnownTransforms() {
  subscribeToTicker(
    (newPrice, isValid) => {
      if (isValid)
        knownTransformsValues.set(
          getTickersKey(helperTicker, targetTicker),
          newPrice
        );
    },
    helperTicker,
    targetTicker
  );
}

initKnownTransforms();
