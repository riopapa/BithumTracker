const CURRENCY = process.env.CURRENCY;
const currency = CURRENCY.toLowerCase();

const LOG = process.env.LOG;
const format = require('string-format');
format.extend(String.prototype);

const Promise = require('bluebird');
const bhttp = require('bhttp');

const momenttimezone = require('moment-timezone');
const TIMEZONE = 'Asia/Seoul';
const dateFormat = (epoch) => momenttimezone(epoch).tz(TIMEZONE).format('MM-DD HH:mm');

const pad = require('pad');
const numeral = require('numeral');
const npercent = (number) => numeral(number * 100).format('0,0.00') + '%';
const NPAD_SIZE = Number(process.env.NPAD_SIZE);
const npad = (number) => pad(NPAD_SIZE, numeral((number)).format('0,0'));

const roundTo = require('round-to');
const show = require('./showCoinValues.js');
const replier = require('./replier.js');
const notifier = require('./notifier.js');

const MACD = require('technicalindicators').MACD;
const Stochastic = require('technicalindicators').Stochastic;

// Stream Roller
const rollers = require('streamroller');
const stream = new rollers.RollingFileStream(LOG + currency + '/' + process.env.TREND_FILENAME, 1000000, 2);

const Watcher = require('watch-files');
const watcher = Watcher({
    interval: '0.5s'
});
const json = require('json-file');
let readConfigFile = (path) => new json.read(path);

const CONFIG = process.env.CONFIG;  // configuration folder with '/'
const CONFIG_FILE = CONFIG + currency + '/' + process.env.CONFIG_FILENAME;

// LOGGER
let log4js = require('log4js');
const logger = log4js.getLogger('analyzer:' + currency);

const EOL = require('os').EOL;
const replaceall = require('replaceall');
let isFirstTime = true; // inform current setting when this module is started
let lastepoch = 0;
let lastsame = 0;
let lastbithumb = 0;

let config = readConfigFile(CONFIG_FILE).data;
let sellBoundaryCount = 0;
let buyBoundaryCount = 0;
let nowValues = {};

watcher.add(CONFIG_FILE);
watcher.on('change', (info) => {
    config = readConfigFile(info.path).data;
    logger.debug('configration changed');
    sellBoundaryCount = 0;
    buyBoundaryCount = 0;

});

const volumeCOUNT = 4;   // if recent volume goes high then...
const volumeCOUNTMAX = volumeCOUNT * 6;
const slopeCOUNT = 3;   // if price varying slope is high then...
const slopeCOUNTMAX = slopeCOUNT * 6;
const hilowCOUNT = 3;   // if price varying slope is high then...
const hilowCOUNTMAX = hilowCOUNT * 5;
const ohlcCrawler = require('./ohlcCrawler.js');
ohlcCrawler.getEmitter().on('event', listener);

const SELL = 'S';
const BUY = 'B';

const RATE_HISTOGRAM = Number(process.env.HISTOGRAM);
const RATE_STOCHASTIC = Number(process.env.STOCHASTIC);
const RATE_BOUNDARY = Number(process.env.BOUNDARY);
const RATE_VOLUME = Number(process.env.VOLUME);
const RATE_SLOPE = Number(process.env.SLOPE);
const RATE_HILOW = Number(process.env.HILOW);
const RATE_INFORM = Number(process.env.INFORM);

let outcomes = [];
let outMsgs = [];

let bithumbCrawler = () => {
    Promise.try(() => bhttp.get('https://api.bithumb.com/public/ticker/' + currency))
        .then(response => {
//            {"status":"0000","data":{
//              "opening_price":"17786000","closing_price":"19144000","min_price":"17750000","max_price":"19900000",
//              "average_price":"19080605.9105","units_traded":"72509.15826464","volume_1day":"72509.15826464",
//              "volume_7day":"642811.43325903","buy_price":"19121000","sell_price":"19144000","date":"1513038662469"}}
            if (response.body.status === '0000') {
                const price = Number(response.body.data.closing_price);
                const ts = Number(response.body.data.date);
                const msg = 'Bithumb' + npad(Number(price)) + ', ' + dateFormat(new Date(ts));
                logger.info(msg + ', SAME ' + CURRENCY + ' since ' + dateFormat(lastepoch * 1000) + ' [' + lastsame + ']' );
            }
            else {
                korbitCrawler();
            }
        }).catch((e) => {
        logger.error(e);
    });
};

