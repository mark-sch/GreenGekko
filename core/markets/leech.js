// a leech market is "semi-realtime" and pulls out candles of a
// database (which is expected to be updated regularly, like with a
// realtime market running in parallel).

const _ = require('lodash');
const moment = require('moment');

const util = require('../util');
const dirs = util.dirs();
const log = require(dirs.core + 'log');
const config = util.getConfig();

const exchangeChecker = require(dirs.gekko + 'exchange/exchangeChecker');

const adapter = config[config.adapter];
const Reader = require(dirs.gekko + adapter.path + '/reader');

const TICKINTERVAL = 20 * 1000; // 20 seconds

const slug = config.watch.exchange.toLowerCase();
const exchange = exchangeChecker.getExchangeCapabilities(slug);

if(!exchange)
  util.die(`Unsupported exchange: ${slug}`)

const error = exchangeChecker.cantMonitor(config.watch);
if(error)
  util.die(error, true);

if(config.market.from)
  var fromTs = moment.utc(config.market.from).unix();
else
  var fromTs = moment().startOf('minute').unix();


var Market = function() {

  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  Readable.call(this, {objectMode: true});

  this.reader = new Reader();
  this.latestTs = fromTs;

  setInterval(
    this.get,
    TICKINTERVAL
  );
}

var Readable = require('stream').Readable;
Market.prototype = Object.create(Readable.prototype, {
  constructor: { value: Market }
});

Market.prototype._read = _.once(function() {
  this.get();
});

Market.prototype.get = function() {
  var future = moment().add(1, 'minute').unix();
  this.reader.get(
    this.latestTs,
    future,
    'full',
    this.processCandles
  )
}

var context;
Market.prototype.batchHistoryData = function(rows, i) {
  setTimeout(function timer(){
    let c;
    c = rows[i];
    context.push(c);

    if (i+1 == rows.length) {
      //log.debug('Strategy warmup with history data is complete');
    }
    else {
      context.batchHistoryData(rows, ++i);
    }
  }, 5);
}

Market.prototype.processCandles = function(err, candles) {
  var amount = _.size(candles);
  
  if(amount === 0) {
    // no new candles!
    return;
  }
  log.debug('Leecher, processing new candles: ' + amount);
  
  // TODO:
  // verify that the correct amount of candles was passed:
  //
  // if `this.latestTs` was at 10:00 and we receive 3 candles with the latest at 11:00
  // we know we are missing 57 candles...

  context = this;
  // Pierolalune, 18.02.2021, prepare _.each for lodash upgrade. 
  // thisArgs disappears, can be solved with binding function with this.
  _.each(
    candles, 
    _.bind(
      function(c, i) {
        c.start = moment.unix(c.start).utc();
        this.push(c);
      }, this
    )
  );
  this.batchHistoryData(candles, 0);

  this.latestTs = _.last(candles).start.unix() + 1;
}

module.exports = Market;
