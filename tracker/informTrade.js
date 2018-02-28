const CURRENCY = process.env.CURRENCY;
const currency = CURRENCY.toLowerCase();
const EOL = require('os').EOL;
const replaceall = require('replaceall');
const bhttp = require('bhttp');
const Promise = require('bluebird');
const show = require('./showCoinValues.js');
const replier = require('./replier.js');
const LOG = process.env.LOG;
let log4js = require('log4js');
const logger = log4js.getLogger('trade:' + currency);
const rollere = require('streamroller');
let streame = new rollere.RollingFileStream(LOG + currency + '/event.csv', 1000000, 2);
const momenttimezone = require('moment-timezone');
const TIMEZONE = 'Asia/Seoul';
const minuteFormat = (epoch) => momenttimezone(epoch).tz(TIMEZONE).format('MM-DD HH:mm');

exports.Trade = (nv, cf) => inform_Trade(nv, cf);

/**
 * inform_Trade : send message to slack via web-hook
 *
 *
 * @return none
 */

function inform_Trade(nv,cf) {

    nv.bitkrw = -1;
    Promise.try(() => bhttp.get('https://api.bithumb.com/public/ticker/' + currency))
        .then(response => {
            const body = response.body;
            if (body.status === '0000') {
                nv.bitkrw = Number(body.data.closing_price);
                // nv.bitepoch = Number(body.data.date);
            }
            else {
                logger.error('response status error ' + body.status);
            }
        })
        .then (() => {
            const attach = show.attach(nv, cf);
            attach.title += '   ' + momenttimezone(new Date(nv.epoch)).tz(TIMEZONE).format('MM-DD HH:mm')
                + ' <' + nv.outcomes + '>\n';
            replier.sendAttach(CURRENCY, nv.outText, [attach]);
            keepevent(nv);

        })
        .catch((e) => {
            logger.error('Error while get bithumb krw');
            logger.error(e);
        });

}

/**
 * keepevent : append nv into event log file
 *
 *
 * @return none
 */

function keepevent(nv) {

    try {
        const str = [
            CURRENCY,
            minuteFormat(new Date(nv.epoch)),
            nv.tradeType,
            nv.close,
            nv.bitkrw,
            nv.outcome,
            nv.outcomes,
            replaceall(EOL, '; ', nv.msgText)
        ].join(', ');
        streame.write(str + EOL);
    } catch (e) {
        logger.error(e);
    }
}
