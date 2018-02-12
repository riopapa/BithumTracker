const Promise = require('bluebird');
const bhttp = require('bhttp');
// const json = require('json-file');
// const CONFIG = process.env.CONFIG;  // configuration folder with '/'
const momenttimezone = require('moment-timezone');
const TIMEZONE = 'Asia/Seoul';
const secondFormat = (epoch) => momenttimezone(epoch).tz(TIMEZONE).format('MM-DD HH:mm:ss');
let CronJob = require('cron').CronJob;
// const fx = require('money');
const ccxt = require('ccxt');
let ccxtbfx = new ccxt.bitfinex();
let ccxtbithumb = new ccxt.bithumb();

let log4js = require('log4js');
// const LOG = process.env.LOG;
// console.log('log = ' + LOG);
// const LOGGER_CONFIGFILE = process.env.LOGGER_CONFIGFILE;
// const LOGGER_OUTFILE = process.env.LOGGER_OUTFILE;
// console.log('logger out ' + LOGGER_OUTFILE);
let logCf =
    {
        "replaceConsole": true,
        "appenders": {
            "console": {
                "type": "console",
                "layout": {
                    "type": "pattern",
                    "pattern": "%[[%r] [%5.5p] %c -%] %m"
                }
            },
            "file": {
                "type": "file",
                "filename": "./stable.log",
                "maxLogSize": 20000
            }
        },
        "categories": {
            "default": {
                "appenders": [ "file", "console" ],
                "level": "debug"
            }
        }
    };

log4js.configure(logCf);
let log4js_extend = require('log4js-extend');
log4js_extend(log4js, {
    path: __dirname,
    format: '(@name:@line:@column)'
});
const logger = log4js.getLogger('s');

const bfx_url = 'https://api.bitfinex.com/v1/pubticker/btcusd';
// {"mid":"8478.35","bid":"8478.0","ask":"8478.7","last_price":"8478.1","low":"7851.0","high":"8500.0","volume":"54818.49579832","timestamp":"1518403427.3745067"}

const cw_url = 'https://api.cryptowat.ch/markets/bithumb/btckrw/price';
// {"result":{"price":9748000},"allowance":{"cost":1173314,"remaining":7998826686}}

let usd2krw = 0;
let bitfinexPrice = 0;
let bitfinex_Time = 0;
let cryptowatch_Price = 0;
let ccxt_bitfinex_Price = 0;
// let ccxtbfxTime = 0;
let ccxt_bithumb_Price = 0;
// let ccxt_bithumb_Time = 0;
let count  = 4;

function callback(r) {
    --count;
    if(count != 0) {
        return;
    }
    const str = [
        secondFormat(new Date()),
        bitfinexPrice,
        // secondFormat(new Date(bitfinex_Time)),
        cryptowatch_Price,
        ccxt_bitfinex_Price,
        ccxt_bithumb_Price,
        // secondFormat(new Date(ccxt_bithumb_Time))
    ].join(', ');
    logger.debug(str)
}

function mainloop() {
    usd2krw = 1086;
    // usd2krw = fx.convert(1, {from: "USD", to: "KRW"});
    // console.log(usd2krw);
    const dt = new Date();
    if (dt.getMinutes() > 58) {
        logger.debug('date time     , bfxPrice, cw_Price, ccxtbfx_Price, ccxtbithumb');
    }
    count = 4;
    getPrices();

    // Promise.try(() => getPrices())
    //     .then(() => {
    //         const str = [
    //             secondFormat(new Date(dt)),
    //             bitfinexPrice,
    //             // secondFormat(new Date(bitfinex_Time)),
    //             cryptowatch_Price,
    //             ccxt_bitfinex_Price,
    //             ccxt_bithumb_Price,
    //             // secondFormat(new Date(ccxt_bithumb_Time))
    //         ].join(', ');
    //         logger.debug(str)
    //     });
}

function getPrices() {

    Promise.try(() => bhttp.get(bfx_url))
        .then(r => {
            bitfinexPrice = Number(r.body.last_price) * usd2krw;
            bitfinex_Time = Number(r.body.timestamp);
        })
        .then(() => callback())
        .catch((e) => {
            logger.error(e);
        });

    Promise.try(() => bhttp.get(cw_url))
        .then(r => {
            cryptowatch_Price = Number(r.body.result.price);
        })
        .then(() => callback())
        .catch((e) => {
            logger.error(e);
        });

    Promise.try(() => ccxtbfx.fetchTicker('BTC/USD'))
        .then(r => {
            ccxt_bitfinex_Price = Number(r.last) * usd2krw;
        })
        .then(() => callback())
        .catch((e) => {
            logger.error(e);
        });

    Promise.try(() => ccxtbithumb.fetchTicker('BTC/KRW'))

    /*{ symbol: 'BTC/KRW',
        timestamp: 1518412263591,
        datetime: '2018-02-12T05:11:03.591Z',
        high: 9830000,
        low: 9075000,
        bid: 9768000,
        ask: 9772000,
        vwap: undefined,
        open: 9159000,
        close: 9768000,
        first: undefined,
        last: undefined,
        change: undefined,
        percentage: undefined,
        average: 9483250.1393,
        baseVolume: 12174.16924603,
        quoteVolume: undefined,
        ...}
    */
        .then(r => {
            ccxt_bithumb_Price = Number(r.close);
            ccxt_bithumb_Time = Number(r.timestamp);
            // console.log('ccxtbitPrice  = ' + ccxtbitPrice);
        })
        .then(() => callback())
        .catch((e) => {
            logger.error(e);
        });
}

// mainloop();
new CronJob('0 */1 * * * *', mainloop, null, true, TIMEZONE);
