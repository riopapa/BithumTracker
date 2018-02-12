const CURRENCY = process.env.CURRENCY;
const currency = CURRENCY.toLowerCase();

const format = require('string-format');
format.extend(String.prototype);

const Promise = require('bluebird');
const bhttp = require('bhttp');

const momenttimezone = require('moment-timezone');
const TIMEZONE = 'Asia/Seoul';
const minuteFormat = (epoch) => momenttimezone(epoch).tz(TIMEZONE).format('MM-DD HH:mm');

const pad = require('pad');
const numeral = require('numeral');
const npercent = (number) => numeral(number * 100).format('0,0.00') + '%';
const NPAD_SIZE = Number(process.env.NPAD_SIZE);
const npad = (number) => pad(NPAD_SIZE, numeral((number)).format('0,0'));

const roundTo = require('round-to');
const notifier = require('./notifier.js');
const technical = require('./technicalCalc.js');
const keep = require('./keeplogdata.js');
const inform = require('./informTrade.js');
const calc = require('./calcOutcome.js');

const Watcher = require('watch-files');
const watcher = Watcher({
    interval: '0.5s'
});
const json = require('json-file');
let readConfigFile = (path) => new json.read(path);

const CONFIG = process.env.CONFIG;  // configuration folder with '/'
const CONFIG_FILE = CONFIG + currency + '/' + process.env.CONFIG_FILENAME;

let isFirstTime = true; // inform current setting when this module is started
let lastepoch = 0;
let lastsame = 0;
let lastbithumb = 0;

let config = readConfigFile(CONFIG_FILE).data;
let BoundaryCount = {
    buy: 0,
    sell: 0
};
let nowValues = {};

watcher.add(CONFIG_FILE);
watcher.on('change', (info) => {
    config = readConfigFile(info.path).data;
    logger.debug('configration changed');
    BoundaryCount.sell = 0;
    BoundaryCount.buy = 0;
});

// LOGGER
let log4js = require('log4js');
const logger = log4js.getLogger('analyzer:' + currency);

const volumeCOUNT = 8;   // if recent volume goes high then...
const volumeCOUNTMAX = volumeCOUNT * 5;
const slopeCOUNT = 8;   // if price varying slope is high then...
const slopeCOUNTMAX = slopeCOUNT * 5;
const hilowCOUNT = 8;   // if price varying slope is high then...
const hilowCOUNTMAX = hilowCOUNT * 5;
const ohlcCrawler = require('./ohlcCrawler.js');

ohlcCrawler.getEmitter().on('event', listener);

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
                const msg = 'Bithumb' + npad(Number(price)) + ', ' + minuteFormat(new Date(ts));
                notifier.warn(msg, 'SAME ' + CURRENCY + ' since ' + minuteFormat(lastepoch) + ' [' + lastbithumb + ' / ' + lastsame + ']' );
            }
            else {
                korbitCrawler();
            }
        }).catch((e) => {
            logger.error('Error while accesing bithumb');
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
            const msg = 'KORBIT' + npad(price) + ', ' + minuteFormat(new Date(ts));
            notifier.warn(msg, 'No Response from BITHUMB (' + CURRENCY + ') and from CW since ' + minuteFormat(lastepoch) );
        }).catch((e) => {
            logger.error('Error while accesing korbit');
            logger.error(e);
    });
};

/**
 * isBFXDead : verify whether given array values are same with previous
 *
 * @param epoch : last time in epochs[]
 * @returns {boolean}
 */

function isBFXDead(epoch) {
    if (epoch === lastepoch) {
        logger.debug(minuteFormat(epoch) + ' is same as before ' + lastsame);
        if (++lastsame % 10 === 9) {
            bithumbCrawler();
            lastbithumb++;
        }
        return true;
    }
    lastepoch = epoch;
    return false;
}


function isSignChanged(before, after) {

    // to flag on if recent histogram sign has been changed
    return (before >= 0 && after <= 0) || (before <= 0 && after >= 0);
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
        calc.msg(nowValues, 'Just Started..');
        nowValues.outcome = 999;
        isFirstTime = false;
        outcomes = [0, 0, 0, 0];
        outMsgs = ['', '', '', ''];
    }
    else if (isBFXDead(epochs[tableLen - 1])) {
        return null;
    }

    if (lastbithumb) {
        calc.msg(nowValues, 'CW begin to response now from ' + minuteFormat(lastepoch) + ', idle was [' + lastbithumb + ']');
        nowValues.outcome += 100;
        lastbithumb = 0;
    }
    lastepoch = epochs[tableLen - 1];
    const macds = technical.calcMACD(closes);
    const stochastic = technical.calcStochastic(highs, lows, closes);
    const tableSize = macds.length;

    const temp = closes.slice(closes.length - slopeCOUNTMAX - 3);
    const slopes = temp.map((c, i) => { return (temp[i-1] - c) / c});
    const slopeSigns = temp.map((c, i) => { return (temp[i-1] < c) ? 1 : -1});

    nowValues.hilowAvr = roundTo((highs.slice(highs.length - hilowCOUNTMAX).reduce((h1, h2) => h1 + h2) -
        lows.slice(highs.length - hilowCOUNTMAX).reduce((l1, l2) => l1 + l2)) / hilowCOUNTMAX,0);
    nowValues.hilowLast = roundTo((highs.slice(highs.length - hilowCOUNT).reduce((h1, h2) => h1 + h2) -
        lows.slice(highs.length - hilowCOUNT).reduce((l1, l2) => l1 + l2)) / hilowCOUNT,0);

    nowValues.epoch = epochs[tableLen - 1];
    nowValues.high = highs[tableLen - 1];
    nowValues.low = lows[tableLen - 1];
    nowValues.close = closes[tableLen - 1];
    nowValues.volume = volumes[tableLen - 1];
    nowValues.pEpoch = [epochs[tableLen - 5], epochs[tableLen - 10], epochs[tableLen - 15], epochs[Math.trunc(tableLen / 2)], epochs[0]] ;
    nowValues.pClose = [closes[tableLen - 5], closes[tableLen - 10], closes[tableLen - 15], closes[Math.trunc(tableLen / 2)], closes[0]];
    nowValues.pVolume = [volumes[tableLen - 5], volumes[tableLen - 10], volumes[tableLen - 15], volumes[Math.trunc(tableLen / 2)], volumes[0]] ;
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
    // nowValues.slopeBar = slopeSigns.reduce((e1, e2) => e1 + '' + ((e2 > 0) ? '+' : '-'));

    nowValues.sellTarget = config.sellPrice * (1 - config.gapAllowance);
    nowValues.buyTarget = config.buyPrice * (1 + config.gapAllowance);

    nowValues.tradeType = '';

    calc.Histogram(nowValues, config);
    calc.Stochastic(nowValues);
    calc.Boundary(nowValues, config, BoundaryCount);
    calc.Slope(nowValues, config);
    calc.Volume(nowValues);
    calc.HiLow(nowValues);

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
            inform.Trade(nowValues, config);
        }
    }
    keep.Log(nowValues);
}