let korbitCrawler = () => {
    Promise.try(() => bhttp.get('https://api.korbit.co.kr/v1/ticker?currency_pair=' + currency + '_krw', {decodeJSON: true}))
        .then(response => {
            let body = response.body;
//            {"timestamp":1513037980658,"last":"18900000"}
            const ts = Number(body.timestamp);
            const price = Number(body.last);
            const msg = 'KORBIT' + npad(price) + ', ' + dateFormat(new Date(ts));
            logger.warn(msg + ', No Response from BITHUMB (' + CURRENCY + ') and from CW since ' + dateFormat(lastepoch * 1000) );
        }).catch((e) => {
        logger.error(e);
    });
};

/**
 * isCWDead : verify whether given array values are same with previous
 *
 * @param epoch : last time in epochs[]
 * @returns {boolean}
 */

function isCWDead(epoch) {
    if (epoch === lastepoch) {
        logger.debug(dateFormat(epoch * 1000) + ' is same as before ' + lastsame);
        if (++lastsame % 10 === 9) {
            bithumbCrawler();
            lastbithumb++;
        }
        return true;
    }
    return false;
}

/**
 * calculateMACD : calculate MACD values
 *
 * - require "technicalindicators": "^1.0.20"
 * - generate MACD array
 *
 * @param closes {Array} : close prices array [close]
 * @return MACD {Array} : [{MACD, signal, histogram}]
 */

