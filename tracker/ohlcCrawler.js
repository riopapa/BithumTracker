const roundTo = require('round-to');
// const momenttimezone = require('moment-timezone');
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

const CRYPTOWATCH_URL = 'https://api.cryptowat.ch/markets/bithumb/' + currency + 'krw/ohlc?periods=180';

// let rollers = require('streamroller');
// let stream = new rollers.RollingFileStream(LOG + currency + '/ohlc_raw.log', 5000000, 2);
// let streamcw = new rollers.RollingFileStream(LOG + currency + '/cw_cost.log', 5000000, 2);
// const dateText = (epoch) => momenttimezone(epoch * 1000).tz(TIMEZONE).format('MM-DD HH:mm');

const events = require('events');
const emitter = new events.EventEmitter();
exports.getEmitter = () => emitter;
let responseBody = {};
let ohlcs = {};

let ohlcCrawler = () => {
    Promise.try(() => bhttp.get(CRYPTOWATCH_URL))
        .then(response => {
            // {"result":{"180":
            //     [[1512925200,17050000,17055000,16900000,16966000,223.30168,3788825900],
            //      [1512925380,16966000,17002000,16957000,16995000,21.02319,357074370]]
            // },"allowance":{"cost":2459681,"remaining":6840154909}}
            responseBody = response.body;
            let result = responseBody.result;
            try {
                ohlcs = ohlcBuild(result['180']);
            }
            catch (e) {
                logger.error(e);
                logger.error('result has no [180]' + JSON.stringify(responseBody).substr(0, 160));
            }
            reviewCost ();
            emitter.emit('event', ohlcs);
        }).catch((e) => {
            if (e.code === 'ECONNREFUSED') {
                logger.info('cw connect refused');
            }
            else if (e.code === 'ECONNRESET') {
                logger.info('cw connect reset');
            }
            else {
                logger.error(e);
            }
    });
};

function ohlcBuild (cwArray) {
    // [ 0: CloseTime, 1: OpenPrice, 2:HighPrice, 3:LowPrice, 4:ClosePrice, 5:Volume ]

    const indexFilter = (i) => (i % 4 === 0 || i > 400);
    const containZero = (e) => (e[2] === 0 || e[3] === 0 || e[4] === 0);

    const indexedCw = cwArray.filter((e, i) => indexFilter(i));

    // const zerostrs = indexedCw.filter((e) => containZero(e)).map((e, i) => [ i, dateText(e[0]), e[1], e[2], e[3], e[4], roundTo(e[5],1) ]);
    // if (zerostrs.length > 0) {
    //     logger.debug('excluding [' + zerostrs.length + '] zero array(s)');
    //     // stream.write(dateText(cwArray[cwArray.length - 1][0]) +', {' + JSON.stringify(zerostrs) + ' }' + EOL);
    // }

    let epochs = [];
    let highs = [];
    let lows = [];
    let closes = [];
    let volumes = [];

    let ohlcAppender = (e) => {
        epochs.push(e[0]);
        highs.push(e[2]);
        lows.push(e[3]);
        closes.push(e[4]);
        volumes.push(roundTo(e[5], 1));
    };

    indexedCw.filter((e) => !containZero(e)).forEach(e => ohlcAppender(e));
    return {epochs, highs, lows, closes, volumes};
}

function reviewCost() {
    return;

    // const cost = Number(responseBody.allowance.cost);
    // const remain = Number(responseBody.allowance.remaining);
    // const remainPercent = remain / (cost + remain);
    // const date = momenttimezone(new Date()).tz(TIMEZONE).format('MM-DD HH:mm');
    // streamcw.write(date + ', ' + cost + ' + ' + remain+ '= ' + (cost + remain)  + ', ' + remainPercent + EOL);
    // if ( remainPercent < 0.1) {
    //     logger.error('[allowance] remain:' + numeral(remain).format('0,0') + ' , in % ' + remainPercent);
    // }
}

// ohlcCrawler();
new CronJob(CRON_SCHEDULE, ohlcCrawler, null, true, TIMEZONE);
