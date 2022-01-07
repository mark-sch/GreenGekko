const log = require('../core/log');
const moment = require('moment');
const _ = require('lodash');
const config = require('../core/util').getConfig();
const util = require('../core/util.js');
const telegrambot = config.telegrambot;
const emitTrades = telegrambot.emitTrades;
const utc = moment.utc;
const telegram = require("node-telegram-bot-api");

const User = function(chatId) {
   this.chatId =  chatId;
   this.isAdmin = false;
   this.state = "WAIT_FOR_COMMAND";
};

const Actor = function() {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  this.advice = null;
  this.adviceTime = utc();

  this.price = 'Dont know yet :(';
  this.priceTime = utc();

  this.pcurrency = 'Dont know yet :(';
  this.passet = 'Dont know yet :(';
  this.pvalue = 'Dont know yet :(';
  this.pperformance = undefined;
  this.lasttradeprice = undefined;

  this.commands = {
    '/start': 'emitStart',
    '/list' : 'emitList',
    '/price': 'emitPrice',
    '/trend': 'emitAdvice',
    '/subscribe': 'emitSubscribe',
    '/unsubscribe': 'emitUnSubscribe',
    '/admin': 'emitAdminMode',
    '/help': 'emitHelp'
  };

  this.admincommands = {
    '/portfolio': 'emitAdminPortfolio',
    '/price': 'emitAdminPrice',
    '/buy' : 'emitAdminBuy',
    '/sell': 'emitAdminSell',
    '/exit': 'emitAdminExit',
  };

  this.subscribers = [];
  this.states = [];
  this.bot = new telegram(telegrambot.token, { polling: true });
  this.bot.onText(/(.+)/, this.verifyQuestion);

  this.nokeyboard = {
    "parse_mode" : "HTML"
  }

  this.keyboard = {
    "parse_mode" : "HTML",
    "reply_markup": {
      "keyboard": [["/list", "/price", "/trend"], ["/subscribe", "/unsubscribe"], ["/admin"]]
    }
  }

  this.adminkeyboard = {
    "parse_mode" : "HTML",
    "reply_markup": {
      "keyboard": [["/portfolio"], ["/price"], ["/buy", "/sell"], ["/exit"]]
    }
  }
};

// teach our events
util.makeEventEmitter(Actor);


Actor.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  this.priceTime = candle.start;
  if (this.lasttradeprice !== undefined && this.lasttradeprice !== 0) {
    let change = this.price / this.lasttradeprice;

    if (change > 1)
      this.pperformance = '+' + ((change - 1)*100).toFixed(2) + ' %';
    else
      this.pperformance = '-' + ((1 - change)*100).toFixed(2) + ' %';
  }

  done();
};


Actor.prototype.processAdvice = function(advice) {
  if (advice.recommendation === 'soft') return;
  this.advice = advice.recommendation;
  this.adviceTime = utc();
  this.advicePrice = this.price;
  this.subscribers.forEach(this.emitAdvice, this);
};

Actor.prototype.processPortfolioChange = function(portfolio) {
  this.pcurrency = portfolio.currency;
  this.passet = portfolio.asset;
}

Actor.prototype.processPortfolioValueChange = function(portfolio) {
  this.pvalue = portfolio.balance;
}

if(emitTrades) {
  Actor.prototype.processTradeInitiated = function (tradeInitiated) {
    var message = '<b>Trade initiated.</b>' +
    '\nAction: ' + tradeInitiated.action + 
    '\nPortfolio:\nCurrency: ' + tradeInitiated.portfolio.currency + ' ' + config.watch.currency + 
    '\nAsset: ' + tradeInitiated.portfolio.asset + ' ' + config.watch.asset +  
    '\nBalance: ' + tradeInitiated.balance;
    
    this.subscribers.forEach(function(chatId) {
      this.bot.sendMessage(chatId, message, this.nokeyboard);
    }, this);
  }
  
  Actor.prototype.processTradeCancelled = function (tradeCancelled) {
    var message = 'Trade cancelled.';
    this.bot.sendMessage(this.chatId, message);
  }
  
  Actor.prototype.processTradeAborted = function (tradeAborted) {
    var message = '<b>Trade aborted.</b>' +
    '\nNot creating order! Reason: ' + tradeAborted.reason;
  
    this.subscribers.forEach(function(chatId) {
      this.bot.sendMessage(chatId, message, this.nokeyboard);
    }, this);  
  }
  
  Actor.prototype.processTradeErrored = function (tradeErrored) {
    var message = '<b>Trade errored.</b>' +
    '\nReason: ' + tradeErrored.reason;
  
    this.subscribers.forEach(function(chatId) {
      this.bot.sendMessage(chatId, message, this.nokeyboard);
    }, this);
  }
  
  Actor.prototype.processTradeCompleted = function (tradeCompleted) {
    var message = '<b>Trade completed.</b>' + 
    '\nAction: ' + tradeCompleted.action +
    '\nPrice: ' + tradeCompleted.price + ' ' + config.watch.currency +
    '\nPortfolio:' +
    '\nCurrency: ' + tradeCompleted.portfolio.currency + ' ' + config.watch.currency +
    '\nAsset: ' + tradeCompleted.portfolio.asset + ' ' + config.watch.asset +
    '\nNew value: ' + tradeCompleted.balance.toFixed(2) + ' ' + config.watch.currency +
    '\nFee percent: ' + tradeCompleted.feePercent;
    
    this.lasttradeprice = tradeCompleted.price
    this.subscribers.forEach(function(chatId) {
      this.bot.sendMessage(chatId, message, this.nokeyboard);
    }, this);
  }
}

