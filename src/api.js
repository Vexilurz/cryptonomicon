const API_KEY =
  "dc5b16db1d772499cc70f00f5aaee937b4a0b03f343222d134ca65bc52f1a70a";

const tickersHandlers = new Map();
const socket = new WebSocket(
  `wss://streamer.cryptocompare.com/v2?api_key=${API_KEY}`
);

const AGGREGATE_INDEX = "5";
const SUB_ERROR = "500";
const INVALID_SUB = "INVALID_SUB";

socket.addEventListener("message", (e) => {
  const {
    TYPE: type,
    FROMSYMBOL: currency,
    PRICE: newPrice,
    MESSAGE: message,
    PARAMETER: parameter
  } = JSON.parse(e.data);
  if (type === SUB_ERROR && message === INVALID_SUB) {
    const splittedParams = parameter.split("~");
    doCallbacks(splittedParams[2], "-", false);
    return;
  }
  if (type === AGGREGATE_INDEX && newPrice !== undefined) {
    doCallbacks(currency, newPrice, true);
    return;
  }
});

function doCallbacks(currency, newPrice, isValid) {
  const handlers = tickersHandlers.get(currency) ?? [];
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

function getParameterString(ticker, toTicker = "USD") {
  return `5~CCCAGG~${ticker}~${toTicker}`;
}

function getSubAddMessage(ticker) {
  return {
    action: "SubAdd",
    subs: [getParameterString(ticker)]
  };
}

function getSubRemoveMessage(ticker) {
  return {
    action: "SubRemove",
    subs: [getParameterString(ticker)]
  };
}

function subscribeToTickerOnWs(ticker) {
  sendToWebSocket(getSubAddMessage(ticker));
}

function unsubscribeFromTickerOnWs(ticker) {
  sendToWebSocket(getSubRemoveMessage(ticker));
}

export const subscribeToTicker = (ticker, cb) => {
  const subscribers = tickersHandlers.get(ticker) || [];
  tickersHandlers.set(ticker, [...subscribers, cb]);
  subscribeToTickerOnWs(ticker);
};

export const unsubscribeFromTicker = (ticker) => {
  tickersHandlers.delete(ticker);
  unsubscribeFromTickerOnWs(ticker);
  // const subscribers = tickersHandlers.get(ticker) || [];
  // tickersHandlers.set(
  //   ticker,
  //   subscribers.filter((fn) => fn !== cb)
  // );
};
