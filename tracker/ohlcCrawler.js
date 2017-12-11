const roundTo = require('round-to');
const momenttimezone = require('moment-timezone');
const TIMEZONE = 'Asia/Seoul';
const EOL = require('os').EOL;
const format = require('string-format');
format.extend(String.prototype);
const json = require('json-file');
const numeral = require('numeral');
const pad = require('pad');
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
const logger = log4js.getLogger('ohlccrawler:' + currency);

const CRYPTOWATCH_URL = 'https://api.cryptowat.ch/markets/bithumb/' + currency + 'krw/ohlc?periods=180';

let rollers = require('streamroller');
let stream = new rollers.RollingFileStream(LOG + currency + '/ohlc_raw.log', 5000000, 2);
const dateText = (epoch) => momenttimezone(epoch * 1000).tz(TIMEZONE).format('MM-DD HH:mm');

const events = require('events');
const emitter = new events.EventEmitter();
exports.getEmitter = () => emitter;
let result = {};

let ohlcCrawler = () => {
    Promise.try(() => bhttp.get(CRYPTOWATCH_URL))
        .then(response => {
            result = response.body.result;
            const cwArray = result['180'];
            const ohlcs = ohlcBuild (cwArray);
            const cost = Number(response.body.allowance.cost);
            const remain = Number(response.body.allowance.remaining);
            const remainPercent = remain / (cost + remain);
            if ( remainPercent < 0.01) {
                logger.error('allowance  remain:' + numeral(remain).format('0,0') + ' , in % ' + remainPercent);
            }
            emitter.emit('event', ohlcs);
        }).catch((e) => {
            logger.error(e);
            logger.error(JSON.stringify(result));
    });
};

function ohlcBuild (cwArray) {
    // [ 0: CloseTime, 1: OpenPrice, 2:HighPrice, 3:LowPrice, 4:ClosePrice, 5:Volume ]

    const indexFilter = (i) => (i % 4 === 0 || i > 400);
    const containZero = (e) => (e[2] === 0 || e[3] === 0 || e[4] === 0);

    const indexedCw = cwArray.filter((e, i) => indexFilter(i));

    const zerostrs = indexedCw.filter((e) => containZero(e)).map((e, i) => [ i, dateText(e[0]), e[1], e[2], e[3], e[4], roundTo(e[5],1) ]);
    if (zerostrs.length > 0) {
        logger.debug('execluding [' + zerostrs.length + '] zero array(s)');
        stream.write(dateText(cwArray[cwArray.length - 1][0]) +', {' + JSON.stringify(zerostrs) + ' }' + EOL);
    }

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
    }

    indexedCw.filter((e) => !containZero(e)).forEach(e => ohlcAppender(e));
    return {epochs, highs, lows, closes, volumes};
}

// ohlcCrawler();
new CronJob(CRON_SCHEDULE, ohlcCrawler, null, true, TIMEZONE);
