var CBError = require('./cb-error'),
   CBErrorCodes = require('./cb-error-codes'),
   underscore = require('underscore'),
   util = require('util');


var awsErrors = {
   AuthFailure: {
      isFatal: true,
      cbError: CBErrorCodes.AUTH_ERROR
   },
   UnauthorizedOperation: {
      isFatal: true,
      cbError: CBErrorCodes.AUTH_ERROR

   },
   Blocked: {
      isFatal: true,
      cbError: CBErrorCodes.ACCOUNT_BLOCKED
   },
   ValidationError : {
      isFatal: true,
      cbError: CBErrorCodes.INVALID_REQUEST
   },
   InvalidAction: {
      isFatal: true,
      cbError: CBErrorCodes.INVALID_REQUEST
   },
   InvalidParameterValue: {
      isFatal: true,
      cbError: CBErrorCodes.INVALID_REQUEST
   },
   InvalidAMIAttributeItemValue: {
      isFatal: true,
      cbError: CBErrorCodes.INVALID_REQUEST
   },
   InvalidParameterCombination: {
      isFatal: true,
      cbError: CBErrorCodes.INVALID_REQUEST
   },
   RequestLimitExceeded: {
      isFatal: true,
      cbError: CBErrorCodes.ACCOUNT_LIMITS_EXCEEDED
   },
   InvalidAMIID: {
      isFatal: true,
      cbError: CBErrorCodes.IMAGE_NOT_FOUND
   },
   InvalidGroup: {
      isFatal: true,
      cbError: CBErrorCodes.RESOURCE_NOT_FOUND
   },
   InvalidKey: {
      isFatal: true,
      cbError: CBErrorCodes.RESOURCE_NOT_FOUND
   },
   InvalidKeyPair:{
      isFatal: true,
      cbError: CBErrorCodes.RESOURCE_NOT_FOUND
   },
   InsufficientInstanceCapacity :{
      isFatal: true,
      cbError: CBErrorCodes.INSUFFICIENT_INSTANCE_CAPACITY
   }
};

//some values of fatalError represent a single error like  AuthFailure or a group of errors in the form InvalidAMIID.XXXX
//so we check for a match of both possiblities
//see http://docs.aws.amazon.com/AWSEC2/latest/APIReference/errors-overview.html
var fatalErrorRegList = (function CreateFatalErrorCodeRegEx(){
   var regList = {};
   underscore.each(awsErrors,function(error, key){
      if(error.isFatal){
         regList[key] = new RegExp('^' + key + '((\\.\\w+)|())$');
      }
   });
   return regList;
})();

function isEC2FatalError(details){
   var errorList,
      result;

   try{
      errorList = details.Response.Errors;
      result =  underscore.some(errorList, function(error){
         var code = error.Error[0].Code[0];
         return underscore.some(fatalErrorRegList, function(regEx){
            return !!(regEx.exec(code));
         })
      });
      return result;
   }
   catch(e){
      return false;
   }
}

function getEc2ErrorProp(details, prop){
   try{
      var err = details.Response.Errors[0].Error[0];
      return err[prop][0];
   }catch(e){
      return undefined;
   }
};

//in iam there are no sub codes, only exact matches
function getIAMErrorProp(details, prop){
   try{
      var err =  details.ErrorResponse.Error[0];
      return err[prop][0];

   }catch(e){
      return undefined;
   }
};

function isEC2Error(details){
   return !!details.Response;
};

function getErrorProp(details, prop){
   if(!details){
      return null;
   }
   if(isEC2Error(details)){
      return getEc2ErrorProp(details, prop);
   }
   else{
      return getIAMErrorProp(details, prop);
   }
}

function isFatalError(details){
   if(!details){
      return false;
   }
   if(isEC2Error(details)){
      return isEC2FatalError(details);
   }
   else{//IAM always returns false for now
      return false;
   }
}

function getCBErrorCode(awsErrorCode){
   try{
      var list = awsErrorCode.split('.');
      return awsErrors[list[0]].cbError;
   }catch(e){
      return undefined;
   }
}

//No need for 2 seperate error classes (IAM and EC2)
//Seems that the difference in the error structure is not deliberate and will be united in the future. We don't really care what type of error this is once we have the code and other data
function AWSError(msg, details, id) {
   CBError.call(this, msg, details,id); //we cannot pass the msg to the constructor of Error , for some reason it wont initialize the message property, we must do it specifically ourseleves
   this._provider = 'aws';
}


util.inherits(AWSError, CBError);

//override implementation:
AWSError.prototype._createNewErrorObj = function (msg, details, id) {
   var error = {
      message: msg,
      isFatal: details ? isFatalError(details) : false
   }
   if(this.isValidId(id)){
      error.id = id;
   }
   if(details){
      error.details = details;
      error.providerErrorCode = getErrorProp(details, 'Code');
      error.providerErrorMessage = getErrorProp(details, 'Message');
      error.cbErrorCode = getCBErrorCode(error.providerErrorCode);
   }
   return error;
};


module.exports = exports = AWSError;