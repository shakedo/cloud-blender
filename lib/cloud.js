
// The following ifs are for preventing crash in azure.js if the env is not defined
// here.
if (!process.env.AZURE_STORAGE_ACCESS_KEY) {
   process.env.AZURE_STORAGE_ACCESS_KEY = '1234';
}
if (!process.env.AZURE_STORAGE_ACCOUNT) {
   process.env.AZURE_STORAGE_ACCOUNT = '1234';
}

var underscore = require('underscore'),
   errorHandler = require('./error_handler.js'),
   hpcs = require('./hpcs_compute.js'),
   aws = require('./aws_ec2.js'),
   hpcs_13_5 = require('./hpcs_compute_13_5.js'),
   azure = require('./azure.js'),
   onprem = require('./on_prem.js'),
   cloudProviders = {
      'hpcs': hpcs,
      'aws': aws,
      'hpcs_13_5': hpcs_13_5,
      'azure': azure,
      'onprem': onprem
   };

// This module implements the high level functionality.
module.exports = (function() {

   // internal functions
   // ------------------

   // This function polls the cloud until the given list of nodes are active.
   // we have 3 lists:
   // queryNodesList - contains names but may not contain addresses
   // errorNodesList - contains names of status error list
   // tenantNodesList - the result of the listNodes call (does not contain names)
   //                   but on status ACTIVE should contain addresses.
   function triggerWhenNodesActive(pollingIntervalMS, pollingCount,
                                   settings, queryNodesList, errorNodes, callback) {

      var cloud = cloudProviders[settings.regionContext.providerName];

      // This condition can only be true if the user used pollingCount = 0 directly 
      // from the first call - the real recursion stop condition for polling limit 
      // happens later in the code (or back in the callstack-callback)
      // - when we have result to return to the user
      if (pollingCount === 0) {
         callback(new Error ('Error: polling exceeds pollingCount limit'),
            queryNodesList.concat(errorNodes));
         return;
      }

      // This can happen in 2 cases:
      // when we started with empty list (if all nodes were not up correctly).
      // if during to polling some good nodes became bad (and we assume 
      // that these nodes are now in the errorNodes
      if (queryNodesList.length === 0) {
         callback(new Error('Error: No nodes to poll'), errorNodes);
         return;
      }

      cloud.listNodes(settings, function(error, result) {
         if (error) {
            setTimeout(triggerWhenNodesActive, pollingIntervalMS, pollingIntervalMS, pollingCount - 1, settings, queryNodesList, errorNodes, callback);
            return;
         }

         var i,
            tenantNodesList = result.nodes,
            foundNonActive = false,
            queryNodesLength,
            tenantNodes = {},
            tenantNode,
            errorObject,
            tags;

         // create a hash from the tenant nodes
         underscore.each(tenantNodesList, function(node) {
            tenantNodes[node.id] = node;
         });

         for (i = 0, queryNodesLength = queryNodesList.length;
              i < queryNodesLength; i++) {
            var errorMessage = 'Error: found a new error for ';
            tenantNode = tenantNodes[queryNodesList[i].id];

            if (!tenantNode || tenantNode.status === undefined ||
               (tenantNode.status.indexOf('ERROR') === 0)) {

               errorMessage += JSON.stringify(queryNodesList[i]);
               if (tenantNode) {
                  errorMessage += ', tenant node is: ' + JSON.stringify(tenantNode);
                  queryNodesList[i].status = tenantNode.status ? tenantNode.status : 'ERROR_status_undefined';
               }
               else {
                  errorMessage += ' list nodes could not found this node in the cloud. This caused a bug in the polling process';
                  queryNodesList[i].status = 'ERROR_no_longer_found';
               }
               errorObject = errorHandler.concatError(errorObject, new Error(errorMessage));
               errorNodes.push(queryNodesList[i]);
               queryNodesList.splice(i,1);
               i--;
               queryNodesLength--;
               continue;
            }
            else if (tenantNode.status === 'ACTIVE') {
               // to fill the latest status of this node
               // including the name which can only obtained from create call
               tags = queryNodesList[i].tags;
               queryNodesList[i] = tenantNode;
               queryNodesList[i].tags = tags;
            }
            // if its active or error-reason - it finished to launch them
            else{
               // don't return here
               // we need to check for polling timeout
               foundNonActive = true;
               break;
            }

         } // for

         if (pollingCount === 1 && foundNonActive === true) {
            errorObject = errorHandler.concatError(errorObject, new Error('polling exceeds pollingCount limit'));
            // we shouldn't continue to ssh polling or to a new level of recursion
            callback(errorObject, queryNodesList.concat(errorNodes));
            return;
         }

         if (foundNonActive === false) {
            // this is where successful call is ended
            // in case you wondered :-)
            if (!errorObject && errorNodes.length > 0) {
               errorObject = new Error('some of the machines failed to load');
            }

            callback(errorObject, queryNodesList.concat(errorNodes));
         }
         else { // we need to continue the polling since we found non active
            setTimeout(triggerWhenNodesActive, pollingIntervalMS, pollingIntervalMS, pollingCount - 1, settings, queryNodesList, errorNodes, callback);
         }
      });
   }

   function triggerWhenNodesDeleted(pollingIntervalMS, pollingCount, settings, nodes, callback) {

      var cloud = cloudProviders[settings.regionContext.providerName];
      if (nodes.length === 0) {
         callback(new Error('Error: No nodes to poll'));
         return;
      }
      if (pollingCount === 0) {
         callback(new Error('Error: polling exceeds polling count limit'));
         return;
      }

      cloud.listNodes(settings, function(error, result) {

         var foundNodeId,
            tenantNodesList = result.nodes;

         foundNodeId = underscore.find(nodes, function(currNode) {
            var tenantNode;
            tenantNode = underscore.find(tenantNodesList, function (node) {
               if (node.id === currNode.id) {
                  return true;
               }
               return false;
            });
            if (tenantNode !== undefined) {
               return true;
            }
            return false;
         });
         if (foundNodeId === undefined) {
            callback(undefined, 'done');
            return;
         }

         setTimeout(triggerWhenNodesDeleted, pollingIntervalMS, pollingIntervalMS, pollingCount - 1, settings, nodes, callback);
      });
   }

   function triggerWhenImageActive(settings, imageId, pollingCount, pollingInterval, callback) {

      var cloud = cloudProviders[settings.regionContext.providerName];
      cloud.listImages(settings, function(errorList, result) {

         var imagesData = result.images,
            imageData;

         if (errorList) {
            callback(errorList);
            return;
         }

         imageData = underscore.find(imagesData, function(item) {
            return item.id === imageId;
         });

//         console.log('after retrieving image' + JSON.stringify(imageData, null, '   '));
         if (imageData === undefined) {
            callback(new Error('can not find created image when polling'));
            return;
         }

         if (pollingCount === 0) {
            callback(new Error('polling exceeds calls limit'));
            return;
         }

         if (imageData.status !== 'ACTIVE') {
            setTimeout(triggerWhenImageActive, pollingInterval, settings,
               imageId, pollingCount - 1, pollingInterval, callback);
         }
         else {
            callback(undefined);
         }
      });
   }

   function setIntervalWithStop(callback, timeout, numberOfTimes){
      var intervalId;
      if(numberOfTimes <= 0){
         return;
      }
      intervalId = setInterval(function(){
         callback();
         numberOfTimes--;
         if(numberOfTimes === 0){
            clearInterval(intervalId);
         }
      }, timeout);
   }

   function callApiForEachImage(apiMethod, settings, callback ){
      var limits = settings.regionContext.limits,
         postRate = (limits &&
         limits.postRatePerMinute)?limits.postRatePerMinute:20,
         interval = Math.ceil(60.0/postRate)*1000,
         imageIds = underscore.isArray(settings.imageIds) ? settings.imageIds : [settings.imageIds],
         currentImageIdx = 0,
         completedCalls = 0,
         errorObject,
         results = [],
         imageCount;

      imageCount = imageIds.length;

      function apiCallback(error, result) {
         completedCalls++;
         results.push(result.rawResult);
         if (error) {
            errorObject = errorHandler.concatError(errorObject, error);
         }
         if (completedCalls === imageCount) {
            callback(errorObject, results);
         }
      }
      setIntervalWithStop(function(){
         settings.imageId = settings.imageIds[currentImageIdx];
         apiMethod(settings, apiCallback);
         currentImageIdx++;
      }, interval, imageCount);

   }

   var that = {

      // setting proxy to use
      setProxy: function(proxyUrl) {

         underscore.each(cloudProviders, function(cloudProvider) {
            cloudProvider.setProxy(proxyUrl);
         });
      },

      // expose providers to allow external customization
      getCloudProviders: function() {
         return cloudProviders;
      },

      createRegionContext: function(provider, regionSettings, limitsSettings,cfg) {
         var cloud = cloudProviders[provider];
         return cloud.createRegionContext(regionSettings, limitsSettings,cfg);
      },

      // This function creates a list of nodes on the given cloud provider.
      // It calls the callback when all the nods are ready to use.
      // This is achieved by activating a polling process in the end
      // of the configuration process (after launching all conf commands
      // on the cloud).
      createNodes: function(settings, callback) {

         var cloud = cloudProviders[settings.regionContext.providerName],
            limits = settings.regionContext.limits,
            pollingCount = settings.regionContext.pollingCount,
            postRate = (limits &&
            limits.postRatePerMinute)?limits.postRatePerMinute:20,
            createNodeIntervalMS = Math.ceil(60.0/postRate)*1000,
            i,
            length = 0,
            nodes = [],
            nodesCounter = 0,
            errorNodes = [],
            errorObject,
            rawResults = [];

         // this cb function is a closure - so it is defined here
         function createNodesCB(errorCreate, result) {
            // counts the number of times this cb was called
            // so we can know when we should start polling
            nodesCounter++;
            rawResults.push(result.rawResult);
            if (!errorCreate) {
               nodes.push(result.node);
            }
            else{
               errorNodes.push(result.node);
               errorObject = errorHandler.concatError(errorObject, errorCreate);
            }

            if (nodesCounter === length) {
               var POLLING_TIMEOUT = 10000;
               // Wait a while and then start polling process until all nodes are active
               setTimeout(function(){
                  triggerWhenNodesActive(POLLING_TIMEOUT, pollingCount, settings, nodes, errorNodes,
                     function(errorPolling, listResults) {
                        if (errorPolling) {
                           errorObject = errorHandler.concatError(errorObject, errorPolling);
                        }
                        callback(errorObject, {
                           nodes: listResults,
                           rawResults: rawResults
                        });
                     });
               },POLLING_TIMEOUT);
            }
         } // function createNodeCB definition

         cloud.createPreparation(settings, function(err,res) {

            // loop for creating the nodes
            for (i = 0, length = settings.nodes.length; i < length; i++) {

               // the timeout is for hp cloud post limitation
               setTimeout(cloud.createNode, createNodeIntervalMS * i, {
                  regionContext: settings.regionContext,
                  nodeParams: settings.nodes[i]
               }, res, i, createNodesCB);
            } // for
         });
      }, // createNodes

      listNodes: function (settings, callback) {
         var cloud = cloudProviders[settings.regionContext.providerName];
         cloud.listNodes(settings, callback);
      },

      deleteNodes: function(settings, callback) {

         var cloud = cloudProviders[settings.regionContext.providerName],
            limits = settings.regionContext.limits,
            deleteRate = (limits &&
            limits.deleteRatePerMinute)?limits.deleteRatePerMinute:20,
            deleteNodeIntervalMS = Math.ceil(60.0/deleteRate)*1000,
            length = 0,
            i,
            deletedCount = 0,
            errorObject,
            nodes = settings.nodes,
            rawResults = [];

         function deleteNodsCB(errorDelete, result) {

            rawResults.push(result.rawResult);
            deletedCount++;
            if (errorDelete) {
               errorObject = errorHandler.concatError(errorObject, errorDelete);
            }

            if (deletedCount === length) {

               if (errorObject) {
                  callback(errorObject, 'error');
               }
               else{
                  // start polling process until all nodes are active
                  // 10sec*180 = 1800 seconds = 30 minutes
                  triggerWhenNodesDeleted(10000, 180, settings, nodes, function(errorPolling, result){

                     callback(errorPolling, {
                        result: result,
                        rawResults: rawResults
                     });
                  });
               }
            }
         }//deleteNodesCB()

         for (i = 0, length = nodes.length; i < length; i++) {
            setTimeout(cloud.deleteNode, deleteNodeIntervalMS*i, {
               regionContext: settings.regionContext,
               node: nodes[i]
            }, deleteNodsCB);
         } // for
      },// deleteNodes
      createImage: function(settings, callback) {
         var cloud = cloudProviders[settings.regionContext.providerName];

         cloud.createImage(settings, function(errorCreate, result) {
            if (errorCreate) {
               callback(errorCreate, result);
               return;
            }

            if (settings.printImageId) {
               console.log('image id is: ' + result.imageId + ', going to poll it');
            }

            triggerWhenImageActive(settings, result.imageId, 84, 5000, function(errPoll) {
               callback(errPoll, result);
            });
         });
      },
      listImages: function(settings, callback) {
         var cloud = cloudProviders[settings.regionContext.providerName];

         cloud.listImages(settings, callback);
      },
      deleteImage: function(settings, callback) {
         var cloud = cloudProviders[settings.regionContext.providerName];

         cloud.deleteImage(settings, callback);
      },
      associateAddresses: function(settings, callback) {
         var cloud = cloudProviders[settings.regionContext.providerName],
            limits = settings.regionContext.limits,
            postRate = (limits &&
            limits.postRatePerMinute)?limits.postRatePerMinute:20,
            associateAddressIntervalMS = Math.ceil(60.0/postRate)*1000,
            i,
            length = 0,
            associateCount = 0,
            errorObject,
            rawResults = [];

         function associateAddressesCB(errorAssociate, result) {
            rawResults.push(result.rawResult);
            associateCount++;
            if (errorAssociate) {
               errorObject = errorHandler.concatError(errorObject, errorAssociate);
            }

            if (associateCount === length) {
               callback(errorObject, rawResults);
            }
         }//associateAddressesCB()

         for (i = 0, length = settings.associatePairs.length; i < length; i++) {
            setTimeout(cloud.associateAddress, associateAddressIntervalMS*i, {
               regionContext: settings.regionContext,
               associatePairs: settings.associatePairs[i]
            }, associateAddressesCB);
         } // for
      },//associateAddresses()

      disassociateAddresses: function(settings, callback) {
         var cloud = cloudProviders[settings.regionContext.providerName],
            limits = settings.regionContext.limits,
            postRate = (limits &&
            limits.postRatePerMinute)?limits.postRatePerMinute:20,
            disassociateAddressIntervalMS = Math.ceil(60.0/postRate)*1000,
            i,
            length = 0,
            disassociateCount = 0,
            errorObject,
            rawResults = [];

         function disassociateAddressesCB(errorDisassociate, result) {
            rawResults.push(result.rawResult);
            disassociateCount++;
            if (errorDisassociate) {
               errorObject = errorHandler.concatError(errorObject, errorDisassociate);
            }

            if (disassociateCount === length) {
               callback(errorObject, rawResults);
            }
         }//disassociateAddressesCB()

         for (i = 0, length = settings.publicIps.length; i < length; i++) {
            setTimeout(cloud.disassociateAddress, disassociateAddressIntervalMS * i, {
               regionContext: settings.regionContext,
               publicIp: settings.publicIps[i]
            }, disassociateAddressesCB);
         } // for
      },//disassociateAddresses()

      allocateAddresses: function (settings, numberOfIps, callback) {
         var ips = {ipList: [], rawResults: []},
            index=0,
            errors = [],
            cloud = cloudProviders[settings.regionContext.providerName];

         for (i = 0; i < numberOfIps; i++) {

            cloud.allocateAddress(settings, function (err, ipRes) {
               index += 1;
               ips.rawResults.push(ipRes.rawResult)
               if (err || !ipRes.result) {
                  errors.push((err || 'IP-' + index + ' was not created'))
               }
               else {
                  ips.ipList.push(ipRes.result)
               }
               if(index===parseInt(numberOfIps)) {
                  callback(errors,ips);
               }
            });
         }
      },

      releaseAddress: function (settings, callback) {
         var cloud = cloudProviders[settings.regionContext.providerName];
         cloud.releaseAddress(settings, callback);
      },

      addLaunchPermissions: function(settings, callback){
         var cloud = cloudProviders[settings.regionContext.providerName];
         if(!cloud || ! cloud.modifyLaunchPermissions){
            callback(new Error ('launch permissions not supported for this provider: ' + settings.regionContext.providerName ));
            return;
         }
         settings.bAdd = true;
         callApiForEachImage(cloud.modifyLaunchPermissions, settings, callback);
      },

      removeLaunchPermissions: function(settings, callback){
         var cloud = cloudProviders[settings.regionContext.providerName];
         if(!cloud || ! cloud.modifyLaunchPermissions){
            callback(new Error ('launch permissions not supported for this provider: ' + settings.regionContext.providerName ));
            return;
         }
         settings.bAdd = false;
         callApiForEachImage(cloud.modifyLaunchPermissions, settings, callback);
      },

      resetLaunchPermissions: function(settings, callback){
         var cloud = cloudProviders[settings.regionContext.providerName];
         if(!cloud || ! cloud.resetLaunchPermissions){
            callback(new Error ('launch permissions not supported for this provider: ' + settings.regionContext.providerName ));
            return;
         }
         callApiForEachImage(cloud.resetLaunchPermissions, settings, callback);
      },

      getLaunchPermissions: function(settings, callback){
         var cloud = cloudProviders[settings.regionContext.providerName];
         if(!cloud || ! cloud.getLaunchPermissions){
            callback(new Error ('launch permissions not supported for this provider: ' + settings.regionContext.providerName ));
            return;
         }
         callApiForEachImage(cloud.getLaunchPermissions, settings, callback);
      }

   };
   return that;
})();

