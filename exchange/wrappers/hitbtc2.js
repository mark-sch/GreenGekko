const Ccxt = require('ccxt');
const ccxtError = require('../node_modules/ccxt/js/base/errors.js');

const deasync = require('deasync');
const Errors = require('../exchangeErrors');
const _ = require('lodash');
const moment = require('moment');
const retry = require('../exchangeUtils').retry;

process.on ('uncaughtException',  e => { console.log (e); process.exit (1) })
process.on ('unhandledRejection', e => { console.log (e); process.exit (1) })

// Helper methods
function joinCurrencies(currencyA, currencyB){
    return currencyA + '/' + currencyB;
}

const Trader = function(config) {
  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());
  if(_.isObject(config)) {
    this.key = config.key;
    this.secret = config.secret;
    this.currency = config.currency;
    this.asset = config.asset;
  }
  this.name = 'HitBTC';
  this.since = null;
  
  this.balance;
  this.price;
  //this.interval = 3000;

  this.pair = [this.asset, this.currency].join('/');
  var exchange = 'hitbtc2';

  this.ccxt = new Ccxt[exchange]({apiKey: this.key, secret: this.secret, uid:this.username, password: this.passphrase});
  this.exchangeName = exchange;
  
  //Prefetch market
  var retFlag = false;
  (async () => {
     try{
        await this.ccxt.loadMarkets();
     }catch(e){
        retFlag = true;
        console.log('error loading markets : ' + this.name + '-' + this.exchangeName , e);
     }
     retFlag = true;
     
     this.market = _.find(Trader.getCapabilities().markets, (p) => {
       return _.first(p.pair) === this.currency && _.last(p.pair) === this.asset;
     });
  }) ();
  deasync.loopWhile(function(){return !retFlag;});
}

const recoverableErrors = [
  'SOCKETTIMEDOUT',
  'TIMEDOUT',
  'CONNRESET',
  'CONNREFUSED',
  'NOTFOUND',
  'API:Rate limit exceeded',
  'Service:Unavailable',
  'Request timed out',
  'Response code 5',
  'Empty response'
];

const includes = (str, list) => {
  if(!_.isString(str))
    return false;

  return _.some(list, item => str.includes(item));
}


/** CCXT Error
ExchangeError -> Retry
NotSupported -> Abort
AuthenticationError -> Abort
InvalidNonce -> Retry
InsufficientFunds -> Retry
InvalidOrder -> Abort
OrderNotFound -> Abort                                                                             
OrderNotCached -> Abort
CancelPending -> Abort
NetworkError -> Retry
DDoSProtection -> Retry
RequestTimeout -> Retry
ExchangeNotAvailable-> Retry
*/

