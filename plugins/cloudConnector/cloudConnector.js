const _ = require('lodash');
const log = require('../../core/log.js');
const Connection = require('./connection.js');
var warmupCompleted = false;

const Connector = function(done) {
    // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());
    this.mycon = new Connection();
    this.mycon.registerListener(this.onRemoteCandle, this.onRemoteAdvice, this.onRemoteOrderbook);
    done();
};


// *********************************************************
// *** handle Gekko Cloud events
Connector.prototype.onRemoteCandle = function(remoteCandle) {
    this.emit('remoteCandle', remoteCandle);
};

Connector.prototype.onRemoteAdvice = function (remoteAdvice) {
    if (!warmupCompleted) {
        log.info('Candle warmup is not completed yet, skipping remote advice!');
        return;
    }

    remoteAdvice.advice.direction = remoteAdvice.advice.recommendation;
    this.emit('remoteAdvice', remoteAdvice);
};

Connector.prototype.onRemoteOrderbook = function(remoteOB) {
    this.emit('remoteOrderbook', remoteOB);
};


// *********************************************************
// *** attach to core events
Connector.prototype.processCandle = function(candle, done) {
    this.mycon.publishCandle(candle);
    done();
};


Connector.prototype.processAdvice = function(advice) {
    if (advice.recommendation === 'soft') return;
    if (advice.origin !== undefined && advice.origin === 'telegrambot') return;
    if (advice.recommendation === undefined) return;

    this.mycon.publishAdvice(advice);
};


Connector.prototype.processOrderbook = function(ob) {
    this.mycon.publishOrderbook(ob);
};


Connector.prototype.processStratWarmupCompleted = function(advice) {
    warmupCompleted = true;
}


Connector.prototype.finish = async function(next) {
    await this.mycon.exit();
    next();
}

module.exports = Connector;