function calculateMACD(closes) {

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

function isSignChanged(before,after) {

    // to flag on if recent histogram sign has been changed
    return (before >= 0 && after <= 0) || (before <= 0 && after >= 0);
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

/**
 * analyzeHistogram : annalyze histogram values against configuration setting and then alert if right time
 *
 *
 * @return nv.msgText if any
 */

function analyzeHistogram() {

    if (nowValues.histoSign) {
        const sellHisto = config.sellPrice * (1 - config.gapAllowance / 2);
        const buyHisto = config.buyPrice * (1 + config.gapAllowance / 2);

        let msg = '';
        if (nowValues.close > sellHisto) {
            nowValues.tradeType = SELL;
            msg = (nowValues.close > config.sellPrice) ? 'Histo SAYS SELL, SELL' : 'Histo says sell';
            nowValues.outcome += RATE_HISTOGRAM * (1 + 30 * Math.abs(nowValues.close - sellHisto) / nowValues.close);
        }
        else if (nowValues.close < buyHisto) {
            nowValues.tradeType = BUY;
            msg = (nowValues.close < config.buyPrice) ? 'Histo SAYS BUY, BUY' : 'Histo says buy';
            nowValues.outcome += RATE_HISTOGRAM * (1 + 30 * Math.abs(buyHisto - nowValues.close) / nowValues.close);
        }
        appendMsg(msg);
    }

}

/**
 * analyzeStochastic : annalyze Stochastic values against configuration setting and then alert if right time
 *
 *
 * @return nv.msgText if any
 */

function analyzeStochastic() {

    let msg = '';
    if ((nowValues.dLast >= 80 && nowValues.kLast >= 80) && (nowValues.dNow < 80 || nowValues.kNow < 80) && nowValues.close >= nowValues.sellTarget) {
        nowValues.tradeType = SELL;
        msg = 'Stochastic (d,k) SELL SELL';
        nowValues.outcome += RATE_STOCHASTIC * (0.5 + 0.03 * (nowValues.dLast + nowValues.kLast - nowValues.dNow - nowValues.kNow));
    }
    else if ((nowValues.dLast <= 20 && nowValues.kLast <= 20) && (nowValues.dNow > 20 || nowValues.kNow > 20) && nowValues.close <= nowValues.buyTarget) {
        nowValues.tradeType = BUY;
        msg = 'Stochastic (d,k) BUY BUY';
        nowValues.outcome += RATE_STOCHASTIC * (0.5 + 0.03 * (nowValues.dNow + nowValues.kNow - nowValues.dLast - nowValues.kLast));
    }
    appendMsg(msg);
}

/**
 * analyzeBoundary : review if current prices goes out of configured buy,sell prices
 *
 *
 * @return nv.msgText if any
 */

function analyzeBoundary() {

    if (nowValues.close > config.sellPrice) {
        nowValues.tradeType = SELL;
        let msg = '△△Go over SELL boundary△△ (' + sellBoundaryCount + ')';
        nowValues.outcome += RATE_BOUNDARY * (0.5 + 30 * (nowValues.close - config.sellPrice) / nowValues.close);
        if (sellBoundaryCount++ > 3) {   // if goes over boundary several times, then adjust boundary temperary
            config.sellPrice = roundTo(nowValues.close * (1 + config.gapAllowance),config.priceRadix + 1);
            sellBoundaryCount = 0;
            msg += '\nSELL PRICE adjusted temperary';
        }
        appendMsg(msg);
    }
    else if (nowValues.close < config.buyPrice) {
        nowValues.tradeType = BUY;
        let msg = '▽▽Go under BUY boundary▽▽ (' + buyBoundaryCount + ')';
        nowValues.outcome += RATE_BOUNDARY * (0.5 + 30 * (config.buyPrice - nowValues.close) / nowValues.close);
        if (buyBoundaryCount++ > 3) {
            config.buyPrice = roundTo(nowValues.close * (1 - config.gapAllowance), config.priceRadix + 1);
            buyBoundaryCount = 0;
            msg += '\nBUY PRICE adjusted temperary';
        }
        appendMsg(msg);
    }
}

/**
 * analyzeVolume : compare lastest volumes against volume average
 *
 *
 * @return nv.msgText if any
 */

function analyzeVolume() {

    let msg = '';
    const volumeRATE = 2.5;
    if (nowValues.volumeLast > nowValues.volumeAvr * volumeRATE) {
        msg = 'Big Volume (>' + roundTo(nowValues.volumeLast / nowValues.volumeAvr * 100,0) + '%), ';
        nowValues.outcome += RATE_VOLUME * (nowValues.volumeLast / nowValues.volumeAvr - 1);
        if (nowValues.close > nowValues.sellTarget) {
            nowValues.tradeType = SELL;
            msg += 'SELL ?';
            nowValues.outcome += RATE_VOLUME * 0.3;
        }
        else if (nowValues.close < nowValues.buyTarget) {
            nowValues.tradeType = BUY;
            msg += 'BUY ?';
            nowValues.outcome += RATE_VOLUME * 0.3;
        }
        else {
            msg += 'BUY/SELL ?';
        }
        appendMsg(msg);
    }
}

/**
 * analyzeSlope : compare lastest price slope against slope average
 *
 *
 * @return nv.msgText if any
 */

function analyzeSlope() {

    if (nowValues.slopeLast > 0.002 && nowValues.slopeLast > nowValues.slopeAvr * 2.5) {
        nowValues.outcome += RATE_SLOPE * (0.5 + 0.3 * (nowValues.slopeLast / nowValues.slopeAvr));
        appendMsg('Rapid Slope Change (' +  npercent(nowValues.slopeLast / nowValues.slopeAvr) + ') [' + nowValues.slopeSign + ']');
    }

    if (nowValues.close < nowValues.pClose[2] * (1 - config.updown)) {
        nowValues.tradeType = SELL;
        nowValues.outcome += RATE_SLOPE * (0.8 * (nowValues.pClose[2] - nowValues.close) / nowValues.close);
        appendMsg('DOWN Fast Price(' + npercent((nowValues.close - nowValues.pClose[2]) / nowValues.pClose[2]) + ') [' + nowValues.slopeSign + ']');
    }
    else if (nowValues.close > nowValues.pClose[2] * (1 + config.updown)) {
        nowValues.tradeType = BUY;
        nowValues.outcome += RATE_SLOPE * (0.8 * (nowValues.close - nowValues.pClose[2]) / nowValues.close);
        appendMsg('UP Fast Price(' + npercent((nowValues.close - nowValues.pClose[2]) / nowValues.pClose[2]) + ') [' + nowValues.slopeSign + ']');
    }
}

/**
 * analyzeHiLow : compare lastest price hi-low gap against average
 *
 *
 * @return nv.msgText if any
 */

function analyzeHiLow() {

    if (nowValues.hilowLast > nowValues.hilowAvr * 2) {
        if (nowValues.close > nowValues.sellTarget) {
            nowValues.outcome += RATE_HILOW * (1 + 0.5 * (nowValues.hilowLast / nowValues.hilowAvr))
                                + RATE_HILOW * (nowValues.close - nowValues.sellTarget) / nowValues.close;
            appendMsg('Big HiLow (' +  npercent(nowValues.hilowLast / nowValues.hilowAvr) + ') SELL ???');
        }
        else if (nowValues.close < nowValues.buyTarget) {
            nowValues.outcome += RATE_HILOW * (1 + 0.5 * (nowValues.hilowLast / nowValues.hilowAvr))
                                + RATE_HILOW * (nowValues.buyTarget - nowValues.close) / nowValues.close;
            appendMsg('Big HiLow (' +  npercent(nowValues.hilowLast / nowValues.hilowAvr) + ') BUY ???');
        }
    }
}

function appendMsg(msg) {
    if (msg) {
        nowValues.msgText += msg + '\n';
    }
}

/**
 * informTrade : send message to slack via web-hook
 *
 *
 * @return none
 */

function informTrade() {

    const attach = show.attach(nowValues,config);
    attach.title += '   ' + momenttimezone(new Date(nowValues.epoch)).tz(TIMEZONE).format('MM-DD HH:mm')
        + ' <' + nowValues.outcomes + '>\n';
    replier.sendAttach(CURRENCY, nowValues.outText, [attach]);

}


/**
 * keepLog : append nowValues into log file
 *
 *
 * @return none
 */

function keepLog() {

    try {
        const str = [
            CURRENCY,
            dateFormat(new Date(nowValues.epoch)),
            nowValues.high,
            nowValues.low,
            nowValues.close,
            nowValues.volume,
            nowValues.volumeLast,
            roundTo(nowValues.volumeLast / nowValues.volumeAvr,2),
            (nowValues.histoSign) ? 'H' : ' ',
            nowValues.slopeLast,
            nowValues.slopeSign,
            nowValues.hilowLast,
            roundTo(nowValues.hilowLast / nowValues.hilowAvr,2),
            nowValues.dNow,
            nowValues.kNow,
            nowValues.outcome,
            nowValues.tradeType,
            replaceall(EOL, '; ', nowValues.msgText)
        ].join(', ');
        stream.write(str + EOL);
    } catch (e) {
        logger.error(e);
    }

    // sometimes write value header
    const d = new Date(nowValues.epoch);
    if (d.getMinutes() > 55 && (d.getHours() % 6 === 1)) {
        const head = 'coin, date time  ,    high,     low,   close,  vol, vLast, volP, Hsign, slope, sign, hilow, hilowP, d, k, outcome, B/S, msg';
        stream.write(head + EOL);
    }
}

/**
 * lister : main
 *
 * - triggered by ohlcBuilder.js
 * - build required tables for MACD, Stochastic
 * - calculate MACD, Stochastic values
 * - alert to slack if values are within range
 *
 * @param ohlcs {object} : prices array {epoch[], high[], low[], close[], volume[]}
 * @return none
 */

function listener({epochs, highs, lows, closes, volumes}) {

    const tableLen = highs.length;
    nowValues.msgText = '';
    nowValues.outcome = 0;

    if (isFirstTime) {
        appendMsg('Just Started, with size [' + tableLen + ']');
        nowValues.outcome = 1000;
        isFirstTime = false;
        outcomes = [0, 0, 0, 0];
        outMsgs = ['', '', '', ''];
    }
    else if (isCWDead(epochs[tableLen - 1])) {
        return;
    }

    if (lastbithumb) {
        appendMsg('CW begin to response now from ' + dateFormat(lastepoch * 1000) + ', idle was [' + lastbithumb + ']');
        nowValues.outcome += 200;
        lastbithumb = 0;
    }
    lastepoch = epochs[tableLen - 1];

    const macds = calculateMACD(closes);
    const stochastic = calculateStochastic(highs, lows, closes);

    const tableSize = macds.length;

    const temp = closes.slice(closes.length - slopeCOUNTMAX - 3);
    const slopes = temp.map((c, i) => { return (temp[i-1] - c) / c});
    const slopeSigns = temp.map((c, i) => { return (temp[i-1] < c) ? 1 : -1});

    nowValues.hilowAvr = roundTo((highs.slice(highs.length - hilowCOUNTMAX).reduce((h1, h2) => h1 + h2) -
        lows.slice(highs.length - hilowCOUNTMAX).reduce((l1, l2) => l1 + l2)) / hilowCOUNTMAX,0);
    nowValues.hilowLast = roundTo((highs.slice(highs.length - hilowCOUNT).reduce((h1, h2) => h1 + h2) -
        lows.slice(highs.length - hilowCOUNT).reduce((l1, l2) => l1 + l2)) / hilowCOUNT,0);

    nowValues.epoch = epochs[tableLen - 1] * 1000;
    nowValues.high = highs[tableLen - 1];
    nowValues.low = lows[tableLen - 1];
    nowValues.close = closes[tableLen - 1];
    nowValues.volume = volumes[tableLen - 1];
    nowValues.pEpoch = [epochs[tableLen - 3], epochs[tableLen - 5], epochs[tableLen - 7], epochs[Math.trunc(tableLen / 2)], epochs[0]] ;
    nowValues.pClose = [closes[tableLen - 3], closes[tableLen - 5], closes[tableLen - 7], closes[Math.trunc(tableLen / 2)], closes[0]];
    nowValues.pVolume = [volumes[tableLen - 3], volumes[tableLen - 5], volumes[tableLen - 7], volumes[Math.trunc(tableLen / 2)], volumes[0]] ;
    nowValues.periodMax = Math.max(...highs);
    nowValues.periodMin = Math.min(...lows);

    // nowValues.histogram = roundTo(macds[tableSize - 1].histogram, 1);
    nowValues.histoSign = isSignChanged(macds[tableSize - 2].histogram,macds[tableSize-1].histogram)
        || isSignChanged(macds[tableSize - 3].histogram,macds[tableSize-1].histogram);

    nowValues.dNow = roundTo(stochastic[stochastic.length - 1].d, 0);
    nowValues.kNow = roundTo(stochastic[stochastic.length - 1].k, 0);
    nowValues.dLast = (stochastic[stochastic.length - 2].d) ? roundTo(stochastic[stochastic.length - 2].d, 0): 0;
    nowValues.kLast = (stochastic[stochastic.length - 2].k) ? roundTo(stochastic[stochastic.length - 2].k, 0): 0;

    nowValues.volumeAvr = roundTo(volumes.slice(volumes.length - volumeCOUNTMAX).reduce((e1, e2) => e1 + e2) / volumeCOUNTMAX, 1);
    nowValues.volumeLast = roundTo(volumes.slice(volumes.length - volumeCOUNT).reduce((e1, e2) => e1 + e2) / volumeCOUNT, 1);

    nowValues.slopeAvr = roundTo(slopes.slice(slopes.length - slopeCOUNTMAX).reduce((e1, e2) => Math.abs(e1) + Math.abs(e2)) / slopeCOUNTMAX,5);
    nowValues.slopeLast = roundTo(slopes.slice(slopes.length - slopeCOUNT).reduce((e1, e2) => Math.abs(e1) + Math.abs(e2)) / slopeCOUNT,5);
    nowValues.slopeSign = slopeSigns.reduce((e1, e2) => e1 + e2);
    slopeSigns[0] = (slopeSigns[0] > 0) ? '+' : '-';
    nowValues.slopeBar = slopeSigns.reduce((e1, e2) => e1 + '' + ((e2 > 0) ? '+' : '-'));

    nowValues.sellTarget = config.sellPrice * (1 - config.gapAllowance);
    nowValues.buyTarget = config.buyPrice * (1 + config.gapAllowance);

    nowValues.tradeType = '';

    analyzeHistogram();
    analyzeStochastic();
    analyzeBoundary();
    analyzeVolume();
    analyzeSlope();
    analyzeHiLow();

    nowValues.outcome = roundTo(nowValues.outcome,1);
    outcomes.shift();
    outcomes.push(nowValues.outcome);
    outMsgs.shift();
    outMsgs.push(nowValues.msgText);

    if (nowValues.outcome > 100) {
        nowValues.outcomes = roundTo(outcomes.reduce((o1, o2) => o1 + o2),1);
        if (nowValues.outcomes >= RATE_INFORM) {
            nowValues.outText = '';
            outMsgs.forEach((m, idx) => {
                if (m !== '') {
                    nowValues.outText += '{' + outcomes[idx] + '} ' + m;
                }
            });
            informTrade();
        }
    }
    keepLog();
}
