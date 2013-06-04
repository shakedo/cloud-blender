module.exports = (function() {

   var that = {
      concatError: function(errorObject, newError) {
         if (errorObject) {
            errorObject.message += '\n' + newError.message + '\n';
         }
         else {
            errorObject = newError;
         }
         return errorObject;
      }
   };

   return that;
})();

