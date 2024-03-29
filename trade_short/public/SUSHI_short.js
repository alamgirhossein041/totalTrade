"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config");
const connect_1 = require("./binance/connect");
const balance_1 = require("./interfaces/binance/balance");
const calculator_1 = require("./utils/calculator");
const countOrders_1 = require("./operations/countOrders");
const configReader_1 = require("./utils/configReader");
const rounder_1 = require("./utils/rounder");
const telegram_1 = require("./telegram/telegram");
const { coin, tickerSize, profitPercent } = (0, configReader_1.getConfig)("SUSHI");
const binance = new connect_1.BinanceGlobal();
const calc = new calculator_1.Calculator(coin.slice(0, -4));
const telegram = new telegram_1.TelegaBot();
let recountedMiddlePrices;
let recountedQty;
let tierArray = [1, 0, 0, 0, 0, 0];
const zeroBuy = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { markPrice } = yield binance.getMarketPrice(coin);
        const middlePrices = yield calc.getAllMiddlePrices(markPrice);
        const qty = yield calc.buyQtyCoins(middlePrices);
        yield binance.marketSell(coin, qty[0]);
        const getPositionInfo = yield binance.getCoinInPositionShort(coin);
        if (getPositionInfo.length) {
            console.log("Zero sell:", getPositionInfo[0].positionAmt, getPositionInfo[0].symbol);
            yield telegram.sendSellMessage(getPositionInfo[0]);
            const limitPrice = (0, rounder_1.roundValue)(middlePrices[0] * (1 - (profitPercent[0] - 1)), tickerSize);
            const qty = +getPositionInfo[0].positionAmt * -1;
            const resultOnBuyOrder = yield binance.putLimitOrder({
                coin,
                limitPrice,
                qty,
                orderType: balance_1.OrderType.BUY,
                roundDecimals: 4,
            });
            console.log("Buy order ZERO:", resultOnBuyOrder);
            yield telegram.sendPutSellOrder(coin, qty, limitPrice);
        }
        recountedMiddlePrices = yield calc.getAllMiddlePrices(+getPositionInfo[0].entryPrice);
        recountedQty = yield calc.buyQtyCoins(recountedMiddlePrices);
        const allMiddleOrders = (0, countOrders_1.generateMiddleOrders)(recountedMiddlePrices, recountedQty, calc.coin, tickerSize, balance_1.OrderType.SELL);
        for (let middleOrder of allMiddleOrders) {
            console.log("Middle order", middleOrder);
            const result = yield binance.putLimitOrder(middleOrder);
            console.log("Result on put order:", result);
            yield telegram.sendPutSellMiddleOrder(middleOrder);
        }
    }
    catch (e) {
        console.log("Error in zero buy", e);
    }
});
// let tier = 6;
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const getPositionInfo = yield binance.getCoinInPositionShort(coin);
        if (!getPositionInfo.length) {
            const profit = yield binance.getProfitOnLastSell(coin);
            yield binance.cancelAllLimitsByCoin(coin);
            if (profit) {
                yield telegram.sendSellOrderFinished(coin, profit);
            }
            tierArray = [1, 0, 0, 0, 0, 0];
            yield zeroBuy();
            return;
        }
        console.log("Position info: ", {
            entryPrice: getPositionInfo[0].entryPrice,
            qty: getPositionInfo[0].positionAmt,
            pnl: getPositionInfo[0].unRealizedProfit,
        });
    }
    catch (e) {
        console.log("Eror in run block on get position", e);
    }
    try {
        const allExistingOrders = yield binance.getOpenedOrders(coin);
        console.log("Orders qnt: ", allExistingOrders.length);
        switch (allExistingOrders.length) {
            // 5 BUY + 1 SELL (ZERO SELL);
            case 6:
                break;
            // 4 BUY + 1 SELL (ZERO SELL);
            case 5:
                if (tierArray[1] === 0) {
                    try {
                        const buyOrdersResponse = yield binance.getBuyOrder(coin);
                        if (buyOrdersResponse) {
                            const [{ orderId: zeroSellOrderId }] = buyOrdersResponse;
                            yield binance.cancelLimitOrderById(coin, zeroSellOrderId);
                        }
                        const [{ positionAmt, entryPrice }] = yield binance.getCoinInPositionShort(coin);
                        const limitPrice = (0, rounder_1.roundValue)(+entryPrice * (1 - (profitPercent[1] - 1)), // Стоит 1 у.е. Цена на профит: 1 у.е. * (1 - (1 - 1.0038)) = 1 * (1 - 0.0038) = 1 * 0.9962
                        tickerSize);
                        yield binance.putLimitOrder({
                            coin,
                            limitPrice,
                            qty: +positionAmt * -1,
                            orderType: balance_1.OrderType.BUY,
                            roundDecimals: 4,
                        });
                        yield telegram.sendMiddlePutSell(coin, 1, +positionAmt, limitPrice);
                        tierArray[1] = 1;
                    }
                    catch (e) {
                        console.log("Error on case 5:", e);
                    }
                }
                break;
            // 3 BUY + 1 SELL (1 MIDLLE);
            case 4:
                if (tierArray[2] === 0) {
                    try {
                        const buyOrdersResponse = yield binance.getBuyOrder(coin);
                        if (buyOrdersResponse) {
                            const [{ orderId: zeroSellOrderId }] = buyOrdersResponse;
                            yield binance.cancelLimitOrderById(coin, zeroSellOrderId);
                        }
                        const [{ positionAmt, entryPrice }] = yield binance.getCoinInPositionShort(coin);
                        const limitPrice = (0, rounder_1.roundValue)(+entryPrice * (1 - (profitPercent[2] - 1)), tickerSize);
                        yield binance.putLimitOrder({
                            coin,
                            limitPrice,
                            qty: +positionAmt * -1,
                            orderType: balance_1.OrderType.BUY,
                            roundDecimals: 4,
                        });
                        yield telegram.sendMiddlePutSell(coin, 2, +positionAmt, limitPrice);
                        tierArray[2] = 1;
                    }
                    catch (e) {
                        console.log("Error on case 4:", e);
                    }
                }
                break;
            // 2 BUY + 1 SELL (2 MIDDLE);
            case 3:
                if (tierArray[3] === 0) {
                    try {
                        const buyOrdersResponse = yield binance.getBuyOrder(coin);
                        if (buyOrdersResponse) {
                            const [{ orderId: zeroSellOrderId }] = buyOrdersResponse;
                            yield binance.cancelLimitOrderById(coin, zeroSellOrderId);
                        }
                        const [{ positionAmt, entryPrice }] = yield binance.getCoinInPositionShort(coin);
                        const limitPrice = (0, rounder_1.roundValue)(+entryPrice * (1 - (profitPercent[3] - 1)), tickerSize);
                        yield binance.putLimitOrder({
                            coin,
                            limitPrice,
                            qty: +positionAmt * -1,
                            orderType: balance_1.OrderType.BUY,
                            roundDecimals: 4,
                        });
                        yield telegram.sendMiddlePutSell(coin, 3, +positionAmt, limitPrice);
                        tierArray[3] = 1;
                    }
                    catch (e) {
                        console.log("Error on case 3:", e);
                    }
                }
                break;
            // 1 BUY + 1 SELL (3 MIDDLE);
            case 2:
                if (tierArray[4] === 0) {
                    try {
                        const buyOrdersResponse = yield binance.getBuyOrder(coin);
                        if (buyOrdersResponse) {
                            const [{ orderId: zeroSellOrderId }] = buyOrdersResponse;
                            yield binance.cancelLimitOrderById(coin, zeroSellOrderId);
                        }
                        const [{ positionAmt, entryPrice }] = yield binance.getCoinInPositionShort(coin);
                        const limitPrice = (0, rounder_1.roundValue)(+entryPrice * (1 - (profitPercent[4] - 1)), tickerSize);
                        yield binance.putLimitOrder({
                            coin,
                            limitPrice,
                            qty: +positionAmt * -1,
                            orderType: balance_1.OrderType.BUY,
                            roundDecimals: 4,
                        });
                        yield telegram.sendMiddlePutSell(coin, 4, +positionAmt, limitPrice);
                        tierArray[4] = 1;
                    }
                    catch (e) {
                        console.log("Error on case 2:", e);
                    }
                }
                break;
            //0 BUY + 1 SELL (4 MIDDLE);
            case 1:
                if (tierArray[5] === 0) {
                    try {
                        const buyOrdersResponse = yield binance.getBuyOrder(coin);
                        if (buyOrdersResponse) {
                            const [{ orderId: zeroSellOrderId }] = buyOrdersResponse;
                            yield binance.cancelLimitOrderById(coin, zeroSellOrderId);
                        }
                        const [{ positionAmt, entryPrice }] = yield binance.getCoinInPositionShort(coin);
                        const limitPrice = (0, rounder_1.roundValue)(+entryPrice * (1 - (profitPercent[5] - 1)), tickerSize);
                        yield binance.putLimitOrder({
                            coin,
                            limitPrice,
                            qty: +positionAmt * -1,
                            orderType: balance_1.OrderType.BUY,
                            roundDecimals: 4,
                        });
                        yield telegram.sendMiddlePutSell(coin, 5, +positionAmt, limitPrice);
                        tierArray[5] = 1;
                    }
                    catch (e) {
                        console.log("Error on case 1:", e);
                    }
                }
                break;
        }
    }
    catch (e) {
        console.log("Error inside catch blocks or on getting openned orders:", e);
    }
    //
    // const getPositionInfo = await binance.getCoinInPosition(`${calc.coin}USDT`);
    // const result = await <Promise<BinanceBalance>>binance.getUSDTBalance();
    // console.log(result);
    // console.log('Counts for DOGEUSDT:\n');
    // const { markPrice } = await binance.getMarketPrice(order.coin);
    // console.log(markPrice);
    // const prices = await calc.getAllMiddlePrices(markPrice);
    // console.log(prices);
    // const qty = await calc.buyQtyCoins(prices);
    // console.log(qty);
    // const responseOnPutOrder = await binance.putLimitOrder(order)
    // console.log('Response after placing order', responseOnPutOrder);
    // const resultOnCloseOrder = await binance.cancelLimitOrderById(order.coin, 19482102343);
    // console.log('Result on closing order', resultOnCloseOrder);
    // const resultOnCancelOrder = await binance.cancelAllLimitsByCoin('TRXUSDT');
    // console.log(resultOnCancelOrder);
    // const allExistingOrders = await binance.getOpenedOrders();
    // console.log("Get all orders:", allExistingOrders);
    // const limitOnSell = await binance.getSellOrder(order.coin);
    // console.log(limitOnSell);
    // const ResultOnOpenedPositions = await binance.getAllOpenedPositions();
    // console.log(ResultOnOpenedPositions);
    // const ExisstPositionOrNot = await binance.getCoinInPosition('KAVAUSDT');
    // console.log(ExisstPositionOrNot);
});
const timer = () => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve("");
        }, 8000);
    });
});
const startBot = () => __awaiter(void 0, void 0, void 0, function* () {
    console.time("Time one cycle");
    try {
        run();
    }
    catch (e) {
        console.log(e);
    }
    yield timer();
    console.timeEnd("Time one cycle");
    console.log(coin);
    startBot();
});
startBot();
