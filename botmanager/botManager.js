
// require list //
require('dotenv').load();

const format = require('string-format');
format.extend(String.prototype);
const fs = require('fs');

const Bot = require('slackbots');
const Promise = require('bluebird');
const bhttp = require('bhttp');

const CommandHelper = require('./commandHelper');

const show = require('./showStatus.js');
const replier = require('./replier.js');
const who = require('./getSlackName.js');
const roundTo = require('round-to');
const CRYPTOWATCH_URL = 'https://api.cryptowat.ch/markets/bithumb/';

// CONFIGRATION && LOGGER
const CONFIG = process.env.CONFIG;  // configuration folder with '/'
const CONFIG_FILENAME = process.env.CONFIG_FILENAME;

const json = require('json-file');

let log4js = require('log4js');
const LOG = process.env.LOG;
const LOGGER_CONFIGFILE = process.env.LOGGER_CONFIGFILE;
const LOGGER_OUTFILE = process.env.LOGGER_OUTFILE;
let logCf = new json.read(CONFIG + LOGGER_CONFIGFILE).data;
logCf.appenders.file.filename = LOG + 'botmanager/' + LOGGER_OUTFILE;
log4js.configure(logCf);
let log4js_extend = require('log4js-extend');
log4js_extend(log4js, {
    path: __dirname,
    format: '(@name:@line:@column)'
});
const logger = log4js.getLogger('botmanager');

const COINS_KEY = process.env.COINS_KEY.split(',');
const COINS_CMD = process.env.COINS_CMD.split(',');
const coins_cmd = COINS_CMD.reduce((c1, c2) => c1 + c2);

const CHANNEL = process.env.CHANNEL;
const USERS = process.env.USERS.split(',');
const BOT_TOKEN = process.env.BOT_TOKEN; // for #cryptocurrency & #cointest

function showUsage() {
    const header =  'Monitor CrytoCoins [' + process.env.COINS_KEY + ']';
    const usage = '*USAGE*\n' +
        '*sb* _{currency}{subcommand}{amount}_\n' +
        '      {' + coins_cmd + 'n}  {bsagun*}  {(+-)123(k%)}\n' +
        '_Refer github_ README.md _for more detail_\nhttps://goo.gl/MQqVYV'; // https://github.com/riopapa/BithumTracker#usage';

    replier.sendSlack(usage, header, 'https://goo.gl/MQqVYV');
    logger.debug(header);
}

let showCoin = (match) => show.info(COINS_KEY[COINS_CMD.indexOf(match[1])], 'Current Values');

let showActiveCoins = () => COINS_KEY.forEach(_ => show.info(_, 'Current Config'));

let updateCoin = (match) => {
    updateConfig(match);
    showCoin(match);
};

let updateAllCoins = (match) => {
    COINS_CMD.forEach((c) => {
        match[1] = c;
        updateCoin(match);
    });
};

let changeUpDownPercent = (match) => {
    changeUpDown(match);
    showCoin(match);
};

let changeAllUpDownPercents = (match) => {
    COINS_CMD.forEach((c) => {
        match[1] = c;
        changeUpDownPercent(match);
    });
};

let adjustAllConfigs = (match) => {
    COINS_CMD.forEach((c) => {
        match[1] = c;
        adjustConfig(match);
    });
};

let adjustConfig = (match) => {
    const cointype = COINS_KEY[COINS_CMD.indexOf(match[1])];
    const response = (value) => adjustSellBuy(cointype, value);
    Promise.try(() => bhttp.get(CRYPTOWATCH_URL +  cointype + 'krw/price'))
        .then(response)
        .then(() => show.info(cointype, 'Sell, Buy Price Adjusted'))
        .catch(e => logger.error(e));
};

/**
 * updateConfig : update Configuration.json by commands input
 * @param match : match : [c(command) {cointype(BTC), command('b','s'), sign(+/-), amount(1234)]
 * @returns none
 */
let updateConfig = (match) => {
    const c = {
        coin: COINS_KEY[COINS_CMD.indexOf(match[1])],
        command: match[2].toLowerCase(),
        sign: match[3],
        amount: Number(match[4]),
        percentKilo: match[5]
    };

    const configFile = CONFIG + c.coin.toLowerCase() + '/' + CONFIG_FILENAME;
    const cf = JSON.parse(fs.readFileSync(configFile));
    switch (c.command) {
    case 's':   // sellPrice
        cf.sellPrice = updatePrice(cf.priceRadix, c.sign, c.amount, cf.sellPrice, c.percentKilo);
        break;
    case 'b':   // buyPrice
        cf.buyPrice = updatePrice(cf.priceRadix,c.sign, c.amount, cf.buyPrice, c.percentKilo);
        break;
    case 'g':   // gapAllowance
        cf.gapAllowance = roundTo(c.amount / 100, 5);
        break;
    default:
        replier.sendText('undefined config field: ' + c.command);   // should not happen
        process.exit(11);
    }
    fs.writeFileSync(configFile, JSON.stringify(cf, null, 2), 'utf-8');
    logger.debug('Update configration completed..');
};

