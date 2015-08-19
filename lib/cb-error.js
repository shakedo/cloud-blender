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
   this.name = this.constructor.name;
   if(msg){
      //if there is a real error and not just a container (used e.g. as a multiError) then this is the stack we want to capture
      Error.captureStackTrace(this, this.constructor);
      this.addNewError(msg, details, id, isFatal, errorCode);
   }
}

util.inherits(CBError, Error);

//private methods
CBError.prototype._appendErrorObj = function(errorObj){
   this.errorList.push(errorObj);
   this.isFatal = this.isFatal || errorObj.isFatal;
   if(this.message){
      this.message += '\n';
   }
   this.message += errorObj.message;
};
//default implementation: should be overridden by each provider specific error
CBError.prototype._createNewErrorObj = function (msg, details, id , isFatal, errorCode) {
   var error = {
      message: msg,
      isFatal: !!isFatal,
      cbErrorCode: errorCode ? errorCode : CBErrorCodes.UNSPECIFIED_ERROR
   };
   if(details) {
      error.details = details;
   }
   if(this.isValidId(id)){
      error.id = id;
   }
   return error;
};

CBError.prototype._getFirstErrorProp = function (prop) {
   if(!this.errorList.length){
      return null;
   }
   else {
      return this.errorList[0][prop];
   }
};

//creates a new error and adds it.
CBError.prototype.addNewError = function (msg, details, id, isFatal, errorCode) {
   //we set the stack trace if its the first error and we are not called from the CBError Constructor.
   //This can happen if we start with an empty error object which is used later to append errors. (multi error)
   if(!this.length && !this.stack){
      Error.captureStackTrace(this, this.addNewError);
   }
   this._appendErrorObj(this._createNewErrorObj(msg, details, id, isFatal, errorCode));
};

/*
CBError.prototype.appendTopErrorOnly = function(errorObj, newId){
   if(!errorObj){
      return;
   }
   if(!this.length && !this.stack){
      Error.captureStackTrace(this, this.appendError);
   }
   var obj = underscore.extend({}, errorObj.errorList[0]);
   if(this.isValidId(newId)){
      obj.id = newId;//override existing id
   }
   this._appendErrorObj(obj);
};
*/
//appends all the errors into the errorObj, and gives a newId (optional)
CBError.prototype.appendError = function(errorObj, newId){
   if(!errorObj){
      return;
   }
   if(!this.length && !this.stack){
      Error.captureStackTrace(this, this.appendError);
   }
   //if this is a regular Error object
   if(!(errorObj instanceof CBError)){
      this.addNewError(errorObj.message, null, newId);
      return;
   }
   errorObj.errorList.forEach(function(error, index){
      var obj = underscore.extend({}, errorObj.errorList[index]);
      if(this.isValidId(newId)){
         //if the error object has more than one id we just number them to avoid multiple ids.
         obj.id = errorObj.isMultiError ? newId + '_' + index : newId;//override existing id
      }
      this._appendErrorObj(obj);
   },this);
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
         return underscore.pluck(this.errorList, 'details');
      }
   }
});

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

Object.defineProperty(CBError.prototype, 'isMultiError', {
   get: function () {
      return this.length > 1;
   }
});

CBError.prototype.getErrorById = function(id){
   return underscore.find(this.errorList, function(errorObj){
      return errorObj.id === id;
   });
};

CBError.prototype.getFirstFatalError = function(){
   return underscore.find(this.errorList, function(errorObj){
      return errorObj.isFatal;
   });
};

CBError.prototype.getAllFatalErrors = function(){
   return underscore.filter(this.errorList, function(errorObj){
      return errorObj.isFatal;
   });
};

CBError.prototype.getCallbackError = function(){
   return this.length > 0 ? this : null;
};

CBError.prototype.isValidId = function(id){
   return !(underscore.isUndefined(id) || underscore.isNull(id));
};

CBError.prototype.isEmpty = function(){
   return this.length === 0;
};

module.exports = exports = CBError;
