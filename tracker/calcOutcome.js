
const RATE_HISTOGRAM = Number(process.env.HISTOGRAM);
const RATE_STOCHASTIC = Number(process.env.STOCHASTIC);
const RATE_BOUNDARY = Number(process.env.BOUNDARY);
const RATE_VOLUME = Number(process.env.VOLUME);
const RATE_SLOPE = Number(process.env.SLOPE);
const RATE_HILOW = Number(process.env.HILOW);

const SELL = 'S';
const BUY = 'B';

const numeral = require('numeral');
const npercent = (number) => numeral(number * 100).format('0,0.00') + '%';
const roundTo = require('round-to');

exports.msg = (nv, msg) => msg_append(nv, msg);

exports.Histogram = (nv, cf) => calculate_Histogram(nv, cf);
exports.Stochastic = (nv) => calculate_Stochastic(nv);
exports.Boundary = (nv, cf, bd) => calculate_Boundary(nv, cf, bd);
exports.Volume = (nv) => calculate_Volume(nv);
exports.HiLow = (nv) => calculate_HiLow(nv);
exports.Slope = (nv, cf) => calculate_Slope(nv, cf);

function msg_append(nv, msg) {
    if (msg) {
        nv.msgText += msg + '\n';
    }
}

/**
 * analyzeHistogram : annalyze histogram values against configuration setting and then alert if right time
 *
 *
 * @return nv.msgText if any
 */

function calculate_Histogram(nv, cf) {

    if (nv.histoSign) {
        const sellHisto = cf.sellPrice * (1 - cf.gapAllowance / 2);
        const buyHisto = cf.buyPrice * (1 + cf.gapAllowance / 2);

        let msg = '';
        if (nv.close > sellHisto) {
            nv.tradeType = SELL;
            msg = (nv.close > cf.sellPrice) ? 'Histo SAYS SELL, SELL' : 'Histo says sell';
            nv.outcome += RATE_HISTOGRAM * (1 + 30 * Math.abs(nv.close - sellHisto) / nv.close);
        }
        else if (nv.close < buyHisto) {
            nv.tradeType = BUY;
            msg = (nv.close < cf.buyPrice) ? 'Histo SAYS BUY, BUY' : 'Histo says buy';
            nv.outcome += RATE_HISTOGRAM * (1 + 30 * Math.abs(buyHisto - nv.close) / nv.close);
        }
        msg_append(nv, msg);
    }

}

/**
 * analyzeStochastic : annalyze Stochastic values against configuration setting and then alert if right time
 *
 *
 * @return nv.msgText if any
 */

function calculate_Stochastic(nv) {

    let msg = '';
    if ((nv.dLast >= 80 && nv.kLast >= 80) && (nv.dNow < 80 || nv.kNow < 80) && nv.close >= nv.sellTarget) {
        nv.tradeType = SELL;
        msg = 'Stochastic (d,k) SELL SELL';
        nv.outcome += RATE_STOCHASTIC * (0.5 + 0.05 * (nv.dLast + nv.kLast - nv.dNow - nv.kNow));
    }
    else if ((nv.dLast <= 20 && nv.kLast <= 20) && (nv.dNow > 20 || nv.kNow > 20) && nv.close <= nv.buyTarget) {
        nv.tradeType = BUY;
        msg = 'Stochastic (d,k) BUY BUY';
        nv.outcome += RATE_STOCHASTIC * (0.5 + 0.05 * (nv.dNow + nv.kNow - nv.dLast - nv.kLast));
    }
    msg_append(nv, msg);
}

/**
 * analyzeBoundary : review if current prices goes out of configured buy,sell prices
 *
 *
 * @return nv.msgText if any
 */

function calculate_Boundary(nv, cf, bd) {

    if (nv.close > cf.sellPrice) {
        nv.tradeType = SELL;
        let msg = 'Go over SELL boundary (' + bd.sell + ')';
        nv.outcome += RATE_BOUNDARY * (0.7 + 50 * (nv.close - cf.sellPrice) / nv.close);
        if (bd.sell++ > 3) {   // if goes over boundary several times, then adjust boundary temperary
            cf.sellPrice = roundTo(nv.close * (1 + cf.gapAllowance), cf.priceRadix + 1);
            bd.sell = 0;
            msg += '\nSELL PRICE adjusted temperary';
        }
        msg_append(nv, msg);
    }
    else if (nv.close < cf.buyPrice) {
        nv.tradeType = BUY;
        let msg = 'Go under BUY boundary (' + bd.buy + ')';
        nv.outcome += RATE_BOUNDARY * (0.7 + 50 * (cf.buyPrice - nv.close) / nv.close);
        if (bd.buy++ > 3) {
            cf.buyPrice = roundTo(nv.close * (1 - cf.gapAllowance), cf.priceRadix + 1);
            bd.buy = 0;
            msg += '\nBUY PRICE adjusted temperary';
        }
        msg_append(nv, msg);
    }
}


