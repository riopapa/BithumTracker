
const pad = require('pad');
const numeral = require('numeral');
const momenttimezone = require('moment-timezone');
const TIMEZONE = 'Asia/Seoul';

const coinConfig = require('./coinConfig.js');
const CURRENCY = process.env.CURRENCY;

const NPAD_SIZE = Number(process.env.NPAD_SIZE);
const npad = (number) => pad(NPAD_SIZE, numeral((number)).format('0,0'));
const npadBlank = (number) => pad(NPAD_SIZE + 5, numeral((number)).format('0,0'));
const npercent = (number) => numeral(number * 100).format('0,0.00') + '%';

exports.attach = (nv, cf) => buildAttach(nv, cf);

function buildAttach(nv, cf) {
    try {
        let prev = '';
        for (let i = 0; i < 5; i++) {
            prev += momenttimezone(new Date(nv.pEpoch[i] * 1000)).tz(TIMEZONE).format('HH:mm');
            prev += npadBlank(nv.pClose[i]) + ' (' + npercent((nv.close - nv.pClose[i]) / nv.pClose[i]) + ')  ' + nv.pVolume[i] + '\n';
        }
        const delta = (nv.periodMax - nv.periodMin) / 30;
        prev += '|' + pad((nv.close - nv.periodMin) / delta,'*', '-') + pad((nv.periodMax - nv.close) / delta, '|','-');

        return new coinConfig(CURRENCY)

            .addField('Now : ' + npad(nv.close) + '     +/-%      vol', prev, false)
            .addField('Buy:     ' + npercent((nv.close - cf.buyPrice ) / nv.close), npadBlank(cf.buyPrice) )
            .addField('gapAllow ' + npercent(cf.gapAllowance),  'histo ' + ((nv.histoSign) ? '>< ' : ' ') + numeral(nv.histogram).format('0.0'))

            .addField('Sell:     ' + npercent((cf.sellPrice - nv.close) / nv.close), npadBlank(cf.sellPrice) + '\n' +
                'd,k(' + numeral(nv.dLast).format('0') + ',' + numeral(nv.kLast).format('0') + ':' +
                numeral(nv.dNow).format('0') + ',' + numeral(nv.kNow).format('0') + ')')
            .addField('Volume (avr/last)', numeral(nv.volume).format('0,0.0')  +
                '  (' + numeral(nv.volumeLast / nv.volumeAvr * 100).format('0,0') + '%)\n'  +
                numeral(nv.volumeAvr).format('0,0.0') + ' / ' + numeral(nv.volumeLast).format('0,0.0'))

            .addField('vs Min: ' + npercent((nv.close - nv.periodMin ) / nv.periodMin), npadBlank(nv.periodMin) )
            .addField('vs Max: ' + npercent((nv.close - nv.periodMax ) / nv.periodMax), npadBlank(nv.periodMax) )

        ;
    } catch (e) {
        throw new Error(e);
    }
}

