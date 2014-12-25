var request = require('request'),
   underscore = require('underscore'),
   errorHandler = require('./error_handler.js');

// This module implements the high level functionality.
module.exports = (function() {

   // internal members
   // ----------------
   var hpcs = require('./hpcs_compute.js'),
      aws = require('./aws_ec2.js'),
      hpcs_13_5 = require('./hpcs_compute_13_5.js'),
      azure = require('./azure.js'),
      cloudProviders = {
         'hpcs': hpcs,
         'aws': aws,
         'hpcs_13_5': hpcs_13_5,
         'azure': azure
      };

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

            tenantNode = tenantNodes[queryNodesList[i].id];

            if (!tenantNode || tenantNode.status === undefined || 
                (tenantNode.status.indexOf('ERROR') === 0)) {

               errorObject = errorHandler.concatError(errorObject, new Error('ERROR: found a new error for ' + JSON.stringify(queryNodesList[i])));
               queryNodesList[i].status = 'ERROR_no_longer_found';
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

   var that = {

      // setting proxy to use
      setProxy: function(proxyUrl) {

         underscore.each(cloudProviders, function(cloudProvider) {
            cloudProvider.setProxy(proxyUrl);
         });
      },

      createRegionContext: function(provider, regionSettings, limitsSettings) {
         var cloud = cloudProviders[provider];
         return cloud.createRegionContext(regionSettings, limitsSettings);
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

               // start polling process until all nodes are active
               triggerWhenNodesActive(10000, pollingCount, settings, nodes, errorNodes,
                  function(errorPolling, listResults) {
                     if (errorPolling) {
                        errorObject = errorHandler.concatError(errorObject, errorPolling);
                     }
                     callback(errorObject, {
                        nodes: listResults,
                        rawResults: rawResults
                     });
                  });
            }
         } // function createNodeCB definition

         // loop for creating the nodes
         for (i = 0, length = settings.nodes.length; i < length; i++) {

            // the timeout is for hp cloud post limitation
            setTimeout(cloud.createNode, createNodeIntervalMS*i, {
               regionContext: settings.regionContext,
               nodeParams: settings.nodes[i]
            },createNodesCB);
         } // for
      }, // createNodes

      listNodes: function(settings, callback) {
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

            triggerWhenImageActive(settings, result.imageId, 48, 5000, function(errPoll) {
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
      }
   };
   return that;
})();

