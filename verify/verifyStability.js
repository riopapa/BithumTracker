const Promise = require('bluebird');
const bhttp = require('bhttp');
const roundTo = require('round-to');
let roller = require('streamroller');
let stream = new roller.RollingFileStream('./log/verify.csv', 100000, 5);
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
let logCf =
    {
        "replaceConsole": false,
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
                "filename": "./log/verify.log",
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
const logger = log4js.getLogger('verify');

const bfx_url = 'https://api.bitfinex.com/v1/pubticker/btcusd';
// {"mid":"8478.35","bid":"8478.0","ask":"8478.7","last_price":"8478.1","low":"7851.0","high":"8500.0","volume":"54818.49579832","timestamp":"1518403427.3745067"}

const cw_url = 'https://api.cryptowat.ch/markets/bithumb/btckrw/price';
// {"result":{"price":9748000},"allowance":{"cost":1173314,"remaining":7998826686}}

let usd2krw = 0;
let bitfinexPrice = 0;
let cryptowatch_Price = 0;
let ccxt_bitfinex_Price = 0;
let ccxt_bithumb_Price = 0;
let bithumb_Price = 0;

let isFirst = true;

function mainloop() {
    usd2krw = 1086;
    // usd2krw = fx.convert(1, {from: "USD", to: "KRW"});
    // console.log(usd2krw);
    const dt = new Date();
    if (dt.getMinutes() > 58 || isFirst) {
        stream.write('date time     , bfxUSD, cw_KRW, ccxtbfxUSD, ccxtbithumb, bithumb\n');
        isFirst = false;
    }
    getPrices();
}

function getPrices() {

    let promise1 = Promise.try(() => bhttp.get(bfx_url))
        .then(r => {
            bitfinexPrice = roundTo(Number(r.body.last_price) * usd2krw,0);
            // bitfinex_Time = Number(r.body.timestamp);
        })
        .catch((e) => {
            logger.error(e);
        });

    let promise2 = Promise.try(() => bhttp.get(cw_url))
        .then(r => {
            cryptowatch_Price = Number(r.body.result.price);
        })
        .catch((e) => {
            logger.error(e);
        });

    let promise3 = Promise.try(() => ccxtbfx.fetchTicker('BTC/USD'))
        .then(r => {
            ccxt_bitfinex_Price = roundTo(Number(r.last) * usd2krw,0);
        })
        .catch((e) => {
            logger.error(e);
        });

    let promise4 = Promise.try(() => ccxtbithumb.fetchTicker('BTC/KRW'))

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
            // ccxt_bithumb_Time = Number(r.timestamp);
            // console.log('ccxtbitPrice  = ' + ccxtbitPrice);
        })
        .catch((e) => {
            logger.error(e);
        });

    let promise5 = Promise.try(() => bhttp.get('https://api.bithumb.com/public/ticker/btc'))
        .then(r => {
            bithumb_Price = Number(r.body.data.closing_price);
        })
        .catch((e) => {
            logger.error(e);
        });

    Promise.all([promise1, promise2, promise3, promise4, promise5])
        .then (() => {
            let isZero = '';
            if (bitfinexPrice * cryptowatch_Price === 0 ||
                ccxt_bitfinex_Price * ccxt_bithumb_Price * bithumb_Price === 0) {
                isZero = 'zero case';
            }
            const str = [
                secondFormat(new Date()),
                bitfinexPrice,
                cryptowatch_Price,
                ccxt_bitfinex_Price,
                ccxt_bithumb_Price,
                bithumb_Price,
                isZero
            ].join(', ');
            stream.write(str + '\n');
            console.log(str);
            bitfinexPrice = 0;
            cryptowatch_Price = 0;
            ccxt_bitfinex_Price = 0;
            ccxt_bithumb_Price = 0;
            bithumb_Price = 0;
        });
}

// mainloop();
new CronJob('0 */1 * * * *', mainloop, null, true, TIMEZONE);
