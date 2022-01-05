// internally we only use 1m
// candles, this can easily
// convert them to any desired
// size.

// Acts as ~fake~ stream: takes
// 1m candles as input and emits
// bigger candles.
// 
// input are transported candles.

var _ = require('lodash');
var util = require(__dirname + '/util');

var CandleBatcher = function(candleSize) {
  if(!_.isNumber(candleSize))
    throw new Error('candleSize is not a number');

  this.candleSize = candleSize;
  this.smallCandles = [];
  this.calculatedCandles = [];

  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());
}

util.makeEventEmitter(CandleBatcher);

CandleBatcher.prototype.emit1M = async function(candle) {
  if (this.asynchandler1M !== undefined) await this.asynchandler1M(candle);
}

CandleBatcher.prototype.addHeikinAshi = function(currcandle, prevcandle) {
  var f = function(x) {
    return parseFloat(x).toFixed(2);
  }
  var candle = currcandle;
  if (prevcandle.ha == undefined) {
    // happens on very first candle only
    prevcandle.ha = {
      open: (prevcandle.open + prevcandle.close) / 2,
      close: (prevcandle.open + prevcandle.high + prevcandle.low + prevcandle.close) / 4,
      high: prevcandle.high,
      low: prevcandle.low
    }
  }

  candle.ha = {};
  candle.ha.open = (prevcandle.ha.open + prevcandle.ha.close) / 2;
  candle.ha.close = (candle.open + candle.high + candle.low + candle.close) / 4;
  candle.ha.high = _.max([candle.high, candle.ha.open, candle.ha.close]);
  candle.ha.low = _.min([candle.low, candle.ha.open, candle.ha.close]);

  return candle;
}

CandleBatcher.prototype.write = async function(candles) {
  if(!_.isArray(candles)) {
    throw new Error('candles is not an array');
  }

  this.emitted = 0;

  // Pierolalune, 18.02.2021, prepare _.each for lodash upgrade
  // _.each(candles, function(candle) {
  //   this.smallCandles.push(candle);
  //   this.check();
  // }, this);
  _.each(
    candles, 
    _.bind(
      function(candle) {
        this.smallCandles.push(candle);
        this.check();
      }, 
      this
    )
  );

  return this.emitted;
}

CandleBatcher.prototype.check = async function() {
  if (this.smallCandles.length > 0) {
    await this.emit1M(this.smallCandles[this.smallCandles.length-1]);
  }

  if(_.size(this.smallCandles) % this.candleSize !== 0)
    return;

  this.emitted++;
  try {
    this.calculatedCandles.push(this.calculate());
  } catch(err) {}
  this.smallCandles = [];
}

CandleBatcher.prototype.reg1MAsyncHandler = function(handler) {
  this.asynchandler1M = handler;
}

CandleBatcher.prototype.regAsyncHandler = function(handler) {
   this.asynchandler = handler;
}

CandleBatcher.prototype.flush = async function() {
  _.each(
    this.calculatedCandles,
    async (candle) => {
      this.emit('candle', candle);
      
      if (this.asynchandler !== undefined)
        await this.asynchandler(candle);
    }
  );

  this.calculatedCandles = [];
}

CandleBatcher.prototype.calculate = function() {
  // remove the id property of the small candle
  var { id, ...first } = this.smallCandles.shift();

  first.vwp = first.vwp * first.volume;

  var candle = _.reduce(
    this.smallCandles,
    function(candle, m) {
      //console.log('!!!!!', candle, m);
      candle.high = _.max([candle.high, m.high]);
      candle.ha.high = _.max([candle.ha.high, m.ha.high]);
      candle.low = _.min([candle.low, m.low]);
      candle.ha.low = _.min([candle.ha.low, m.ha.low]);
      candle.close = m.close;
      candle.ha.close = m.ha.close;
      candle.volume += m.volume;
      candle.vwp += m.vwp * m.volume;
      candle.trades += m.trades;
      candle.end = m.start;
      return candle;
    },
    first
  );

  if(candle.volume)
    // we have added up all prices (relative to volume)
    // now divide by volume to get the Volume Weighted Price
    candle.vwp /= candle.volume;
  else
    // empty candle
    candle.vwp = candle.open;

  candle.start = first.start;
  return candle;
}

module.exports = CandleBatcher;
