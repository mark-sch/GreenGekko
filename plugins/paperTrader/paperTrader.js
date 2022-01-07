const _ = require('lodash');

const util = require('../../core/util');
const moment = require('moment');
const ENV = util.gekkoEnv();

const config = util.getConfig();
const calcConfig = config.paperTrader;
const watchConfig = config.watch;
const shortTrading = config.performanceAnalyzer.shortTrading;
const dirs = util.dirs();
const log = require(dirs.core + 'log');

const TrailingStop = require(dirs.broker + 'triggers/trailingStop');

const PaperTrader = function() {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  if(calcConfig.feeUsing === 'maker') {
    this.rawFee = calcConfig.feeMaker;
  } else {
    this.rawFee = calcConfig.feeTaker;
  }

  this.fee = 1 - this.rawFee / 100;

  this.currency = watchConfig.currency;
  this.asset = watchConfig.asset;

  this.portfolio = {
    asset: calcConfig.simulationBalance.asset,
    currency: calcConfig.simulationBalance.currency,
  }

  this.balance = false;

  if(this.portfolio.asset > 0 && !shortTrading) {
    this.exposed = true;
  }
  else {
    this.exposed = false;
  }

  this.propogatedTrades = 0;
  this.propogatedTriggers = 0;

  this.warmupCompleted = false;

  this.warmupCandle;
}

PaperTrader.prototype.relayPortfolioChange = function() {
  this.deferredEmit('portfolioChange', {
    asset: this.portfolio.asset,
    currency: this.portfolio.currency
  });
}

PaperTrader.prototype.relayPortfolioValueChange = function() {
  this.deferredEmit('portfolioValueChange', {
    balance: this.getBalance()
  });
}

PaperTrader.prototype.extractFee = function(amount) {
  amount *= 1e8;
  amount *= this.fee;
  amount = Math.floor(amount);
  amount /= 1e8;
  return amount;
}

PaperTrader.prototype.setStartBalance = function() {
  this.balance = this.getBalance();
}

// after every succesfull trend ride we hopefully end up
// with more BTC than we started with, this function
// calculates Gekko's profit in %.
PaperTrader.prototype.updatePosition = function(what) {

  let cost;
  let amount;

  if (!shortTrading) {
    // virtually trade all {currency} to {asset}
    // at the current price (minus fees)
    if(what === 'long') {
      cost = (1 - this.fee) * this.portfolio.currency;
      this.portfolio.asset += this.extractFee(this.portfolio.currency / this.price);
      amount = this.portfolio.asset;
      this.portfolio.currency = 0;

      this.exposed = true;
      this.trades++;
    }

    // virtually trade all {asset} to {currency}
    // at the current price (minus fees)
    else if(what === 'short') {
      cost = (1 - this.fee) * (this.portfolio.asset * this.price);
      amount = this.portfolio.asset;
      this.portfolio.currency += this.extractFee(this.portfolio.asset * this.price);
      this.portfolio.asset = 0;

      this.exposed = false;
      this.trades++;
    }
  }
  else {
    if(what === 'long') { //actually a closing short
      if (this.portfolio.asset == 0) {
        this.portfolio.asset = this.portfolio.currency / this.price;
        this.portfolio.previouscurrency = this.portfolio.currency;
        this.portfolio.currency = 0;
      }

      cost = (1 - this.fee) * (this.portfolio.asset * this.price);
      amount = this.portfolio.asset; //0    1.18*928=1095    
      this.portfolio.currency = this.extractFee(this.portfolio.asset * this.price);
      this.portfolio.currency = this.portfolio.previouscurrency + (this.portfolio.previouscurrency - this.portfolio.currency);
      this.portfolio.asset = 0;

      this.exposed = false;
      this.trades++;
    }
    else if(what === 'short') { //actually an opening short
      if (this.portfolio.currency == 0) {
        this.portfolio.currency = this.portfolio.asset * this.price;
        this.portfolio.asset = 0;
      }
      
      cost = (1 - this.fee) * this.portfolio.currency;
      this.portfolio.asset += this.extractFee(this.portfolio.currency / this.price);
      amount = this.portfolio.asset;
      this.portfolio.previouscurrency = this.extractFee(this.portfolio.currency);
      this.portfolio.currency = 0;

      this.exposed = true;
      this.trades++;
    }
  }

  const effectivePrice = this.price * this.fee;

  return { cost, amount, effectivePrice };
}

PaperTrader.prototype.getBalance = function() {
  return this.portfolio.currency + this.price * this.portfolio.asset;
}

PaperTrader.prototype.now = function() {
  return this.candle.start.clone().add(1, 'minute');
}

