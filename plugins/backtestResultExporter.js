// **********************************************************************************
// *** backtestResultExporter.js                                                  ***
// **********************************************************************************
// * Purpose: This plugin listens to candle and indicator event data during
// * backtest mode and writes the data into a json and/or mybacktest.js file. This data
// * can be used to view a backtest in a graphical view (open chart.html file).
// * Since a one year backtest can contain a lot of data, this plugin batches candle
// * data. All candles prior the last 4 weeks are stored in 60min candles. Candle
// * data from last month until last week is stored in 5min candles and the very last
// * week is stored in 1min candles. Keep this in mind when viewing chart.html.
// * Depending on the view range (zoom), the charting component will itself
// * batch the candles into bigger ones. The result is a dynamic view from 1min
// * candles up to 1day candles, depending on your zoom factor.
// * Indicators are displayed 1:1, no data aggregation applies. Keep in mind to
// * adjust the chart zoom factor while viewing, so it matches to your strategy 
// * candle size.
// *
// **********************************************************************************
// * Add the following settings to your config file and adjust as needed:  
/*
config.backtestResultExporter = {
  enabled: true,
  filename: 'logs/myBacktest.json',
  writeToDisk: true,
  data: {
    stratUpdates: false,
    roundtrips: true,
    indicators: true,
    stratCandles: false,
    chartData: true,
    portfolioValues: true,
    trades: true
  }
}
// *
// **********************************************************************************
// * You can export your own indicator data by adding this code to your strategies,
// * it will then be displayed in chart.html automatically.
// * Emit your indicator data everytime your indicator has been updated:

this.emitIndicator({
    name: 'rsi60M',
    start: candle.start.unix(),
    value: obj.rsi60M.result
});
*/


const log = require('../core/log');
const _ = require('lodash');
const util = require('../core/util.js');
const env = util.gekkoEnv();
const config = util.getConfig();
const candleBatcher = require('../core/candleBatcher');
const moment = require('moment');
const fs = require('fs');
var context;


const BacktestResultExporter = function() {
  context = this;
  this.candleCount = 0;
  this.performanceReport;
  this.indicators = {};
  this.roundtrips = [];
  this.stratUpdates = [];
  this.stratCandles = [];
  this.candles1M = [];
  this.candles5M = [];
  this.candles60M = [];
  this.trades = [];

  // batch 60, 5 and 1 min candles
  this.cb60 = new candleBatcher(60);
  this.cb60.on('candle', this.onCandle60M);
  this.cb5 = new candleBatcher(5);
  this.cb5.on('candle', this.onCandle5M);

  this.candleProps = config.backtestResultExporter.data.stratCandleProps;

  if(!config.backtestResultExporter.data.stratUpdates)
    this.processStratUpdate = null;

  if(!config.backtestResultExporter.data.roundtrips)
    this.processRoundtrip = null;

    if(!config.backtestResultExporter.data.indicators)
    this.processIndicator = null;

  if(!config.backtestResultExporter.data.stratCandles)
    this.processStratCandles = null;

  if(!config.backtestResultExporter.data.portfolioValues)
    this.processPortfolioValueChange = null;

  if(!config.backtestResultExporter.data.trades)
    this.processTradeCompleted = null;

  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());
}

BacktestResultExporter.prototype.processPortfolioValueChange = function(portfolio) {
  this.portfolioValue = portfolio.balance;
}


BacktestResultExporter.prototype.onCandle60M = function (candle) {
  let strippedCandle = {
    ...candle,
    start: candle.start.unix()
  }

  context.candles60M.push(strippedCandle);
}


BacktestResultExporter.prototype.onCandle5M = function (candle) {
  let strippedCandle = {
    ...candle,
    start: candle.start.unix()
  }

  context.candles5M.push(strippedCandle);
}


BacktestResultExporter.prototype.processCandle = function(candle, done) {
  //skip warmup candles
  this.candleCount++;
  this.requiredHistory = config.tradingAdvisor.historySize;
  this.intCandleSize = config.tradingAdvisor.candleSize;
  if (this.candleCount < this.requiredHistory * this.intCandleSize) {
    done();
    return;
  }

  let end = candle.start.add(1, 'minute');
  let strippedCandle = {
    ...candle,
    start: candle.start.unix(),
    end: end.format()
  }

  this.candles1M.push(strippedCandle);

  this.cb5.write([candle]);
  this.cb5.flush();
  this.cb60.write([candle]);
  this.cb60.flush();
  done();
};


BacktestResultExporter.prototype.processStratCandle = function(candle) {
  let strippedCandle;

  if(!this.candleProps) {
    strippedCandle = {
      ...candle,
      start: candle.start.unix()
    }
  } else {
    strippedCandle = {
      ..._.pick(candle, this.candleProps),
      start: candle.start.unix()
    }
  }

  if(config.backtestResultExporter.data.portfolioValues)
    strippedCandle.portfolioValue = this.portfolioValue;

  this.stratCandles.push(strippedCandle);
};


