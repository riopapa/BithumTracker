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

- [Analyzing Files Explanation](#analyzing-files-explanation)
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

## Analyzing Files Explanation

### ohlcCrawler.js
- read from cryto site and provide OHLC V arrays to analyzer.js

### analyzer.js
- calculate MACD, signal, histogram
- calculate Stochastic values
- analyze buy,sell time using caculated values
- inform thru notifier.js when to buy,sell

### notifier.js
- send various message to slack bia webhook

### Minor Files

#### coinInfo.js
- create one by one transaction provided by crawler.js

#### notiType.js
- notify type enum (info, warn, danger)

----

# Configuration and Environment Files

## loggerConfig.json

- set log target to which file
```js
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

## trackerConfig.json
- configuration that is used in analyzer.js 
```js
{
    "gapAllowance": 0.033,          //    gap allowance to check within target sell,buy price for warning
    "buyPrice": 4350300,            //    Target buy Price
    "sellPrice": 5074580,           //    Target sell Price
}
```
----

# Usage

## sb _{currency}{subcommand}{amount}_

### _{currency}_

-   *b*:BTC, *x*:XRP, *e*:ETH, *c*:BCH, *g*BTG, .. (as you defiend)
-   *n*:Now
   
### _{subcommand}_

-   *b*: buyPrice,           *s*: sellPrice
-   *g*: gapAllowance
-   *a*: adjust buy,sell based on nowPrice +/- gapAllowance * 3 %
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
  
