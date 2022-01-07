const fs = require('fs');
const _ = require('lodash');

const BASEPATH = __dirname + '/../../logs/';

const Logger = function(id) {

  this.fileName = `${id}.log`;

  this.writing = false;
  this.queue = [];

  // Pierolalune, 17.02.2021: Prepare Bind all for lodash upgrade
  // _.bindAll(this);
  _.bindAll(this, _.functionsIn(this).sort());
}

Logger.prototype.write = function(line) {
  if(!this.writing) {
    this.writing = true;
    fs.appendFile(
      BASEPATH + this.fileName,
      line + '\n',
      this.handleWriteCallback
    );
  } else
    this.queue.push(line);
}

Logger.prototype.handleWriteCallback = function(err) {
  if(err)
    console.error(`ERROR WRITING LOG FILE ${this.fileName}:`, err);

  this.writing = false;

  if(_.size(this.queue))
    this.write(this.queue.shift())
}

module.exports = Logger;