PaperTrader.prototype.processAdvice = function(advice) {
  let action;
  var mytrigger = _.clone(advice.trigger);
  
  if(advice.recommendation === 'short') {
    action = 'sell';

    // clean up potential old stop trigger
    if (this.activeStopTrigger) {

      this.deferredEmit('triggerAborted', {
        id: this.activeStopTrigger.id,
        date: advice.date
      });

      delete this.activeStopTrigger;
    }

  } else if(advice.recommendation === 'long') {
    action = 'buy';

    // clean up potential old stop trigger
    if(this.activeStopTrigger) {
      this.deferredEmit('triggerAborted', {
        id: this.activeStopTrigger.id,
        date: advice.date
      });

      delete this.activeStopTrigger;
    }
    
    if(advice.trigger) {
      this.createTrigger(advice);
    }
  } else {
    // do not warn - advice event is used to transfer infomsg between plugins
    return;
    /*return log.warn(
      `[Papertrader] ignoring unknown advice recommendation: ${advice.recommendation}`
    );*/
  }

  this.tradeId = 'trade-' + (++this.propogatedTrades);

  this.deferredEmit('tradeInitiated', {
    id: this.tradeId,
    adviceId: advice.id,
    action,
    origin: advice.origin,
    infomsg: advice.infomsg, 
    setTakerLimit: advice.setTakerLimit,
    portfolio: _.clone(this.portfolio),
    balance: this.getBalance(),
    date: advice.date,
    status: 'tradeInitiated'
  });

  const { cost, amount, effectivePrice } = this.updatePosition(advice.recommendation);

  this.relayPortfolioChange();
  this.relayPortfolioValueChange();
  this.deferredEmit('tradeCompleted', {
    id: this.tradeId,
    adviceId: advice.id,
    action,
    cost,
    amount,
    price: this.price,
    origin: advice.origin,
    infomsg: advice.infomsg, 
    setTakerLimit: advice.setTakerLimit,
    portfolio: _.clone(this.portfolio),
    balance: this.getBalance(),
    date: advice.date,
    effectivePrice,
    feePercent: this.rawFee,
    status: 'tradeCompleted',
    trigger: {
      origin: mytrigger !== undefined ? mytrigger.type : 'advice',
      trailPercentage: mytrigger !== undefined ? mytrigger.trailPercentage : undefined,
      strategy: mytrigger !== undefined ? advice.trigger.strategy : undefined
    } 
  });
}

PaperTrader.prototype.createTrigger = function(advice) {
  const trigger = advice.trigger;

  if(trigger && trigger.type === 'trailingStop') {

    if(!trigger.trailValue) {
      return log.warn(`[Papertrader] ignoring trailing stop without trail value`);
    }

    const triggerId = 'trigger-' + (++this.propogatedTriggers);

    this.deferredEmit('triggerCreated', {
      id: triggerId,
      at: advice.date,
      type: 'trailingStop',
      properties: {
        trail: trigger.trailValue,
        initialPrice: this.price,
      }
    });

    this.activeStopTrigger = {
      id: triggerId,
      adviceId: advice.id,
      strategy: trigger.strategy,
      instance: new TrailingStop({
        initialPrice: this.price,
        trail: trigger.trailValue,
        trailPercentage: trigger.trailPercentage,
        onTrigger: this.onStopTrigger
      })
    }
  } else {
    log.warn(`[Papertrader] Gekko does not know trigger with type "${trigger.type}".. Ignoring stop.`);
  }
}

PaperTrader.prototype.onStopTrigger = function(trail, trailPercentage) {
  const date = this.now();

  this.deferredEmit('triggerFired', {
    id: this.activeStopTrigger.id,
    date
  });
/*
  const { cost, amount, effectivePrice } = this.updatePosition('short');

  this.relayPortfolioChange();
  this.relayPortfolioValueChange();

  this.deferredEmit('tradeCompleted', {
    id: this.tradeId,
    adviceId: this.activeStopTrigger.adviceId,
    action: 'sell',
    cost,
    amount,
    price: this.price,
    portfolio: this.portfolio,
    balance: this.getBalance(),
    date,
    effectivePrice,
    feePercent: this.rawFee,
    status: 'tradeCompleted',
    origin: 'onStopTrigger'
  });
*/
  
  let adviceId = this.activeStopTrigger.adviceId;
  //delete this.activeStopTrigger;
  this.deferredEmit('advice', { 
    recommendation: 'short', 
    date, 
    id: this.tradeId, 
    trigger: {
      type: 'trailingStop',
      trail: this.activeStopTrigger.instance.trail,
      trailPercentage: this.activeStopTrigger.instance.trailPercentage,
      adviceId: this.activeStopTrigger.adviceId,
      strategy: this.activeStopTrigger.strategy
    }
  });
}

PaperTrader.prototype.processStratWarmupCompleted = function() {
  this.warmupCompleted = true;
  this.processCandle(this.warmupCandle, _.noop);
}

PaperTrader.prototype.processCandle = function(candle, done) {
  if(!this.warmupCompleted) {
    this.warmupCandle = candle;
    return done();
  }

  this.price = candle.close;
  this.candle = candle;

  if(!this.balance) {
    this.setStartBalance();
    this.relayPortfolioChange();
    this.relayPortfolioValueChange();
  }

  if(this.exposed) {
    this.relayPortfolioValueChange();
  }

  if(this.activeStopTrigger) {
    this.activeStopTrigger.instance.updatePrice(this.price);
  }

  done();
}

module.exports = PaperTrader;
