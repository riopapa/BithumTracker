[![Waffle.io - Columns and their card count](https://badge.waffle.io/kykim79/BitcoinTracker.svg?columns=all)](http://waffle.io/kykim79/BitcoinTracker) [![Build Status](https://semaphoreci.com/api/v1/kykim79/bitcointracker/branches/master/shields_badge.svg)](https://semaphoreci.com/kykim79/bitcointracker)

# About BitcoinTracker
- This workspace is to find out right trading time for cryptocurrency
- cryptocurrency price source is [bithumb](https://www.bithumb.com)
- two modules are running
  - tracker (ohlcBuilder > analyzer)
  - botManager (to change configuration via slack)

## Table of Contents

- [Workspace Operation](#workspace-operation)
  - [Tracker start/stop](#tracker-operation)
  - [botManager start/stop](#botmanager-operation)

- [Analyzing and Managing Files](#Analyzing-and-managing-files)
- [Configuration Files](#configuration-and-environment-files)
- [Usage at Slack](#usage)

# Workspace Operation

## Tracker Operation
- load and execute ohlcCrawler.js, analyzer.js

### start
```
cd ~/workspace
node tracker.js &
```
### stop
```
ps -ef | grep tracker
ubuntu      9340    7659  0 13:08 pts/9    00:00:01 node tracker.js
ubuntu     10353    8121  0 13:39 pts/11   00:00:00 grep --color=auto tracker
kill -9 9340
```

----

## BotManager Operation
- load and execute botManager.js

### start
```
cd ~/workspace
node botManager.js &
```
### stop
```
ps -ef | grep botManager
ubuntu      9340    7659  0 13:08 pts/9    00:00:01 node botManager.js
ubuntu     10353    8121  0 13:39 pts/11   00:00:00 grep --color=auto tracker
kill -9 9340
```

# Analyzing and Managing Files

## Directory ./botmanager

### botManager.js

- get user input to set trackerConfig.json
- change will impact to analyzer.js

### minor files refered by botManager.js

#### coinConfig.js
- class file to generate slack communication base

#### commandHelper.js
- validate user input and invoke relative modules

#### getSlackName.js
- get username and channel name when user key in something

#### replier.js
- send to slack buy,sell alert with attach format

#### showStatus.js
- generate current configruation values  and prices

#### test.js
- assert test for commandHelper.js
 
## Directory ./tracker

### analyzer.js
- calculate MACD, signal, histogram
- calculate Stochastic values
- analyze buy,sell time using caculated values
- inform thru notifier.js when to buy,sell

### ohlcCrawler.js
- read from cryto site and provide Open, High, Low, Close, Volume arrays to analyzer.js

### minor files refered in analyzer.js or ohlcCrawler.js

#### coinConfig.js
- class file to generate slack communication base

#### notifier.js
- send to slack in various level
- .info, .warn, .danger : send to slack in text format
- .attach : send to slack in attach format

#### notiType.js
- notify type enum (info, warn, danger)

### replier
- send to slack buy,sell alert with attach format

### showCoinValues.js
- generate current statisistics and prices

----

# Configuration and Environment Files

## Directory ./

### botmanager.env

- define slack communication informations
- define users to handle this bot
- sample: ./botmanager.env.example

```
BOT_ICON=TST
BOT_TOKEN={BOT TOKEN}
WEB_HOOK=https://hooks.slack.com/services/{your webook}
USERS=johndoe,onlybyme

```

### tracker.env

- define configuration, log path and file names
- define slack communication information
- define cryptocurrency table
- sample: ./tracker.env.example

```
CONFIG=./config/                        // configuration folder which has each coin folder
CONFIG_FILENAME=trackerConfig.json      // dynamic tracker monitoring variables 

LOG=./log/
LOGGER_CONFIGFILE=loggerConfig.json
LOGGER_OUTFILE=history.log
TREND_FILENAME=trend.log

CHANNEL=#cointracker
ICON_URL=http://localhost/
WEB_TOKEN=xoxp-14663517xxxx-{web_token}

COINS_NAME=Bitcoin CASH,Bitcoin,Ethereum,Bitcoin Gold
COINS_KEY=BCH,BTC,ETH,BTG
COINS_CMD=c,b,e,g
```

## Directory ./config

### loggerConfig.json

- set log target to which file

  - note) appenders.file.filename will be modified in each js

```
{
  "replaceConsole": true,
  "appenders": {
    "console": { 
      "type": "console",
      "layout": {
        "type": "pattern",
        "pattern": "%[[%r] [%5.5p] %c -%] %m%n"
      }
    },
    "file": { 
      "type": "file", 
      "filename": "./log/coin.log",
      "maxLogSize": 200000
    }
  },
  "categories": {
    "default": { 
      "appenders": [ "file" ], 
      "level": "debug"
    }
  }      
}
```

## Directory ./config/coin

- /coin foldername should be replaced with proper cryptocurrency code, e.g. btc

### icon.png

- small icon to display at slack message 

### tracker.env

- define slack webhook for this crypocurrency

```
WEB_HOOK=https://hooks.slack.com/services/{web_hook}
CRON_SCHEDULE=2 */4 * * * *     // rerun at every 2 sec with 4 min interval 
NPAD_SIZE=10                    // space padding size after number conversion with comma 
```

### trackerConfig.json

- storage to keep runtime variables which may be modified by botmanager.js

```
{
  "gapAllowance": 0.033,    //  gap allowance to check within target sell,buy price for warning
  "buyPrice": 4350300,      //  Target buy Price
  "sellPrice": 5074580,     //  Target sell Price
  "priceRadix": -1,         //  base radix for adjusting price
  "updown": 0.02            //  alert if price goes up/down rapidly
}
```

# Usage

## sb _{currency}{subcommand}{amount}_

### _{currency}_

-   *b*:BTC, *x*:XRP, *e*:ETH, *c*:BCH, *g*BTG, .. (as you defiend)
-   *n*:Now
   
### _{subcommand}_

-   *b*: buyPrice,
-   *s*: sellPrice
-   *g*: gapAllowance %
-   *a*: adjust buy,sell based on nowPrice +/- gapAllowance * 3 %
-   *u*: rapid price up/down warning % 
-   *n*: nowPrice
   
### _{amount}_

-   *1234000* : set to 1,234,000
-   *12340k* : set to 12,340,000
-   *+100* : add 100 to current set
-   *-3k* : subtract 3000 from current set
-   *+3%* : add 3% on current set
-   *0.03* : set to 0.03% (gap only)

### _(note)_
 
- Uppercase currency accepted
- Spaces between _currency_, _subcommand_ and _amount_ are allowed
  
