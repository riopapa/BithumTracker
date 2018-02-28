const CURRENCY = process.env.CURRENCY;
const currency = CURRENCY.toLowerCase();
const LOG = process.env.LOG;

const EOL = require('os').EOL;
const replaceall = require('replaceall');
const roundTo = require('round-to');

// Stream Roller
const rollerl = require('streamroller');
let streaml = new rollerl.RollingFileStream(LOG + currency + '/' + process.env.TREND_FILENAME, 1000000, 2);
const momenttimezone = require('moment-timezone');
const TIMEZONE = 'Asia/Seoul';
const minuteFormat = (epoch) => momenttimezone(epoch).tz(TIMEZONE).format('MM-DD HH:mm');

// LOGGER
let log4js = require('log4js');
const logger = log4js.getLogger('keeplog:' + currency);

exports.Log = (nv) => keep_log(nv);
exports.Event = (nv) => keep_event(nv);

/**
 * keep_log : append nv into trend file
 *
 *
 * @return none
 */

function keep_log(nv) {

    try {
        const str = [
            CURRENCY,
            minuteFormat(new Date(nv.epoch)),
            nv.close,
            nv.bitkrw,
            nv.volume,
            nv.volumeLast,
            roundTo(nv.volumeLast / nv.volumeAvr,2),
            (nv.histoSign) ? 'H' : ' ',
            nv.slopeLast,
            nv.slopeSign,
            nv.hilowLast,
            roundTo(nv.hilowLast / nv.hilowAvr,2),
            nv.dNow,
            nv.kNow,
            nv.outcome,
            nv.tradeType,
            replaceall(EOL, '; ', nv.msgText)
        ].join(', ');
        streaml.write(str + EOL);
    } catch (e) {
        logger.error(e);
    }

    // sometimes write value header
    const d = new Date(nv.epoch);
    if (d.getMinutes() > 58 && (d.getHours() % 3 === 1)) {
        const head = 'coin, date time  ,  close,  bithumb, vol, vLast, volP, Hsign, slope, sign, hilow, hilowP, d, k, outcome, B/S, msg';
        streaml.write(head + EOL);
    }
}