/**
 * calculate_Volume : compare lastest volumes against volume average
 *
 *
 * @return nv.msgText if any
 */

function calculate_Volume(nv) {

    let msg = '';
    const volumeRATE = 3;
    if (nv.volumeLast > nv.volumeAvr * volumeRATE) {
        msg = 'Big Volume (>' + roundTo(nv.volumeLast / nv.volumeAvr * 100,0) + '%), ';
        nv.outcome += RATE_VOLUME * (nv.volumeLast / nv.volumeAvr - 1.5)  * (nv.volumeLast / nv.volumeAvr - 1.5);
        if (nv.close > nv.sellTarget) {
            nv.tradeType = SELL;
            msg += 'SELL ?';
            nv.outcome += RATE_VOLUME * 0.5;
        }
        else if (nv.close < nv.buyTarget) {
            nv.tradeType = BUY;
            msg += 'BUY ?';
            nv.outcome += RATE_VOLUME * 0.5;
        }
        else if (nv.close > nv.pClose[2] * 1.02) {
            msg += 'UpUp';
        }
        else if (nv.close < nv.pClose[2] * 0.98) {
            msg += 'DnDn';
        }
        msg_append(nv, msg);
    }
}

/**
 * calculate_Slope : compare lastest price slope against slope average
 *
 *
 * @return nv.msgText if any
 */

function calculate_Slope(nv, cf) {

    if (nv.slopeLast > 0.001 && nv.slopeLast > nv.slopeAvr * 2.5) {
        nv.outcome += RATE_SLOPE * (1 + 0.2 * (nv.slopeLast / nv.slopeAvr));
        let UpDown = ((nv.pClose[2] - nv.close) < 0) ? 'UpUp' : 'DnDn';
        msg_append(nv, 'Rapid Slope ' + UpDown + ' (' +  npercent(nv.slopeLast / nv.slopeAvr) + ') [' + nv.slopeSign + ']');
    }

    if (nv.close < nv.pClose[2] * (1 - cf.updown)) {
        nv.tradeType = SELL;
        nv.outcome += RATE_SLOPE * (1 + (nv.pClose[2] - nv.close) / nv.close);
        msg_append(nv, 'DOWN Fast Price(' + npercent((nv.close - nv.pClose[2]) / nv.pClose[2]) + ') [' + nv.slopeSign + ']');
    }
    else if (nv.close > nv.pClose[2] * (1 + cf.updown)) {
        nv.tradeType = BUY;
        nv.outcome += RATE_SLOPE * (1 + (nv.close - nv.pClose[2]) / nv.close);
        msg_append(nv, 'UP Fast Price(' + npercent((nv.close - nv.pClose[2]) / nv.pClose[2]) + ') [' + nv.slopeSign + ']');
    }
}

/**
 * calculate_HiLow : compare lastest price hi-low gap against average
 *
 *
 * @return nv.msgText if any
 */

function calculate_HiLow(nv) {

    if (nv.hilowLast > nv.hilowAvr * 2) {       // over 200%
        if (nv.close > nv.sellTarget) {
            nv.outcome += RATE_HILOW * (0.8 + 0.5 * (nv.hilowLast / nv.hilowAvr))
                + RATE_HILOW * (nv.close - nv.sellTarget) / nv.close;
            msg_append(nv, 'Big HiLow (' +  npercent(nv.hilowLast / nv.hilowAvr) + ') SELL ???');
        }
        else if (nv.close < nv.buyTarget) {
            nv.outcome += RATE_HILOW * (0.8 + 0.5 * (nv.hilowLast / nv.hilowAvr))
                + RATE_HILOW * (nv.buyTarget - nv.close) / nv.close;
            msg_append(nv, 'Big HiLow (' +  npercent(nv.hilowLast / nv.hilowAvr) + ') BUY ???');
        }
    }
}
