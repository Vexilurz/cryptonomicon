const API_KEY =
  "dc5b16db1d772499cc70f00f5aaee937b4a0b03f343222d134ca65bc52f1a70a";

const tickersHandlers = new Map(); // tickerKey, [cb]
const socket = new WebSocket(
  `wss://streamer.cryptocompare.com/v2?api_key=${API_KEY}`
);

const sequenceOfTransform = ["USD", "BTC"];
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

function getTickersKey(ticker, toTicker) {
  return `${ticker}~${toTicker}`;
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
  ticker,
  toTicker = sequenceOfTransform[0]
) => {
  const subscribers = tickersHandlers.get(ticker) || [];
  const tickerKey = getTickersKey(ticker, toTicker);
  tickersHandlers.set(tickerKey, [...subscribers, callback]);
  subscribeToTickerOnWs(tickerKey);
};

export const unsubscribeFromTicker = (
  ticker,
  toTicker = sequenceOfTransform[0]
) => {
  const tickerKey = getTickersKey(ticker, toTicker);
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

    const idx = sequenceOfTransform.findIndex((item) => item === toCurrency);
    if (idx !== -1 && idx < sequenceOfTransform.length - 1) {
      subscribeToTicker(
        (newPrice, isValid) => {
          if (isValid) {
            console.log(fromCurrency, sequenceOfTransform[idx + 1], newPrice);
            let currIdx = idx + 1;
            let price = newPrice;
            let isCurrValid = true;
            while (currIdx > 0) {
              const tickerKey = getTickersKey(
                sequenceOfTransform[currIdx],
                sequenceOfTransform[currIdx - 1]
              );
              let multPrice = knownTransformsValues.get(tickerKey);
              console.log(tickerKey, multPrice);
              if (!multPrice) {
                multPrice = 0;
                isCurrValid = false;
              }
              price *= multPrice;
              currIdx--;
            }
            doCallbacks(
              getTickersKey(fromCurrency, sequenceOfTransform[0]),
              price,
              isCurrValid
            );
          }
        },
        fromCurrency,
        sequenceOfTransform[idx + 1]
      );
    }

    return;
  }

  if (type === AGGREGATE_INDEX && newPrice !== undefined) {
    doCallbacks(getTickersKey(fromCurrency, toCurrency), newPrice, true);
  }
});

function initKnownTransforms() {
  for (let i = 0; i < sequenceOfTransform.length - 1; i++) {
    const fromCurrency = sequenceOfTransform[i + 1];
    const toCurrency = sequenceOfTransform[i];
    subscribeToTicker(
      (newPrice, isValid) => {
        if (isValid)
          knownTransformsValues.set(
            getTickersKey(fromCurrency, toCurrency),
            newPrice
          );
      },
      fromCurrency,
      toCurrency
    );
  }
}

initKnownTransforms();
