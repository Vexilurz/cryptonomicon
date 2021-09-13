/* eslint-disable prettier/prettier */
const API_KEY =
  "dc5b16db1d772499cc70f00f5aaee937b4a0b03f343222d134ca65bc52f1a70a";

export const loadTickers = (tickers) =>
  fetch(
    `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${tickers.join(
      ","
    )}&tsyms=USD&api_key=${API_KEY}`
  )
    .then((r) => r.json())
    .then((rawData) =>
      Object.fromEntries(
        Object.entries(rawData).map(([key, value]) => [key, value.USD])
      )
    );