Actor.prototype.verifyQuestion = function(msg, text) {
  //determine wheter in user or admin mode first
  console.log(text);

  if (this.states !== undefined) {
    var user = this.states.find(function(element) {
      return element.chatId === msg.chat.id;
    });
  }

  if (user === undefined) {
     //normal user mode
     if (text[1].toLowerCase() in this.commands) {
       this[this.commands[text[1].toLowerCase()]](msg.chat.id);
     } else {
       this.emitStart(msg.chat.id);
     }
  }
  else {
     //wheter waiting for admin pw or already in admin mode
     if (user.state == 'WAIT_FOR_PW') {
       this.emitAdminPWCheck(msg.chat.id, text[1]);
     }
     else if (user.isAdmin == true) {
       //admin user mode
       if (text[1].toLowerCase() in this.admincommands) {
          this[this.admincommands[text[1].toLowerCase()]](msg.chat.id);
       } else {
         this.emitAdminHelp(msg.chat.id);
       }
     }
  }
};


Actor.prototype.emitStart = function(chatId) {
  this.bot.sendMessage(chatId, 'Hi! I am ready to inform you about the latest crypto trading trends I am going to discover for you.\n\n');
  this.emitHelp(chatId);
};



Actor.prototype.emitSubscribe = function(chatId) {
  if (this.subscribers.indexOf(chatId) === -1) {
    this.subscribers.push(chatId);
    this.bot.sendMessage(chatId, `Success! You and ${this.subscribers.length} others are subscribing my trade advices.I will notify you when there is something happening on the market, stay tuned.`);
  } else {
    this.bot.sendMessage(chatId, "You are already subscribed.");
  }
};


Actor.prototype.emitUnSubscribe = function(chatId) {
  if (this.subscribers.indexOf(chatId) > -1) {
    this.subscribers.splice(this.subscribers.indexOf(chatId), 1);
    this.bot.sendMessage(chatId, "Success! You are unsubscribed and will not receive further notifications.");
  } else {
    this.bot.sendMessage(chatId, "You are not subscribed.");
  }
};


Actor.prototype.emitList = function(chatId) {
  let message = [
    'I am watching <b>',
    config.watch.asset,
    '/',
    config.watch.currency,
    '</b> at ',
    config.watch.exchange,
    ' for you.\n',
    'I am using <b>',
    config.tradingAdvisor.method,
    '</b> strategy at ',
    config.tradingAdvisor.candleSize,
    ' minutes candle size to give you my advices.\n',
  ].join('');

  console.log('Chat ID is: ' + chatId);
  this.bot.sendMessage(chatId, message, this.keyboard);
};


Actor.prototype.emitAdvice = function(chatId) {
  let message = [
    'Advice for ',
    config.watch.exchange,
    ' ',
    config.watch.currency,
    '/',
    config.watch.asset,
    ' using ',
    config.tradingAdvisor.method,
    ' at ',
    config.tradingAdvisor.candleSize,
    ' minute candles, is:\n',
  ].join('');
  if (this.advice) {
    message += this.advice +
      ' ' +
      config.watch.asset +
      ' ' +
      this.advicePrice +
      ' (' +
      this.adviceTime.fromNow() +
      ')';
  } else {
    message += 'None'
  }

  this.bot.sendMessage(chatId, message);
};


Actor.prototype.emitPrice = function(chatId) {
  const message = [
    'Current price at ',
    config.watch.exchange,
    ' ',
    config.watch.currency,
    '/',
    config.watch.asset,
    ' is ',
    this.price,
    ' ',
    config.watch.currency,
    ' (from ',
    this.priceTime.fromNow(),
    ')'
  ].join('');

  this.bot.sendMessage(chatId, message, this.keyboard);
};


