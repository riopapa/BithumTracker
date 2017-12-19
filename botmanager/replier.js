
const request = require('request');
const querystring = require('querystring');
const slackPost = require('slackpost');
const replaceall = require('replaceall');

// environment variables
const WEB_TOKEN = process.env.WEB_TOKEN;
const ICON_URL = process.env.ICON_URL;
const CHANNEL = process.env.CHANNEL;
const WEB_HOOK = process.env.WEB_HOOK;
const BOT_ICON = process.env.BOT_ICON;
const COINS_NAME = process.env.COINS_NAME.split(',');
const COINS_KEY = process.env.COINS_KEY.split(',');

// LOGGER
let log4js = require('log4js');
const logger = log4js.getLogger('replier:bot');

exports.sendText = (text) => sendTextOnly(text);
exports.sendAttach = (iconName, text, attachs) => sendWithAttach(iconName, text, attachs);
exports.sendSlack = (line, title, url) => sendMarkDownedText(line, title, url);

function sendTextOnly(text) {
    requestMessage(buildMessage(BOT_ICON, text));
    logger.debug(replaceall('\n', '; ', text));
}

function sendWithAttach(iconName, text, attachs) {
    requestMessage(buildMessage(iconName, text, attachs));
    logger.debug(replaceall('\n', '; ', text));
}

function buildMessage(iconName, text, attachs = null) {
    let usrname = COINS_NAME[COINS_KEY.indexOf(iconName)] + ' (' + iconName + ')';
    if (iconName === BOT_ICON) {
        usrname = 'botmanager';
    }
    const msg = {
        token: WEB_TOKEN,
        channel: CHANNEL,
        as_user: false,
        username: usrname,
        icon_url: ICON_URL + iconName + '.png',
        text: ''
    };
    if(attachs) {
        attachs[0].title += '\n' + text;
        msg.attachments = JSON.stringify(attachs);
    }
    else {
        msg.text = text;
    }
    return msg;
}

function sendMarkDownedText(line, title, url) {
    try {

        let post = slackPost.post(WEB_HOOK);
        post
            .setUsername('botmanager')
            .enableFieldMarkdown()
            .setColor(slackPost.COLOR_LIST['GOOD'])
            .setTitle(title, url)
            .setRichText(line,true)
            .setIconURL(ICON_URL + BOT_ICON + '.png')
            .enableUnfurlLinks()
            .send((err) => { if (err) throw err; });
        logger.debug(replaceall('\n', '; ', title));
    } catch(e) {
        logger.error(e);
    }
}

function requestMessage(msg) {
    let webMsg = 'http://slack.com/api/chat.postMessage?' + querystring.stringify(msg);
    request(webMsg, function(error, response) {
        if (error || response.statusCode !== 200) {
            logger.error(error);
        }
    });
}
