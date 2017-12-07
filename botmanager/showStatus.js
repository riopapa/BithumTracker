
const fs = require('fs');
const momenttimezone = require('moment-timezone');
const pad = require('pad');
const numeral = require('numeral');
const roundTo = require('round-to');
const bhttp = require('bhttp');
const Promise = require('bluebird');

const coinConfig = require('./coinConfig.js');
const replier = require('./replier.js');

const NPAD_SIZE = Number(process.env.NPAD_SIZE);
const npad = (number) => pad(NPAD_SIZE, numeral((number)).format('0,0'));
const npadBlank = (number) => pad(NPAD_SIZE + 5, numeral((number)).format('0,0'));
const npercent = (number) => numeral(number * 100).format('0,0.00') + '%';
const CRYPTOWATCH_URL = 'https://api.cryptowat.ch/markets/bithumb/';

// CONFIGRATION && LOGGER
const CONFIG = process.env.CONFIG;  // configuration folder with '/'
const CONFIG_FILENAME = process.env.CONFIG_FILENAME;

let log4js = require('log4js');
const logger = log4js.getLogger('showstatus');
const LOG = process.env.LOG;
const TREND_FILENAME =  process.env.TREND_FILENAME;

exports.info = (coin, msg) => showCoinStatus(coin, msg);

function showCoinStatus(coin, msg) {
    const response = (value) => buildAttach(coin, value);
    Promise.try(() => bhttp.get(CRYPTOWATCH_URL +  coin + 'krw/summary'))
        .then(response)
        .then(attach => {
            replier.sendAttach(coin, msg, [attach]);
        })
        .catch(e => logger.error(e));
}

function buildAttach(coin, value) {
    try {
        const cf = JSON.parse(fs.readFileSync(CONFIG + coin.toLowerCase() + '/' + CONFIG_FILENAME));
        const result = value.body.result;
        const price = Number(result.price.last);
        const high = Number(result.price.high);
        const low = Number(result.price.low);
        const changePercent = roundTo(Number(result.price.change.percentage),4);
        // const changePrice = Number(result.price.change.absolute);
        let trendShort = true;
        let trendLastTitle = '';
        let trendLastText = '';
        const trendLog = LOG + coin.toLowerCase() + '/' + TREND_FILENAME;
        if(fs.existsSync(trendLog)) {
            const stats = fs.statSync(trendLog);
            if ((new Date() - stats.mtime) > 600000) {    // if last trend log is before 10 min, then
                trendLastTitle = 'Tracker stopped ' + +roundTo((new Date() - stats.mtime) / 60000, 0) + ' min. ago';
                trendLastText = 'Last trend log time is  ' + momenttimezone(new Date(stats.mtime)).tz('Asia/Seoul').format('YY-MM-DD HH:mm');
                trendShort = false;
            }
        }
        else {
            trendLastTitle = 'Tracker not started ';
            trendLastText = 'No trend log file yet ' + trendLog;
            trendShort = false;
        }
        let coinConf = new coinConfig(coin)
            .addField('Buy:     ' + npercent((price - cf.buyPrice ) / price), npadBlank(cf.buyPrice))
            .addField('Low : ' + npad(low, 'High: ' + npad(high)))
            .addField('Sell:     ' + npercent((cf.sellPrice - price) / price),  npadBlank(cf.sellPrice))
            .addField('24hr Change ', npercent(changePercent))
            .addField('gapAllowance ', npercent(cf.gapAllowance))
            .addField('updown alert ', npercent(cf.updown))
            .addField(trendLastTitle,trendLastText, trendShort)
        ;
        coinConf.title += '   ' + npadBlank(price);
        return coinConf;
    } catch (e) {
        throw new Error(e);
    }
}