/**
 * changeUpDown : change rapid price up down alert rate
 * @param match : match : [c(command) {cointype(BTC), command('b','s'), sign(+/-), amount(1234)]
 * @returns none
 */
let changeUpDown = (match) => {
    const coin = COINS_KEY[COINS_CMD.indexOf(match[1])];
    const amount = Number(match[4]);

    const configFile = CONFIG + coin.toLowerCase() + '/' + CONFIG_FILENAME;
    const cf = JSON.parse(fs.readFileSync(configFile));
    cf.updown = roundTo(amount / 100, 5);
    fs.writeFileSync(configFile, JSON.stringify(cf, null, 1), 'utf-8');
    logger.debug('Changing up/down completed..');
};

let invalidHandler = () => {
    replier.sendText('Command syntax error. Enter sb for help');
};

let coinTypeValidator = (match) => {
    let valid = COINS_KEY[COINS_CMD.indexOf(match[1])];
    if (!valid) {
        sayInvalidCoin();
    }

    return valid;
};

const commandHelper = new CommandHelper()
    .addCommand(/^sb\s*$/, showUsage)
    .addCommand(/^sb\s*[nN]$/, showActiveCoins)
    .addCommand(/^sb\s*([a-zA-Z])[nN]$/, showCoin, coinTypeValidator)
    .addCommand(/^sb\s*([a-zA-Z])[aA]$/, adjustConfig, coinTypeValidator)
    .addCommand(/^sb\s*([*])[aA]$/, adjustAllConfigs)
    .addCommand(/^sb\s*([a-zA-Z])\s*([bsgBSG])\s*([+-]?)((?:\d+.\d+)|(?:\d+))([k%]?)$/, updateCoin, coinTypeValidator)
    .addCommand(/^sb\s*([*])\s*([bsgBSG])\s*([+-]?)((?:\d+.\d+)|(?:\d+))([k%]?)$/, updateAllCoins)
    .addCommand(/^sb\s*([a-zA-Z])\s*([uU])\s*([+-]?)((?:\d+.\d+)|(?:\d+))([k%]?)$/, changeUpDownPercent, coinTypeValidator)
    .addCommand(/^sb\s*([*])\s*([uU])\s*([+-]?)((?:\d+.\d+)|(?:\d+))([k%]?)$/, changeAllUpDownPercents)
    .addInvalidHandler(invalidHandler);

// create a bot
const settings = {
    token: BOT_TOKEN,
    name: 'botManager'
};

const bot = new Bot(settings);

bot.on('start', function() {
    // more information about additional params https://api.slack.com/methods/chat.postMessage
    logger.debug('bot just started');
    showUsage();
});

bot.on('message', function(data) {

    // logger.debug('data.type is ' + data.type);

    if (data.type !== 'message') {
        return;
    }

    const text = data.text.trim();

    if (text.length < 2 || !text.startsWith('sb')) {
        return;
    }

    logger.debug('command = [' + text + ']');

    if ((who.channel(bot, data.channel)) !== CHANNEL || !USERS.includes(who.user(bot, data.user))) {
        replier.sendText('Unauthorized channel or user.');
        return;
    }

    try {
        commandHelper.execute(text);
    }
    catch (e) {
        logger.error(e);
    }
});

function updatePrice (cfRadix, sign, amount, price, percentKilo) {
    switch (sign + percentKilo) {    // sign : [+|-|], pK : [k|%|]
    case '+':
        price += amount;
        break;
    case '-':
        price -= amount;
        break;
    case '+k':
        price += amount * 1000;
        break;
    case '-k':
        price -= amount * 1000;
        break;
    case '+%':
        price += price * (amount /100);
        break;
    case '-%':
        price -= price * (amount /100);
        break;
    case 'k':
        price = amount * 1000;
        break;
    case '%':
        price = price * amount / 100;
        break;
    default:
        price = amount;
    }
    return roundTo(price,cfRadix);
}

function adjustSellBuy(cointype, value) {
    try {
        const configFile = CONFIG + cointype.toLowerCase() + '/' + CONFIG_FILENAME;
        const cf = JSON.parse(fs.readFileSync(configFile));
        const price = Number(value.body.result.price);
        cf.buyPrice = roundTo(price * (1 - cf.gapAllowance * 3),cf.priceRadix);
        cf.sellPrice = roundTo(price * (1 + cf.gapAllowance * 3),cf.priceRadix);
        fs.writeFileSync(configFile, JSON.stringify(cf, null, 1), 'utf-8');
        // return show.attach(cointype, value);
    }
    catch (e) {
        logger.error(e);
    }
}

function sayInvalidCoin() {
    replier.sendText('Invalid coin. Enter sb for help');
}
