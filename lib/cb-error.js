var util = require('util'),
   underscore = require('underscore');

/**
 * CB error with more details
 * @param msg
 * @param providerDetailsObj
 * @param isFatal
 * @constructor
 */
function CBError(msg, providerDetailsObj, isFatal) {
   Error.call(this); //we cannot pass the msg to the constructor of Error , for some reason it wont initialize the message property, we must do it specifically ourseleves
   Error.captureStackTrace(this, this.constructor);
   this.message = msg || '';
   this.name = this.constructor.name;
   this.isFatal = !!isFatal;
   this.providerDetails = providerDetailsObj;
}

util.inherits(CBError, Error);


/**
 * Multi Error
 * @constructor
 */
function CBMultiError(header) {
   this.header = header;
   this.isFatal = false;
   this.errorMap = {};
};


CBMultiError.prototype.addError = function (id, error) {
   this.errorMap[id] = error;
   this.isFatal = this.isFatal || error.isFatal;
};


Object.defineProperty(CBMultiError.prototype, 'length', {
   get: function () {
      return underscore.size(this.errorMap);
   }
});


exports.CBError = CBError;
exports.CBMultiError = CBMultiError;

