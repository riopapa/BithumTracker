
const request = require('request');
const replaceall = require('replaceall');
const querystring = require('querystring');
const CURRENCY = process.env.CURRENCY;
const currency = CURRENCY.toLowerCase();

// environment variables
const WEB_TOKEN = process.env.WEB_TOKEN;
const ICON_URL = process.env.ICON_URL;
const CHANNEL = process.env.CHANNEL;
const COINS_NAME = process.env.COINS_NAME.split(',');
const COINS_KEY = process.env.COINS_KEY.split(',');

let log4js = require('log4js');
const logger = log4js.getLogger('replier:' + currency);
// const SpecialChars = ' ~!_-:|*@#=.;\`"^';
const BracketCharsL = '[{(< !|';
const BracketCharsR = ']})> !|';
// const SpecialCharsLength = SpecialChars.length;
const BracketCharsLength = BracketCharsL.length;

// exports.sendText = (text) => sendTextOnly(text);
exports.sendAttach = (iconName, text, attachs) => sendWithAttach(iconName, text, attachs);
// exports.sendSlack = (line, title, url) => sendMarkDownedText(line, title, url);

function sendWithAttach(iconName, text, attachs) {
    requestMessage(buildMessage(iconName, text, attachs));
    logger.warn(replaceall('\n', '; ', text));
}

function buildMessage(iconName, text, attachs = null) {
    const deit = Date.now();
    const msg = {
        token: WEB_TOKEN,
        channel: CHANNEL,
        as_user: false,
        coinName: COINS_NAME[COINS_KEY.indexOf(iconName)],
        username: coinName.substr(0,deit % coinName.length - 1) + ' ' + coinName.substr(deit % coinName.length) + ' ' +
                    BracketCharsL.substr(deit % BracketCharsLength, 1) + iconName + BracketCharsR.substr(deit % BracketCharsLength, 1),
        icon_url: ICON_URL + iconName + '.png',
        text: ''
    };
    if(attachs) {
        attachs[0].title += text;
        msg.attachments = JSON.stringify(attachs);
    }
    else {
        msg.text = text;
    }
    return msg;
}

function requestMessage(msg) {
    let webMsg = 'http://slack.com/api/chat.postMessage?' + querystring.stringify(msg);
    request(webMsg, function(error, response) {
        if (error || response.statusCode !== 200) {
            logger.error(error);
        }
    });
}


