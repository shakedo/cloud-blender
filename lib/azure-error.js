var CBError = require('./cb-error'),
   CBErrorCodes = require('./cb-error-codes'),
   underscore = require('underscore'),
   util = require('util');



//todo , fill this in with all the relevant methods to give more detailed information (see AwsError)
function AzureError(msg, details, id) {
   CBError.call(this, msg, details,id); //we cannot pass the msg to the constructor of Error , for some reason it wont initialize the message property, we must do it specifically ourseleves
   this._provider = 'azure';
}


util.inherits(AzureError, CBError);

module.exports = exports = AzureError;