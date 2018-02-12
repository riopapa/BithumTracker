
const MACD = require('technicalindicators').MACD;
const Stochastic = require('technicalindicators').Stochastic;

/**
 * calculateMACD : calculate MACD values
 *
 * - require "technicalindicators": "^1.0.20"
 * - generate MACD array
 *
 * @param closes {Array} : close prices array [close]
 * @return MACD {Array} : [{MACD, signal, histogram}]
 */

exports.calcMACD = (closes) => calculateMACD(closes);

function calculateMACD(closes){

    const m = {
        values: closes,
        fastPeriod: 8,
        slowPeriod: 17,
        signalPeriod: 5,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    };
    return MACD.calculate(m);
}
/**
 * calculateStochastic : calculate Stochastic values
 *
 * - require "technicalindicators": "^1.0.20"
 * - generate Stochastic array
 *
 * @param highs {Array} : close prices array [close]
 * @param lows {Array} : close prices array [close]
 * @param closes {Array} : close prices array [close]
 * @return Stochastic {Array} : [d, k}]
 */

exports.calcMACD = (closes) => calculateMACD(closes);

exports.calcStochastic = (highs, lows, closes) => calculateStochastic(highs, lows, closes);

function calculateStochastic(highs, lows, closes) {

    const s = {
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
    };
    return Stochastic.calculate(s);
}
