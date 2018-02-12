
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
const npadBlank = (number) => pad(NPAD_SIZE + 5, numeral((number)).format('0,0.0'));
const npercent = (number) => numeral(number * 100).format('0,0.00') + '%';
// const CRYPTOWATCH_URL = 'https://api.cryptowat.ch/markets/bithumb/';

// CONFIGRATION && LOGGER
const CONFIG = process.env.CONFIG;  // configuration folder with '/'
const CONFIG_FILENAME = process.env.CONFIG_FILENAME;

let log4js = require('log4js');
const logger = log4js.getLogger('showstatus');
const LOG = process.env.LOG;
const TREND_FILENAME =  process.env.TREND_FILENAME;

exports.info = (coin, msg) => showCoinStatus(coin, msg);
exports.action = () => waitForAction();

function showCoinStatus(coin, msg) {
    const response = (value) => buildAttach(coin, value);
    const BIFINEX_URL = 'https://api.bitfinex.com/v2//tickers?symbols=t';
    Promise.try(() => bhttp.get(BIFINEX_URL +  coin + 'USD'))
        .then(response)
        .then(attach => {
            replier.sendAttach(coin, msg, [attach]);
        })
        .catch(e => logger.error(e));
}

function buildAttach(coin, value) {
    try {
        const cf = JSON.parse(fs.readFileSync(CONFIG + coin.toLowerCase() + '/' + CONFIG_FILENAME));

        //  [ SYMBOL, BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_PERC, LAST_PRICE, VOLUME, HIGH, LOW
        // ["tBTCUSD",8699.9,32.98931434,8700,60.89457034,414.9,0.0501,8699.9,63897.8226561,9074.9,8270]
        const price = Number(value.body[0][7]);
        const high = Number(value.body[0][9]);
        const low = Number(value.body[0][10]);
        const changePercent = roundTo(Number(value.body[0][6]),4);
        // const changePrice = Number(result.price.change.absolute);
        let trendShort = true;
        let trendLastTitle = '';
        let trendLastText = '';
        const trendLog = LOG + coin.toLowerCase() + '/' + TREND_FILENAME;
        if(fs.existsSync(trendLog)) {
            const stats = fs.statSync(trendLog);
            if ((new Date() - stats.mtime) > 600000) {    // if last trend log is before 10 min, then
                trendLastTitle = 'TRACKER STOPPED ' + +roundTo((new Date() - stats.mtime) / 60000, 0) + ' min. ago';
                trendLastText = 'LAST TREND LOG TIME :  ' + momenttimezone(new Date(stats.mtime)).tz('Asia/Seoul').format('YY-MM-DD HH:mm');
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
            .addField('Low : ' + npad(low), 'High: ' + npad(high))
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

function waitForAction (coin) {

    let msg = new coinConfig(coin)

}