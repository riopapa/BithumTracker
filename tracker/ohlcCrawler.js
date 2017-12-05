const roundTo = require('round-to');

const format = require('string-format');
format.extend(String.prototype);
let CronJob = require('cron').CronJob;
const json = require('json-file');
const CONFIG = process.env.CONFIG;  // configuration folder with '/'

const CRON_SCHEDULE = process.env.CRON_SCHEDULE;
const TIMEZONE = 'Asia/Seoul';

const CURRENCY = process.env.CURRENCY;
const currency = CURRENCY.toLowerCase();

const Promise = require('bluebird');
const bhttp = require('bhttp');

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
const logger = log4js.getLogger('ohlcbuilder:' + currency);

let moment = require('moment');
require('moment-timezone');
let minuteString = (epoch) => moment(new Date(epoch)).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm');

const CRYPTOWATCH_URL = 'https://api.cryptowat.ch/markets/bithumb/' + currency + 'krw/ohlc?periods=180';

let rollers = require('streamroller');
let stream = new rollers.RollingFileStream(LOG + currency + '/crawler.log', 5000000, 2);
let streamRaw = new rollers.RollingFileStream(LOG  + currency + '/raw.log', 5000000, 2);

const events = require('events');
const emitter = new events.EventEmitter();
exports.getEmitter = () => emitter;

let ohlcCrawler = () => {
    Promise.try(() => bhttp.get(CRYPTOWATCH_URL))
        // .then(response => response)
        .then(response => {
            // [ 0: CloseTime, 1: OpenPrice, 2:HighPrice, 3:LowPrice, 4:ClosePrice, 5:Volume ]
            let result = response.body.result;
            let rslt = result['180'];
            let epochs = [];
            let highs = [];
            let lows = [];
            let closes = [];
            let volumes = [];
            rslt.map ((e,i) => { epochs[i] = e[0];
                highs[i] = e[2];
                lows[i] = e[3];
                closes[i] = e[4];
                volumes[i] = roundTo(e[5],1);}
            );

            emitter.emit('event', {epochs, highs, lows, closes, volumes});
        }).catch((e) => {
        logger.error(e);
    });
};

function makeOHLCfield(coins) {
    const coinInfos = coins.map(_ => JSON.parse(_));
    const coinInfo = coinInfos[coinInfos.length - 1];

    const prices = coinInfos.map(_ => _.price);
    const volumes = coinInfos.map(_ => _.volume);

    coinInfo.date = minuteString(coinInfo.epoch);
    coinInfo.high = Math.max(...prices);
    coinInfo.low = Math.min(...prices);
    coinInfo.close = prices[prices.length - 1];
    coinInfo.open = prices[0];
    coinInfo.volume = roundTo(volumes.reduce((e1, e2) => (e1 + e2)),1);
    return coinInfo;
}

ohlcCrawler();
new CronJob(CRON_SCHEDULE, ohlcCrawler, null, true, TIMEZONE);