BacktestResultExporter.prototype.processIndicator = function(indicator) {
  if (this.indicators[indicator.name] === undefined) {
    this.indicators[indicator.name] = {};
    this.indicators[indicator.name].meta = {
      name: indicator.name,
      lowTreshold: indicator.lowTreshold,
      highTreshold: indicator.highTreshold
    };
    this.indicators[indicator.name].data = [];
  }

  this.indicators[indicator.name].data.push({
    start: indicator.start,
    value: indicator.value
  });
}


BacktestResultExporter.prototype.processRoundtrip = function(roundtrip) {
  this.roundtrips.push({
    ...roundtrip,
    entryAt: roundtrip.entryAt.unix(),
    exitAt: roundtrip.exitAt.unix()
  });
};


BacktestResultExporter.prototype.processTradeCompleted = function(trade) {
  this.trades.push({
    ...trade,
    date: trade.date.unix()
  });
};


BacktestResultExporter.prototype.processStratUpdate = function(stratUpdate) {
  this.stratUpdates.push({
    ...stratUpdate,
    date: stratUpdate.date.unix()
  });
}


BacktestResultExporter.prototype.processPerformanceReport = function(performanceReport) {
  this.performanceReport = performanceReport;
}


BacktestResultExporter.prototype.finalize = function(done) {
  const backtest = {
    market: config.watch,
    strategy: config.tradingAdvisor.method,
    tradingAdvisor: config.tradingAdvisor,
    strategyParameters:  (config.backtestResultExporter.data.strategyParameters === undefined || config.backtestResultExporter.data.strategyParameters === true) ? config[config.tradingAdvisor.method] : null,
    performanceReport: this.performanceReport
  };

  if(config.backtestResultExporter.data.stratUpdates)
    backtest.stratUpdates = this.stratUpdates;

  if(config.backtestResultExporter.data.roundtrips)
    backtest.roundtrips = this.roundtrips;

  if(config.backtestResultExporter.data.stratCandles)
    backtest.stratCandles = this.stratCandles;

  if(config.backtestResultExporter.data.chartData == true || config.backtestResultExporter.data.chartData === undefined) {
    let end = moment(this.performanceReport.endTime);
    let endMinus1Week = (end.subtract(1, 'week')).unix();
    let endMinus1Month = (end.subtract(2, 'week')).unix();
    var chartCandles = [];
    // mix three times frames for progressive chart resolution
    for(let i=0; i<=this.candles60M.length-1; i++) {
      if (this.candles60M[i].start < endMinus1Month) chartCandles.push(this.candles60M[i]);
    }
    for(let i=0; i<=this.candles5M.length-1; i++) {
      if (this.candles5M[i].start >= endMinus1Month && this.candles5M[i].start < endMinus1Week) chartCandles.push(this.candles5M[i]);
    }
    for(let i=0; i<=this.candles1M.length-1; i++) {
      if (this.candles1M[i].start >= endMinus1Week) chartCandles.push(this.candles1M[i]);
    }
    backtest.chartCandles = chartCandles;
  }

  if(config.backtestResultExporter.data.indicators)
    backtest.indicators = this.indicators;

  if(config.backtestResultExporter.data.trades)
    backtest.trades = this.trades;

  if(env === 'child-process') {
    process.send({backtest});
  }

  if(config.backtestResultExporter.writeToDisk) {
    this.writeToDisk(backtest, done);
  } else {
    done();
  }
};


BacktestResultExporter.prototype.writeToDisk = function(backtest, next) {
  let filename;

  if(config.backtestResultExporter.filename) {
    filename = config.backtestResultExporter.filename;
  } else {
    const now = moment().format('YYYY-MM-DD_HH-mm-ss');
    filename = `backtest-${config.tradingAdvisor.method}-${now}.json`;
  }

  var mybacktest = JSON.stringify(backtest, null, 2);

  fs.writeFile(
    util.dirs().gekko + filename,
    mybacktest,
    err => {
      if(err) {
        log.error('unable to write backtest result', err);
      } else {
        log.info('written backtest to: ', util.dirs().gekko + filename);
      }

      //export data for charting component
      if(config.backtestResultExporter.data.chartData == true || config.backtestResultExporter.data.chartData === undefined) {
        fs.writeFile(
          util.dirs().gekko + 'mybacktest.js',
          'var data = ' + mybacktest,
          err => {
            if(err) {
              log.error('unable to write backtest result', err);
            } else {
              log.info('written chart data to: ', util.dirs().gekko + 'mybacktest.js');
              log.info('open chart.html now to view backtest results in your browser');
            }

            next();
          }
        );
      }
      else {
        next();
      }

    }
  );
}


module.exports = BacktestResultExporter;
