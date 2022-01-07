var _ = require('lodash');

var Reader = function(mydb) {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());
}

// returns the furthest point (up to `from`) in time we have valid data from
Reader.prototype.mostRecentWindow = function(from, to, next) {
  return next(false);
}

Reader.prototype.tableExists = function (name, next) {
  next();
}

Reader.prototype.get = function(from, to, what, next, mytable) {
  next();
}

Reader.prototype.count = function(from, to, next) {
  next(); 
}

Reader.prototype.close = function() {

}

module.exports = Reader;
