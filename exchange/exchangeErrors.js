const _ = require('lodash');

const ExchangeError = function(message) {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  this.name = "ExchangeError";
  this.message = message;
}
ExchangeError.prototype = new Error();

const ExchangeAuthenticationError = function(message) {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  this.name = "ExchangeAuthenticationError";
  this.message = message;
}
ExchangeAuthenticationError.prototype = new Error();

const RetryError = function(message) {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  this.name = "RetryError";
  this.retry = 5;
  this.message = message;
}
RetryError.prototype = new Error();

const AbortError = function(message) {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());

  this.name = "AbortError";
  this.message = message;
}
AbortError.prototype = new Error();

module.exports = {
  ExchangeError,
  ExchangeAuthenticationError,
  RetryError,
  AbortError
};

