// ****************************************************************************
// ** A cloud market can be used for realtime paper- and live-trading by pulling
// ** candles from the remote Gekko Cloud server

const _ = require('lodash');
const moment = require('moment');

const util = require('../util');
const dirs = util.dirs();
const config = util.getConfig();
const exchangeChecker = require(dirs.gekko + 'exchange/exchangeChecker');
const slug = config.watch.exchange.toLowerCase();
const exchange = exchangeChecker.getExchangeCapabilities(slug);
const log = require('../log.js');
var Readable = require('stream').Readable;
var myPair = config.watch.asset.toLowerCase() + config.watch.currency.toLowerCase();
var myExchange = config.watch.exchange.toLowerCase();


// ****************************************************************************
// ** check exchange capabilities
if(!exchange)
  util.die(`Unsupported exchange: ${slug}`)

const error = exchangeChecker.cantMonitor(config.watch);
if(error)
  util.die(error, true);


var Market = function(config, plugins) {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());
  Readable.call(this, {objectMode: true});

  var context = this;
  _.each(plugins, function(plugin) {
    if (plugin.meta.slug === 'cloudConnector') {
        plugin.on('remoteCandle', rcandle => {
            if (rcandle.pair == myPair && rcandle.exchange == myExchange) {
              log.info(`Gekko Cloud: pipe candle data from remote market: ${rcandle.exchange}/${rcandle.pair}, ${rcandle.candle.close}`);
              context.push(rcandle.candle);
            }
        });
    }
  });

  log.info('☁ Setting up Cloud market is complete. Start listening to remote candles and deliver them for local strategy execution...');
}


Market.prototype = Object.create(Readable.prototype, {
  constructor: { value: Market }
});


Market.prototype._read = function noop() {}


Market.prototype.processRemoteCandle = function(rcandle) {
    log.debug('Cloud data, processing new local candles: ' + amount);
    this.push(rcandle.candle);
}


module.exports = Market;