Trader.prototype.processError = function(funcName, error) {
  if (!error) return undefined;

  //Handle error here
  if(error instanceof ccxtError.ExchangeError       ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an error, retrying: ${error.message}`);
    return new Errors.RetryError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.NotSupported        ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an irrecoverable error: ${error.message}`);
    return new Errors.AbortError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.AuthenticationError ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an irrecoverable error: ${error.message}`);
    return new Errors.AbortError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.InvalidNonce        ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an error, retrying: ${error.message}`);
    return new Errors.RetryError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.InsufficientFunds   ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an error, retrying: ${error.message}`);
    return new Errors.RetryError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.InvalidOrder        ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an irrecoverable error: ${error.message}`);
    return new Errors.AbortError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.OrderNotFound       ){  
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an irrecoverable error: ${error.message}`);
    return new Errors.AbortError('[ccxt-'+ this.exchangeName + '] ' + error.message);  																   
  }else if(error instanceof ccxtError.OrderNotCached      ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an irrecoverable error: ${error.message}`);
    return new Errors.AbortError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.CancelPending       ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an irrecoverable error: ${error.message}`);
    return new Errors.AbortError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.NetworkError        ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an error, retrying: ${error.message}`);
    return new Errors.RetryError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.DDoSProtection      ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an error, retrying: ${error.message}`);
    return new Errors.RetryError('[ccxt-'+ this.exchangeName + '] ' + error.message); 	
  }else if(error instanceof ccxtError.RequestTimeout      ){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an error, retrying: ${error.message}`);
    return new Errors.RetryError('[ccxt-'+ this.exchangeName + '] ' + error.message);  	
  }else if(error instanceof ccxtError.ExchangeNotAvailable){
    console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an error, retrying: ${error.message}`);
    return new Errors.RetryError('[ccxt-'+ this.exchangeName + '] ' + error.message);    
  }else{
	console.log(`[ccxt-${this.exchangeName}] (${funcName}) returned an irrecoverable error: ${error.message}`);
	return new Errors.AbortError('[ccxt-'+ this.exchangeName + '] ' + error.message);
  }
};


Trader.prototype.handleResponse = function(funcName, callback) {
  return (error, body) => {
    if(error) {
      if(_.isString(error) && error.message == 'Order not found') {
        //order was canceled already and can not be found
        error = null;
      }
    }

    return callback(this.processError(funcName, error), body);
  }
};


Trader.prototype.getTrades = function(since, callback, descending) {
  var firstFetch = !!since;
  var processAttempt = function(ccxt, pair, since, cb) {
     
     (async () => {
	   try{
		   var data = await ccxt.fetchTrades(pair, since);
		   cb(undefined, data);
       }catch(e){
	      cb(e);
       }
     }) ();
  };
  
  var processResult = function (err, data){
    if(err) return callback(err);

	var result = _.map(data, function(trade) {
	     var uid;
	     //Exchange don't always return id
	     if(_.isUndefined(trade.id)){
			uid = trade.timestamp;
	     }else{
			uid = trade.id;
	     }
	     
	     return {
			tid: uid,
			amount: +trade.amount,
			date: moment.utc(trade.datetime).unix(),
			price: +trade.price
	     };
	});
	var retValue = undefined;
	if(result.length > 1){
	  for (let index = 0; index < result.length-1; ++index) {
		 if(result[index]['tid'] != result[index+1]['tid']){
			retValue = (result[index]['tid'] > result[index+1]['tid'] ? result.reverse() : result);
			break;
		 }
	  }
	}
	if(_.isUndefined(retValue)){
	  retValue = result; //There is only one trade or one timestamp
	}
	callback(null, retValue);
  };	
  
  let handler = (cb) => processAttempt(this.ccxt, this.pair, since, this.handleResponse('getTrades', cb));
  //util.retryCustom(retryForever, _.bind(handler, this), _.bind(processResult, this));  	
  retry(null, _.bind(handler, this), _.bind(processResult, this));
}


Trader.prototype.getPortfolio = function(callback) {

  var processAttempt = function(ccxt, cb) {
     
     (async () => {
       try{
          data = await ccxt.fetchBalance();
          cb(undefined, data);  
       }catch(e){
		  console.log(e);
          cb(e);
       }
	 }) ();
  };
  
  var processResult = function (err, data){
	 if(err) return callback(err);

	 var assetAmount = data[this.asset]['free'];
	 var currencyAmount = data[this.currency]['free'];
     
	 if(!_.isNumber(assetAmount) || _.isNaN(assetAmount)) {
       console.log(`[ccxt-${this.exchangeName}] did not return portfolio for ${this.asset}, assuming 0.`);
       assetAmount = 0;
     }

     if(!_.isNumber(currencyAmount) || _.isNaN(currencyAmount)) {
       console.log(`[ccxt-${this.exchangeName}] did not return portfolio for ${this.currency}, assuming 0.`);
       currencyAmount = 0;
     }
     
	 var portfolio = [
	 { name: this.asset, amount: assetAmount },
	 { name: this.currency, amount: currencyAmount }
	 ];
     
	 console.log('[ccxt-' + this.exchangeName + '] (getPortfolio) portfolio:', portfolio);
	 callback(undefined, portfolio);     
  };
  
  let handler = (cb) => processAttempt(this.ccxt, this.handleResponse('getPortfolio', cb));
  retry(null, _.bind(handler, this), _.bind(processResult, this));  
}


Trader.prototype.getFee = function(callback) {
   //getFee is WIP ccxt side 
   //See https://github.com/ccxt/ccxt/issues/640
   /*
   try {
      var fee = parseFloat(this.ccxt.markets[this.pair]['maker']);
      if(!_.isNumber(fee) || _.isNaN(fee)){
         fee = 0; //default
      }
   } catch(e){
      var fee = 0; //default
   }
   */
   var fee = 0;
   callback(undefined, fee);
}


Trader.prototype.getTicker = function(callback) {
  var processAttempt = function(ccxt, pair, cb) {
	  
     (async () => {
       try{
          data = await ccxt.fetchTicker(pair);
	      cb(undefined, data);
       }catch(e){
		    console.log(e);
	      cb(e);
       }
	 }) ();
  }
  
  var processResult = function (err, data){
	 if(err) return callback(err);
	 
   //console.log('ask', parseFloat(data['ask']), 'bid', parseFloat(data['bid']));
	 //console.log('[ccxt-' + this.exchangeName + '] (getTicker) ask', parseFloat(data['ask']), 'bid', parseFloat(data['bid']));
   callback(undefined, {
     bid: parseFloat(data['bid']),
     ask: parseFloat(data['ask']),
   });
  }
  
  let handler = (cb) => processAttempt(this.ccxt, this.pair, this.handleResponse('getTicker', cb));
  retry(null, _.bind(handler, this), _.bind(processResult, this));
}


// Effectively counts the number of decimal places, so 0.001 or 0.234 results in 3
Trader.prototype.getPrecision = function(tickSize) {
  if (!isFinite(tickSize)) return 0;
  var e = 1, p = 0;
  while (Math.round(tickSize * e) / e !== tickSize) { e *= 10; p++; }
  return p;
};


Trader.prototype.round = function(amount, tickSize) {
  var precision = 100000000;
  var t = this.getPrecision(tickSize);

  if(Number.isInteger(t))
    precision = Math.pow(10, t);

  amount *= precision;
  amount = Math.floor(amount);
  amount /= precision;

  // https://gist.github.com/jiggzson/b5f489af9ad931e3d186
  amount = this.scientificToDecimal(amount);

  return amount;
};


// https://gist.github.com/jiggzson/b5f489af9ad931e3d186
Trader.prototype.scientificToDecimal = function(num) {
  if(/\d+\.?\d*e[\+\-]*\d+/i.test(num)) {
    const zero = '0';
    const parts = String(num).toLowerCase().split('e'); // split into coeff and exponent
    const e = parts.pop(); // store the exponential part
    const l = Math.abs(e); // get the number of zeros
    const sign = e/l;
    const coeff_array = parts[0].split('.');
    if(sign === -1) {
      num = zero + '.' + new Array(l).join(zero) + coeff_array.join('');
    } else {
      const dec = coeff_array[1];
      if(dec) {
        l = l - dec.length;
      }
      num = coeff_array.join('') + new Array(l+1).join(zero);
    }
  } else {
    // make sure we always cast to string
    num = num + '';
  }

  return num;
}


Trader.prototype.roundAmount = function(amount) {
  return this.round(amount, this.market.minimalOrder.amount);
}


Trader.prototype.roundPrice = function(price) {
  //return this.round(price, this.market.minimalOrder.price);
  var roundPrice;
    try{
      roundPrice = ccxt.priceToPrecision(this.pair, price);
    }catch(e){
      roundPrice = price;
    }
  console.log(roundPrice);
    return roundPrice;
}


//addOrder buy
Trader.prototype.buy = function(amount, price, callback) {

   var processAttempt = function(ccxt, roundAmount, roundPrice, pair, cb) {
     
     (async () => {          
        try{
          data = await ccxt.createLimitBuyOrder (pair, roundAmount, roundPrice);
          cb(undefined, data);
        }
        catch(e){
          console.log(e);
          cb(e);
        }
     }) ();
  };
  
  var processResult = function (err, data){
    if(err) return callback(err);
    
    var txid = data['id'];
    console.log('[ccxt-' + this.exchangeName + '] (buy) added order with txid:', txid);

    callback(undefined, txid);
  };	  
	  
  let handler = (cb) => processAttempt(this.ccxt, amount, price, this.pair, this.handleResponse('buy', cb));
  retry(null, _.bind(handler, this), _.bind(processResult, this));
}


Trader.prototype.sell = function(amount, price, callback) {
   var processAttempt = function(ccxt, roundAmount, roundPrice, pair, cb) {
     (async () => {
        try{
          data = await ccxt.createLimitSellOrder (pair, roundAmount, roundPrice);
          cb(undefined, data);
          }catch(e){
          console.log(e);
            cb(e);
          }
     }) ();
  };
  
  var processResult = function (err, data){
  if(err) return callback(err);
    
  var txid = data['id'];
	if(_.isUndefined(txid))
		txid = 0; //Order id is undefined, assuming order is already filled. See https://github.com/ccxt/ccxt/issues/660
    console.log('[ccxt-' + this.exchangeName + '] (sell) added order with txid:', txid);

    callback(undefined, txid);
  };	  
	  
  let handler = (cb) => processAttempt(this.ccxt, amount, price, this.pair, this.handleResponse('sell', cb));
  //util.retryCustom(retryCritical, _.bind(handler, this), _.bind(processResult, this));
  retry(null, _.bind(handler, this), _.bind(processResult, this));
}


Trader.prototype.getOrder = function(order, callback) {
  var processAttempt = function(ccxt, pair, id, cb) {
     
     (async () => {
	   try{
		   if(ccxt['has']['fetchMyTrades'] === true){
			   var orders = await ccxt.fetchMyTrades(pair);
			   for (let i = 0; i < orders.length; i++) {
					if (orders[i]['id'] == id){
						cb(undefined, orders[i]);
					}
				}
				cb(undefined, {'timestamp':0, 'price':0, 'amount':0});	//If no order found, assuming already cancelled or filled.
		   }else{
			   var order = await ccxt.fetchOrder(id, pair);
			   cb(undefined, order);
		   }		   
       }catch(e){
		  console.log(e);
		  if(e instanceof ccxtError.OrderNotCached)
			cb(undefined, {'timestamp':0, 'price':0, 'amount':0});	//If no order found, assuming already cancelled or filled.
		  else
			cb(e);	      
       }
     }) ();
  };
  
  var processResult = function (err, data){
    if(err) return callback(err);
	
	console.log('[ccxt-' + this.exchangeName + '] (getOrder) result', data);
	var date = moment(data['timestamp']);
    var price = data['price'];
    var amount = data['amount'];
    
    callback(undefined, {price, amount, date});	
  };	  
	  
  let handler = (cb) => processAttempt(this.ccxt, this.pair, order, this.handleResponse('getOrder', cb));
  retry(null, _.bind(handler, this), _.bind(processResult, this)); 	
}


Trader.prototype.checkOrder = function(order, callback) {
   var processAttempt = function(ccxt, order, pair, cb) {
     
     (async () => {
	   try{
		   var data = await ccxt.fetchOrder(order, pair);
		   cb(undefined, data);
       }catch(e){
		  console.log(e);
		  if(e instanceof ccxtError.OrderNotCached)
			cb(undefined, {'status':'closed'});	//If no order found, then order is cancelled or filled.
		  else{
			cb(e);
		  }	      
       }
     }) ();
  };
  
  var processResult = function (err, data){
    if(err) return callback(err);
	
	  console.log('[ccxt-' + this.exchangeName + '] (checkOrder) result', data);
    callback(undefined, {
      executed: data['amount'] === data['filled'],
      open: data['status'] === 'open',
      filledAmount: +data['filled']
    });
  };

  let handler = (cb) => processAttempt(this.ccxt, order, this.pair, this.handleResponse('checkOrder', cb));
  retry(null, _.bind(handler, this), _.bind(processResult, this));
}


Trader.prototype.cancelOrder = function(order, callback) {
  var processAttempt = function(ccxt, order, cb) {
     
     (async () => {
      try {
        var data = await ccxt.cancelOrder(order);
        console.log(data);
        cb(undefined, false, data);
      } catch(e){
        console.log(e);
        if(e instanceof ccxtError.OrderNotFound || e.message.indexOf('NO DATA WAS RETURNED') > -1)
          cb(undefined, true, data);	//If no order found, then order is cancelled or filled.
        else{
          console.log('Attention!! Err on cancelOrder');
          cb(e);
        }  	  
      }
    }) ();
  };
  
  var processResult = function (err, bol, data){
	  if(err) {
      console.log('Error happened on cancelOrder');
		  return callback(err);
    }

	  //console.log('[ccxt-' + this.exchangeName + '] (cancelOrder) result', data);
    callback(undefined, bol, data);	
  };	
  
  let handler = (cb) => processAttempt(this.ccxt, order, this.handleResponse('cancelOrder', cb));
  retry(null, handler, processResult);
}


//Dynamic getCapabilities - takes a while
Trader.getCapabilities = function () {
    var ccxtSlug = 'hitbtc2';
    var retFlag = false;
                                      
    if(_.isUndefined(ccxtSlug)){
       var ret = [];
       var ccxtExchanges = Ccxt.exchanges;
       for (var i = 0; i < ccxtExchanges.length; i++) {
          exchange = ccxtExchanges[i];
          let Trader = null;
          try {
            Trader = new Ccxt[exchange]();
          } catch (e) {
            console.log(e); 
            return;
          }
          
          var trader = Trader.describe();
          var capabilities = [];
          
          var arrPair = [];
          var arrAssets = [];
          var arrCurrencies = []
          var markets = null;
          
          if(Trader.hasPublicAPI){ //solve _1broker issue (don't have public API and atm API key is not entered).
             retFlag = false;
             (async () => {
                try{
                   markets = await Trader.loadMarkets();
                   console.log(trader.id + ' is load');
                }catch(e){
                   console.log('error loading : ' + trader.id);
                }
                retFlag = true;
             }) ();
             deasync.loopWhile(function(){return !retFlag;});
             arrPair = [];
             if(markets !== null){
                _.each(markets, market => {  
                   try{
                      var amountMin = market.limits.amount.min;
                   }catch(e){
                      var amountMin = 1e8;
                   }
                   arrPair.push({pair: [market.quote, market.base], minimalOrder: { amount: amountMin, unit: 'asset'}});  
                   if(arrAssets.toString().search(market.base) == -1){
                      arrAssets.push(market.base);
                   }
                   if(arrCurrencies.toString().search(market.quote) == -1){
                      arrCurrencies.push(market.quote);
                   }
                                         
                });
             }
          }
          if(markets !== null){
             capabilities = {
                name : trader.id, 
                slug: trader.id,
                currencies: arrCurrencies.sort(),
                assets: arrAssets.sort(),
                markets: arrPair.sort(function(a,b){
                   var sortTest = a.pair[0].localeCompare(b.pair[0]);
                   if (sortTest != 0){
                      return sortTest;
                   }else{
                      return a.pair[1].localeCompare(b.pair[1]);
                   }
                }),
                requires: ['key', 'secret'],
                tid: 'tid',
                providesHistory: 'date',
                providesFullHistory: Trader.fetchTrades ? true : false,
                tradable: Trader.hasPrivateAPI ? true : false,
                gekkoBroker: 0.6,
             };
             ret.push(capabilities);
          }
       }

       return ret;
    }else{
       let Trader = null;
       try {
         Trader = new Ccxt[ccxtSlug]();
       } catch (e) {
         console.log(e); 
         return;
       }
       
       var trader = Trader.describe();
       var capabilities = [];
       
       var arrPair = [];
       var arrAssets = [];
       var arrCurrencies = []
       var markets = null;
       
       if(Trader.hasPublicAPI){ //solve _1broker issue (don't have public API and atm API key is not entered).
          retFlag = false;
          (async () => {
             try{
                markets = await Trader.loadMarkets();
             }catch(e){
                return retry(null, this.getCapabilities, null);
                //retry(null, _.bind(handler, this), _.bind(processResult, this));
             }
             retFlag = true;
          }) ();
          deasync.loopWhile(function(){return !retFlag;});
          arrPair = [];
          if(markets !== null){
             _.each(markets, market => {  
                try{
                   var amountMin = market.limits.amount.min;
                }catch(e){
                   var amountMin = 1e8;
                }
                arrPair.push({pair: [market.quote, market.base], minimalOrder: { amount: amountMin, unit: 'asset'}});  
                if(arrAssets.toString().search(market.base) == -1){
                   arrAssets.push(market.base);
                }
                if(arrCurrencies.toString().search(market.quote) == -1){
                   arrCurrencies.push(market.quote);
                }
                                      
             });
          }
       }
       if(markets !== null){
          capabilities = {
             name : trader.id, 
             slug: 'hitbtc2',
             currencies: arrCurrencies.sort(),
             assets: arrAssets.sort(),
             markets: arrPair.sort(function(a,b){
                var sortTest = a.pair[0].localeCompare(b.pair[0]);
                if (sortTest != 0){
                   return sortTest;
                }else{
                   return a.pair[1].localeCompare(b.pair[1]);
                }
             }),
             requires: ['key', 'secret'],
             tid: 'tid',
             providesHistory: 'date',
             providesFullHistory: Trader.fetchTrades ? true : false,
             tradable: Trader.hasPrivateAPI ? true : false,
             gekkoBroker: 0.6,  
          };
       };

       return capabilities;
    }
}


module.exports = Trader;
