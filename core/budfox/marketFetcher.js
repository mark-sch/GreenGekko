//
// The fetcher is responsible for fetching new
// market data at the exchange on interval. It will emit
// the following events:
//
// - `trades batch` - all new trades.
// - `trade` - the most recent trade after every fetch

const _ = require('lodash');
const moment = require('moment');
const utc = moment.utc;
const util = require(__dirname + '/../util');
const dirs = util.dirs();

const config = util.getConfig();
const log = require(dirs.core + 'log');
const exchangeChecker = require(dirs.gekko + 'exchange/exchangeChecker');

const TradeBatcher = require(util.dirs().budfox + 'tradeBatcher');
const obUtil = require(dirs.core + 'orderbookUtil');

const Fetcher = function(config) {
  if(!_.isObject(config))
    throw new Error('TradeFetcher expects a config');

  const exchangeName = config.watch.exchange.toLowerCase();
  const DataProvider = require(util.dirs().gekko + 'exchange/wrappers/' + exchangeName);
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  // Create a public dataProvider object which can retrieve live
  // trade information from an exchange.
  this.exchangeTrader = new DataProvider(config.watch);

  this.exchange = exchangeChecker.settings(config.watch);

  var requiredHistory = config.tradingAdvisor.candleSize * config.tradingAdvisor.historySize;

  // If the trading adviser is enabled we might need a very specific fetch since
  // to line up [local db, trading method, and fetching]
  if(config.tradingAdvisor.enabled && config.tradingAdvisor.firstFetchSince) {
    this.firstSince = config.tradingAdvisor.firstFetchSince;

    if(this.exchange.providesHistory === 'date') {
      this.firstSince = moment.unix(this.firstSince).utc();
    }
  }

  this.batcher = new TradeBatcher(this.exchange.tid);

  this.pair = [
    config.watch.asset,
    config.watch.currency
  ].join('/');

  log.info('Starting to watch the market:',
    this.exchange.name,
    this.pair
  );

  // if the exchange returns an error
  // we will keep on retrying until next
  // scheduled fetch.
  this.tries = 0;
  this.limit = 20; // [TODO]

  this.firstFetch = true;

  this.batcher.on('new batch', this.relayTrades);
}

util.makeEventEmitter(Fetcher);

Fetcher.prototype._fetch = function(since) {
  if(++this.tries >= this.limit)
    return;

  this.exchangeTrader.getTrades(since, this.processTrades, false);
}

Fetcher.prototype.fetch = function() {
  var since = false;
  if(this.firstFetch) {
    since = this.firstSince;
    this.firstFetch = false;
  } else
    since = false;

  this.tries = 0;
  log.debug('Requested', this.pair, 'trade data from', this.exchange.name, '...');
  this._fetch(since);
}

Fetcher.prototype.fetchOB = function() {
  log.debug('Requested', this.pair, 'orderbook data from', this.exchange.name, '...');
  this.exchangeTrader.getOrderbook(this.processOrderbook);
}

Fetcher.prototype.processOrderbook = function(err, ob) {
  if(err || _.isEmpty(ob)) {
    if(err) {
      log.warn(this.exchange.name, 'returned an error while fetching orderbook:', err);
    }
    return;
  }

  let bid = Number(ob.bids[0][0]);
  let ask = Number(ob.asks[0][0]);
  let buySlippage = obUtil.getBuySlippageCurrency(100000, ob);
  let sellSlippage = obUtil.getSellSlippageCurrency(100000, ob);
  let depth = obUtil.depth(ob);

  log.debug('Received orderbook data. bid:', bid,'ask:', ask, 'spread:', (((ask-bid)/ask)*100).toFixed(4) +'%,', 'depth:', depth.sellTotalMio + 'M/' + depth.buyTotalMio + 'M', 'sell/buy slippage 100k:', sellSlippage.mySlippage + '%/' + buySlippage.mySlippage +'% (' + sellSlippage.myPrice + ('/' + buySlippage.myPrice + ')'));
  this.emit('orderbook', ob);
}

Fetcher.prototype.processTrades = function(err, trades) {
  if(err || _.isEmpty(trades)) {
    if(err) {
      log.warn(this.exchange.name, 'returned an error while fetching trades:', err);
      log.debug('refetching...');
    } else
      log.debug('Trade fetch came back empty, refetching...');
    setTimeout(this._fetch, +moment.duration('s', 1));
    return;
  }
  this.batcher.write(trades);
}

Fetcher.prototype.relayTrades = function(batch) {
  this.emit('trades batch', batch);
}

module.exports = Fetcher;
