

// Stream Roller
const json = require('json-file');
let readConfigFile = (path) => new json.read(path);
const EOL = require('os').EOL;

const CONFIG_FILE = './config/gathercoin/gatherCoin.json';
let config = readConfigFile(CONFIG_FILE).data;

const Promise = require('bluebird');
const bhttp = require('bhttp');

let CronJob = require('cron').CronJob;
const CRON_SCHEDULE = '30 */1 * * * *';
const TIMEZONE = 'Asia/Seoul';

const rollers = require('streamroller');
const stream = new rollers.RollingFileStream('./log/gathercoin/gathercoin.csv' , 5000000, 10);

const Watcher = require('watch-files');
const watcher = Watcher({
    interval: '0.1s'
});
watcher.add(CONFIG_FILE);
watcher.on('change', (info) => {
    config = readConfigFile(info.path).data;
    stream.write('x,Configuration changed' + EOL);
    logger.debug('Configuration changed');
});

const momenttimezone = require('moment-timezone');
const dateLFormat = (epoch) => momenttimezone(epoch).tz(TIMEZONE).format('YY-MM-DD HH:mm');

let log4js = require('log4js');
let logCf = new json.read('./config/loggerConfig.json').data;
logCf.appenders.file.filename = './log/gathercoin/history.log';
log4js.configure(logCf);
let log4js_extend = require('log4js-extend');
log4js_extend(log4js, {
    path: __dirname,
    format: '(@name:@line:@column)'
});
const logger = log4js.getLogger('gather');

let isFirstTime = true;
let nowEpoch = 0;

let bithumbCoin = (coin) => {
    Promise.try(() => bhttp.get('https://api.bithumb.com/public/ticker/' + coin))
        .then(response => {
//            {"status":"0000","data":{
//              "opening_price":"17786000","closing_price":"19144000","min_price":"17750000","max_price":"19900000",
//              "average_price":"19080605.9105","units_traded":"72509.15826464","volume_1day":"72509.15826464",
//              "volume_7day":"642811.43325903","buy_price":"19121000","sell_price":"19144000","date":"1513038662469"}}
            if (response.body.status === '0000') {
                const price = response.body.data.closing_price;
                const ts = response.body.data.date;
                if (nowEpoch < ts) {
                    nowEpoch = ts;
                }
                writeCoin ('bit' , coin, ts, price);
            }
            else {
                logger.warn('no response from bithumb ' + coin + ', status code:' + response.body.status);
                logger.debug(response.body);
            }
        }).catch((e) => {
            if (e.code === 'ECONNREFUSED') {
                logger.info('bithumb refused');
            }
            else {
                logger.error(e);
            }
    });
};

let korbitCoin = (coin) => {
    Promise.try(() => bhttp.get('https://api.korbit.co.kr/v1/ticker?currency_pair=' + coin + '_krw', {decodeJSON: true}))
        .then(response => {
            let body = response.body;
//            {"timestamp":1513037980658,"last":"18900000"}
            const ts = body.timestamp;
            const price = body.last;
            if (nowEpoch < ts) {
                nowEpoch = ts;
            }
            writeCoin ('kor' , coin, ts, price);
        }).catch((e) => {
            if (e.code === 'ECONNREFUSED') {
                logger.info('korbit refused');
            }
            else {
                logger.error(e);
            }
    });
};

let cwCoin = () => {
    Promise.try(() => bhttp.get('https://api.cryptowat.ch/markets/prices'))
        .then(response => {
            let result = response.body.result;

//            {"bitfinex:avtbtc":0.00026,"bitfinex:avteth":0.007294,"bitfinex:avtusd":4.45,
//              "bitfinex:bccbtc":0.92888,"bitfinex:bccusd":16900,"bitfinex:bchbtc":0.1021,
            config.cw.forEach(c => {
                try {
                    const price = result[c];
                    writeCoin(c.replace(':',','), nowEpoch, price);      // replacing epoch with latest epoch
                }
                catch(e) {
                    const price = -1;
                    writeCoin(c.replace(':',','), nowEpoch, price);      // replacing epoch with latest epoch
                }
            })
        }).catch((e) => {
            if (e.code === 'ECONNREFUSED') {
                logger.info('cw refused');
            }
            else {
                logger.error(e);
            }
        });
};

function writeCoin (market, coin, ts, price) {
    try {
        const str = [market, coin, ts, price].join(',');
        stream.write(str + EOL);
    } catch (e) {
        logger.error(e);
    }
}

function gatherCoin () {
    if (isFirstTime) {
        stream.write ('x, Started' + EOL);
        logger.debug ('Started');
        isFirstTime = false;
    }
    config.bithumb.forEach(c => bithumbCoin (c));
    config.korbit.forEach(c => korbitCoin (c));
    cwCoin ();
    stream.write('x,' + dateLFormat(Number(nowEpoch)) + EOL);
}

gatherCoin();
new CronJob(CRON_SCHEDULE, gatherCoin, null, true, TIMEZONE);
