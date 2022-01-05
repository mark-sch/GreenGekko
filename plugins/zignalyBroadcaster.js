const axios = require('axios');
const _ = require('lodash');
const qs = require('qs')
const log = require('../core/log.js');
const util = require('../core/util.js');
const config = util.getConfig();

const ZignalyBroadcaster = function() {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  this.advices = [];
  this.schedule();
};

ZignalyBroadcaster.prototype.processAdvice = function(advice) {
  if (advice.recommendation === undefined || advice.recommendation === 'soft') return;
  if (config.trader.enabled === false) return; // live trading signals only, no paper trader
  if (advice.origin === 'telegrambot') return; // do not broadcast manual signals

  this.advices.push(advice);
};

ZignalyBroadcaster.prototype.schedule = function() {
  this.timer = setTimeout(this.broadcast, 5 * 1000);
}

ZignalyBroadcaster.prototype.broadcast = function() {
  const amount = this.advices.length;
  if(!amount) {
    return this.schedule();
  }
  let advice = this.advices[0];
  let data = {
    key: config.zignalyBroadcaster.key,
    market: config.watch.asset + config.watch.currency,
    type: advice.recommendation == 'long' ? 'buy' : 'sell',
    exchange: config.watch.exchange,
    signalId: 'think5',
    MDInfo: advice.infomsg !== undefined ? advice.infomsg : ''
  }

  axios({
    url: 'https://zignaly.com/api/signals.php',
    method: 'post',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: qs.stringify(data)
  })
    .then(r => {
      if(r.data.success === false) {
        log.debug('Failed to broadcast advice to zignaly.com: ' + r.data);
      }
      log.debug('Advice successfully broadcasted to zignaly.com: ' + data.type);
      this.schedule();
    })
    .catch(e => {
      log.debug('zignaly.com broadcast failure:' + e.message);
      this.schedule();
    });

  this.advices = [];
}

ZignalyBroadcaster.prototype.finish = function(next) {
  this.broadcast();
  clearTimeout(this.timer);
}

module.exports = ZignalyBroadcaster;