const roundTo = require('round-to');
const momenttimezone = require('moment-timezone');
const TIMEZONE = 'Asia/Seoul';
// const EOL = require('os').EOL;
const format = require('string-format');
format.extend(String.prototype);
const json = require('json-file');
// const numeral = require('numeral');
// const pad = require('pad');
const CONFIG = process.env.CONFIG;  // configuration folder with '/'

const CRON_SCHEDULE = process.env.CRON_SCHEDULE;

const CURRENCY = process.env.CURRENCY;
const currency = CURRENCY.toLowerCase();

const Promise = require('bluebird');
const bhttp = require('bhttp');
let CronJob = require('cron').CronJob;

let log4js = require('log4js');
const LOG = process.env.LOG;
const LOGGER_CONFIGFILE = process.env.LOGGER_CONFIGFILE;
const LOGGER_OUTFILE = process.env.LOGGER_OUTFILE;
let logCf = new json.read(CONFIG + LOGGER_CONFIGFILE).data;
logCf.appenders.file.filename = LOG + currency + '/' + LOGGER_OUTFILE;
log4js.configure(logCf);
let log4js_extend = require('log4js-extend');
log4js_extend(log4js, {
    path: __dirname,
    format: '(@name:@line:@column)'
});
const logger = log4js.getLogger('ohlc:' + currency);
const TRADE_INTERVAL = '1m';
const TRADE_LIMIT = 80;
const TRADE_INTERVAL_LONG = '15m';
const TRADE_LIMIT_LONG = 20;        //  15m x 20 = 300m

const BIFINEX_URL = 'https://api.bitfinex.com/v2/candles/trade:' + TRADE_INTERVAL + ':t' + CURRENCY + 'USD/hist?limit=' + TRADE_LIMIT+'&sort=1&start='; // array[0] = old

const BIFINEX_LONGURL = 'https://api.bitfinex.com/v2/candles/trade:' + TRADE_INTERVAL_LONG + ':t' + CURRENCY + 'USD/hist?limit=' + TRADE_LIMIT_LONG;       // array[0] = latest

// let rollers = require('streamroller');
// let stream = new rollers.RollingFileStream(LOG + currency + '/ohlc_raw.log', 5000000, 2);
// let streamcw = new rollers.RollingFileStream(LOG + currency + '/cw_cost.log', 5000000, 2);
// const dateText = (epoch) => momenttimezone(epoch * 1000).tz(TIMEZONE).format('MM-DD HH:mm');

const events = require('events');
const emitter = new events.EventEmitter();
exports.getEmitter = () => emitter;

let ohlcs = {};
let longMinMax = {};
let starting = new Date() - 100 * 1000 * 60;   // LIMIT * 1000 milsec * INTERVAL
let BIFINEX_SHORTURL = BIFINEX_URL + starting;

function shortOHLC() {
    return Promise.try(() => bhttp.get(BIFINEX_SHORTURL))
        .then(response => {
            // bitfinext case
            // https://api.bitfinex.com/v2//candles/trade:15m:tBTCUSD/hist?limit=5
            // [ MTS,         OPEN,CLOSE, HIGH, LOW, VOLUME
            // [1518255000000,8720,8755.5,8784.7,8719.8,570.8251072],
            // ..
            // [1518251400000,8790.8,8706.6,8790.8,8677,1132.13410577]
            // ]
            try {
                ohlcs = shortOHLCBuild(response.body);
            }
            catch (e) {
                console.log('short error');
                logger.error(e);
            }
            // emitter.emit('event', ohlcs);
        });
}

function longOHLC() {
    return Promise.try(() => bhttp.get(BIFINEX_LONGURL))
        .then(response => {
            try {
                let ohlcArrayLong = longOHLCBuild(response.body);
                let minClose = 9999999999;
                let maxClose = 0;
                let minEpoch = 0;
                let maxEpoch = 0;
                ohlcArrayLong.closes.forEach((e,i) => {
                    if (e > maxClose) {
                        maxClose = e;
                        maxEpoch = ohlcArrayLong.epochs[i];
                    }
                    if (e < minClose) {
                        minClose = e;
                        minEpoch = ohlcArrayLong.epochs[i];
                    }
                });
                let oldClose = ohlcArrayLong.closes[ohlcArrayLong.closes.length - 1];
                let oldEpoch = ohlcArrayLong.epochs[ohlcArrayLong.epochs.length - 1];
                longMinMax = {minClose, minEpoch, maxClose, maxEpoch, oldClose, oldEpoch};
                // logger.debug('minClose ' + minClose);
            }
            catch (e) {
                logger.error(e);
            }
        })
        .catch((e) => {
            logger.debug('long err');
            logger.error(e);
        });
}

function shortOHLCBuild (bitfinexArray) {

    // [ MTS,         OPEN,CLOSE, HIGH, LOW, VOLUME
    let epochs = [];
    let highs = [];
    let lows = [];
    let closes = [];
    let volumes = [];
    let ohlcAppender = (e) => {
        epochs.push(e[0]);
        closes.push(e[2]);
        highs.push(e[3]);
        lows.push(e[4]);
        volumes.push(roundTo(e[5], 3));
    };
    bitfinexArray.forEach(e => ohlcAppender(e));
    // epochs.reverse();
    return {epochs, highs, lows, closes, volumes};
}


function longOHLCBuild (bitfinexArray) {

    // [ MTS,         OPEN,CLOSE, HIGH, LOW, VOLUME
    let epochs = [];
    // let highs = [];
    // let lows = [];
    let closes = [];
    // let volumes = [];
    // let epoch = 0;
    let ohlcAppender = (e) => {
        epochs.push(e[0]);
        closes.push(e[2]);
        // highs.push(e[3]);
        // lows.push(e[4]);
        // volumes.push(roundTo(e[5], 3));
    };
    // epoch = bitfinexArray[0][0];
    bitfinexArray.forEach(e => ohlcAppender(e));

    return {epochs, closes};
}

let ohlcCrawlerAll = () => {
    starting = new Date() - 100 * 1000 * 60;   // LIMIT * 1000 milsec * INTERVAL
    BIFINEX_SHORTURL = BIFINEX_URL + starting;
    Promise.all([shortOHLC(), longOHLC()])
        .then (() => {
            // logger.info(momenttimezone(new Date(ohlcs.epochs[0])).tz(TIMEZONE).format('MM-DD HH:mm') + ' ~ ' + momenttimezone(new Date(ohlcs.epochs[ohlcs.epochs.length - 1])).tz(TIMEZONE).format('MM-DD HH:mm'));
            ohlcs.longMinMax = longMinMax;
            emitter.emit('event', ohlcs);
        })
        .catch((e) => {
            logger.error(e);
        });
};

// ohlcCrawlerAll();
new CronJob(CRON_SCHEDULE, ohlcCrawlerAll, null, true, TIMEZONE);