Actor.prototype.emitAdminMode = function(chatId) {
  console.log(this.states);
  if (this.states !== undefined) {
    var user = this.states.find(function(element) {
      return element.chatId === chatId;
    });
  }
  else {
    this.states = [];
  }

  if (user == undefined) {
    user = new User(chatId);
    user.state = "WAIT_FOR_PW";
    this.states.push(user);
  } else {
    user.state = "WAIT_FOR_PW";
  }

  this.bot.sendMessage(chatId, "Enter your admin password:");
};


Actor.prototype.emitAdminPortfolio = function(chatId) {
  if (this.pcurrency === 'Dont know yet :(' || this.price === 'Dont know yet :(') {
    var message = [
      'The portfolio data is not available yet. Green Gekko is initializing, try again soon.'
    ].join('');
  } else {
    var message = [
      'Your current balance values at <b>' + config.watch.exchange + '</b>:\n',
      '<b>' + config.watch.currency + '</b>: ' + this.pcurrency + '\n',
      '<b>' + config.watch.asset + '</b>: ' + this.passet + '\n',
      this.price != undefined ? '<b>Price</b>: ' + this.price.toFixed(2) + ' ' + config.watch.currency + '\n' : '',
      this.pvalue != undefined && this.pvalue != 'Dont know yet :(' ? '<b>Value</b>: ' + this.pvalue.toFixed(2) + ' ' + config.watch.currency + '\n' : '',
      this.pperformance != undefined ? 'Change since last trade: <b>' + this.pperformance + '</b>\n' : ''
    ].join('');
  }

  message = message.substr(0, _.size(message) - 1) + '.';
  this.bot.sendMessage(chatId, message, this.adminkeyboard);
};


Actor.prototype.emitAdminPWCheck = function(chatId, msg) {
   if (this.states !== undefined) {
    var user = this.states.find(function(element) {
      return element.chatId === chatId;
    });
  }
  else {
    this.states = [];
  }

   if (msg == telegrambot.adminPW) {
    this.bot.sendMessage(chatId, 'Password correct! You are in admin mode now.\n');
    user.state = 'WAIT_FOR_COMMAND';
    user.isAdmin = true;
    this.emitAdminHelp(chatId);
  }
  else {
    //remove user from state array
    this.states = this.states.find(function(element) {
      return element.chatId != chatId;
    });

    this.bot.sendMessage(chatId, 'Wrong password!\n');
    this.emitHelp(chatId);
  }
}


Actor.prototype.emitAdminPrice = function(chatId) {
  const message = [
    'Current price at ',
    config.watch.exchange,
    ' ',
    config.watch.currency,
    '/',
    config.watch.asset,
    ' is ',
    this.price,
    ' ',
    config.watch.currency,
    ' (from ',
    this.priceTime.fromNow(),
    ')'
  ].join('');

  this.bot.sendMessage(chatId, message, this.adminkeyboard);
};


Actor.prototype.emitAdminBuy = function(chatId) {
  this.emit('advice', { recommendation: 'long', date: moment() });
  this.bot.sendMessage(chatId, "OK, I am going to BUY new tokens now. Check your /portfolio soon.");
};


Actor.prototype.emitAdminSell = function(chatId) {
  this.emit('advice', { recommendation: 'short', date: moment() });
  this.bot.sendMessage(chatId, "OK, I am going to SELL your tokens now. Check your /portfolio soon.");
};


Actor.prototype.emitAdminExit = function(chatId) {
  //remove user from state array
  this.states = this.states.find(function(element) {
    return element.chatId != chatId;
  });

  this.bot.sendMessage(chatId, 'Ok, logged out from admin mode.\n');
  this.emitHelp(chatId);
};


Actor.prototype.emitHelp = function(chatId) {
  let message = [
    'Go ahead, possible commands are:\n\n',
    '/list - list token and advice strategy\n',
    '/price - get latest price from exchange\n',
    '/trend - show current trend due to market\n',
    '/subscribe - receive upcoming advices\n',
    '/unsubscribe - stop receiving advices\n',
    '/admin - enter admin mode\n'
  ].join('');

  message = message.substr(0, _.size(message) - 1) + '.';
  this.bot.sendMessage(chatId, message, this.keyboard);
};


Actor.prototype.emitAdminHelp = function(chatId) {
  let message = [
    'Possible ADMIN commands:\n\n',
    '/portfolio - show your exchange balances\n',
    '/price - get latest price from exchange\n',
    '/buy - buy crypto assets now\n',
    '/sell - sell your crypto assets now\n',
    '/exit - exit admin mode\n'
  ].join('');

  message = message.substr(0, _.size(message) - 1) + '.';
  this.bot.sendMessage(chatId, message, this.adminkeyboard);
};


Actor.prototype.logError = function(message) {
  log.error('Telegram ERROR:', message);
};

module.exports = Actor;
