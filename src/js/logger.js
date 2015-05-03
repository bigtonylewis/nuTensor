/*******************************************************************************

    uMatrix - a browser extension to block requests.
    Copyright (C) 2015 Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

/* global µMatrix */

/******************************************************************************/
/******************************************************************************/

µMatrix.logger = (function() {

'use strict';

/******************************************************************************/
/******************************************************************************/

var LogEntry = function(tabId, details, result) {
    this.init(tabId, details, result);
};

/******************************************************************************/

var logEntryFactory = function(tabId, details, result) {
    var entry = logEntryJunkyard.pop();
    if ( entry ) {
        return entry.init(tabId, details, result);
    }
    return new LogEntry(tabId, details, result);
};

var logEntryJunkyard = [];
var logEntryJunkyardMax = 100;

/******************************************************************************/

LogEntry.prototype.init = function(tabId, details, result) {
    this.tstamp = Date.now();
    this.tabId = tabId;
    this.url = details.requestURL;
    this.hostname = details.requestHostname;
    this.type = details.requestType;
    this.result = result;
    return this;
};

/******************************************************************************/

LogEntry.prototype.dispose = function() {
    this.url = this.hostname = this.type = this.result = '';
    if ( logEntryJunkyard.length < logEntryJunkyardMax ) {
        logEntryJunkyard.push(this);
    }
};

/******************************************************************************/
/******************************************************************************/

var LogBuffer = function() {
    this.lastReadTime = 0;
    this.size = 50;
    this.buffer = new Array(this.size);
    this.readPtr = 0;
    this.writePtr = 0;
};

/******************************************************************************/

LogBuffer.prototype.dispose = function() {
    var entry;
    var i = this.buffer.length;
    while ( i-- ) {
        entry = this.buffer[i];
        if ( entry instanceof LogEntry ) {
            entry.dispose();
        }
    }
    this.buffer = null;
    return null;
};

/******************************************************************************/

LogBuffer.prototype.writeOne = function(tabId, details, result) {
    // Reusing log entry = less memory churning
    var entry = this.buffer[this.writePtr];
    if ( entry instanceof LogEntry === false ) {
        this.buffer[this.writePtr] = logEntryFactory(tabId, details, result);
    } else {
        entry.init(tabId, details, result);
    }
    this.writePtr += 1;
    if ( this.writePtr === this.size ) {
        this.writePtr = 0;
    }
    // Grow the buffer between 1.5x-2x the current size
    if ( this.writePtr === this.readPtr ) {
        var toMove = this.buffer.slice(0, this.writePtr);
        var minSize = Math.ceil(this.size * 1.5);
        this.size += toMove.length;
        if ( this.size < minSize ) {
            this.buffer = this.buffer.concat(toMove, new Array(minSize - this.size));
            this.writePtr = this.size;
        } else {
            this.buffer = this.buffer.concat(toMove);
            this.writePtr = 0;
        }
        this.size = this.buffer.length;
    }
};

/******************************************************************************/

LogBuffer.prototype.readAll = function() {
    var out;
    if ( this.readPtr < this.writePtr ) {
        out = this.buffer.slice(this.readPtr, this.writePtr);
    } else if ( this.writePtr < this.readPtr ) {
        out = this.buffer.slice(this.readPtr).concat(this.buffer.slice(0, this.writePtr));
    } else {
        out = [];
    }
    this.readPtr = this.writePtr;
    this.lastReadTime = Date.now();
    return out;
};

/******************************************************************************/
/******************************************************************************/

// Tab id to log buffer instances
var logBuffer = null;

// After 60 seconds without being read, a buffer will be considered unused, and
// thus removed from memory.
var logBufferObsoleteAfter = 60 * 1000;

// The janitor will look for stale log buffer every 2 minutes.
var loggerJanitorPeriod = 2 * 60 * 1000;

/******************************************************************************/

var writeOne = function(tabId, details, result) {
    if ( logBuffer === null ) {
        return;
    }
    logBuffer.writeOne(tabId, details, result);
};

/******************************************************************************/

var readAll = function(tabId) {
    if ( logBuffer === null ) {
        logBuffer = new LogBuffer();
    }
    return logBuffer.readAll();
};

/******************************************************************************/

var loggerJanitor = function() {
    if (
        logBuffer !== null &&
        logBuffer.lastReadTime < (Date.now() - logBufferObsoleteAfter)
    ) {
        logBuffer = logBuffer.dispose();
    }
    setTimeout(loggerJanitor, loggerJanitorPeriod);
};

setTimeout(loggerJanitor, loggerJanitorPeriod);

/******************************************************************************/

return {
    writeOne: writeOne,
    readAll: readAll
};

/******************************************************************************/
/******************************************************************************/

})();

/******************************************************************************/