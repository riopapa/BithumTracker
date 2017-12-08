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
let lastepoch = 0;

const events = require('events');
const emitter = new events.EventEmitter();
exports.getEmitter = () => emitter;

let ohlcCrawler = () => {
    Promise.try(() => bhttp.get(CRYPTOWATCH_URL))
        // .then(response => response)
        .then(response => {
            const result = response.body.result;
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
    });
};

function ohlcBuild (cwArray) {
    // [ 0: CloseTime, 1: OpenPrice, 2:HighPrice, 3:LowPrice, 4:ClosePrice, 5:Volume ]
    let epochs = [];
    let highs = [];
    let lows = [];
    let closes = [];
    let volumes = [];
    let zerostr = '';
    let arrIndex  = 0;
    cwArray.filter((e, i) => {
        if (i % 4 === 0 || i > 400) {
            return true;
        }
        return false;
    }).filter((e, i) => {
        if (e[2] && e[3] && e[4]) {
            return true;
        }
        else {
            zerostr += (zerostr) ? ',' : '';
            zerostr += '[' + [i, dateText(e[0]), e[1], e[2], e[3], e[4], roundTo(e[5],1)].join(', ') + '] ';
        }
        return false;
    }).forEach((e) => { // extract about 200 from 500 arrays
        epochs[arrIndex] = e[0];
        highs[arrIndex] = e[2];
        lows[arrIndex] = e[3];
        closes[arrIndex] = e[4];
        volumes[arrIndex] = roundTo(e[5], 1);
        arrIndex++;
    });

    if (zerostr) {
        logger.debug('execluding zero, [' + arrIndex + '] arrays');
        stream.write(dateText(cwArray[cwArray.length - 1][0]) +', {' + zerostr + ' }' + EOL);
    }
    return {epochs, highs, lows, closes, volumes};
}

ohlcCrawler();
new CronJob(CRON_SCHEDULE, ohlcCrawler, null, true, TIMEZONE);
