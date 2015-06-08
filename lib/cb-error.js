var util = require('util'),
   CBErrorCodes = require('./cb-error-codes'),
   underscore = require('underscore');

/**
 * Error Object that acts as single or multiple error
 * @param msg
 * @param details
 * @param isFatal
 * @param id
 * @constructor
 */
function CBError(msg, details, id, isFatal, errorCode) {
   Error.call(this); //we cannot pass the msg to the constructor of Error , for some reason it wont initialize the message property, we must do it specifically ourseleves
   this.message = '';
   this.errorList = [];
   if(msg){
      Error.captureStackTrace(this, this.constructor);
      this.appendError(msg, details, id, isFatal, errorCode);
   }
}

util.inherits(CBError, Error);

CBError.prototype.appendError = function (msg, details, id, isFatal, errorCode) {
   //we set the stack trace if its the first error and we are not called from the CBError Constructor.
   //This can happen if we start with an empty error object which is used later to append errors. (multi error)
   if(!this.length && !this.stack){
      Error.captureStackTrace(this, this.appendError);
   }
   this._appendErrorObj(this._createNewErrorObj(msg, details, id, isFatal, errorCode));
};


CBError.prototype.appendErrorObj = function(errorObj, id){
   if(!this.length && !this.stack){
      Error.captureStackTrace(this, this.appendErrorObj);
   }
   this._appendErrorObj(underscore.extend({}, errorObj.errorList[0], {id: id}));
};

CBError.prototype._appendErrorObj = function(errorObj){
   this.errorList.push(errorObj);
   this.isFatal = this.isFatal || errorObj.isFatal;
   if(this.message){
      this.message += '\n';
   }
   this.message += errorObj.message;
};
//default implementation: should be overrriden by each provider specific error
CBError.prototype._createNewErrorObj = function (msg, details, id , isFatal, errorCode) {
   return {
      message: msg,
      details: details,
      id: id,
      isFatal: isFatal,
      cbErrorCode: errorCode ? errorCode : CBErrorCodes.UNSPECIFIED_ERROR
   }
};

Object.defineProperty(CBError.prototype, 'length', {
   get: function () {
      return this.errorList.length;
   }
});

Object.defineProperty(CBError.prototype, 'provider', {
   get: function () {
      return this._provider;
   }
});

Object.defineProperty(CBError.prototype, 'details', {
   get: function () {
      if(!this.errorList.length){
         return null;
      }
      else if(this.errorList.length === 1){
         return this.errorList[0].details;
      }
      else{
         //todo , is this useful when we have more than 1 error
         return underscore.pluck(this.errorList, 'details');
      }
   }
});

CBError.prototype._getFirstErrorProp = function (prop) {
   if(!this.errorList.length){
      return null;
   }
   else {
      return this.errorList[0][prop];
   }
};
Object.defineProperty(CBError.prototype, 'cbErrorCode', {
   get: function () {
      return this._getFirstErrorProp('cbErrorCode');
   }
});

Object.defineProperty(CBError.prototype, 'providerErrorCode', {
   get: function () {
      return this._getFirstErrorProp('providerErrorCode');
   }
});

Object.defineProperty(CBError.prototype, 'providerErrorMessage', {
   get: function () {
      return this._getFirstErrorProp('providerErrorMessage');
   }
});

CBError.prototype.getErrorById = function(id){
   return underscore.find(this.errorList, function(errorObj){
      return errorObj.id === id;
   })
};

CBError.prototype.getCallbackError = function(){
   return this.length > 0 ? this : null;
}

module.exports = exports = CBError;

