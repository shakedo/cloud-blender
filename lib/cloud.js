var request = require('request'),
   underscore = require('underscore'),
   Shync = require('../vendor/shync/lib/shync.js').Shync,
   errorHandler = require('./error_handler.js');

// This module implements some of the hp cloud compute functionality.
// The rest api is taken from hp cloud documentation (http://hpcloud.com)
//  (some of the api is broken - like in createNodes)
// The function names are inspired by libcloud with minor differences.
module.exports = function(tunnelingProxyURL) {

   var hpcs = require('./hpcs_compute.js')(tunnelingProxyURL),
      aws = require('./aws_ec2.js')(tunnelingProxyURL),
      cloudProviders = {
         'hpcs': hpcs,
         'aws': aws
      };

   function triggerWhenSSHServiceActive(sshClusterSettings, pollingIntervalMS, pollingCount, callback) {

      var cluster = new Shync(sshClusterSettings);

      if (pollingCount === 0) {
         callback({status: 500, desc: 'ssh polling exceeds limits'});
      }
      cluster.run('ls -l', function(code) {
         if (code === 0) {
            callback(null, code);
         }
         else {
            setTimeout(triggerWhenSSHServiceActive,
                       pollingIntervalMS,
                       sshClusterSettings,
                       pollingIntervalMS,
                       pollingCount - 1,
                       callback);
         }
      });
   }

   // This function polls the cloud until the given list of nodes are active.
   // we have 3 lists:
   // queryNodesList - contains names but may not contain addresses
   // errorNodesList - contains names of status error list
   // tenantNodesList - the result of the listNodes call (does not contain names)
   //                   but on status ACTIVE should contain addresses.
   function triggerWhenNodesActive(pollingIntervalMS, pollingCount, 
                                   settings, queryNodesList, errorNodes, callback) {

      var cloud = cloudProviders[settings.provider];

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
         var i = 0,
            tenantNodesList = result.nodes,
            foundNonActive = false,
            queryNodesLength = 0,
            domains = [], // for ssh polling
            tenantNodes = {},
            tenantNode,
            errorObject;

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
               queryNodesList[i] = tenantNode;
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
            errorObject = errorHandler.concatError(errorObject, newError('polling exceeds pollingCount limit'));
            // we shouldn't continue to ssh polling or to a new level of recursion
            callback(errorObject, queryNodesList.concat(errorNodes));
            return;
         }

         if (foundNonActive === false) {
            // if we want to deploy ssh 
            if (settings.sshClusterSettings) {

               // we are now polling for ssh active connection
               underscore.each(queryNodesList, function(server) {
                  domains.push(server.addresses[1]);
               });

               settings.sshClusterSettings.domains = domains;

               triggerWhenSSHServiceActive(settings.sshClusterSettings,
                  10000,
                  30,
                  function(errorSSHPolling) {
                     callback(errorSSHPolling, queryNodesList.concat(errorNodes));
                  });
            }
            else {
               // this is where successfull call is ended
               // in case you wondered :-)
               callback(errorObject, queryNodesList.concat(errorNodes));
            }
         }
         else { // we need to continue the polling since we found non active
            setTimeout(triggerWhenNodesActive, pollingIntervalMS, pollingIntervalMS, pollingCount - 1, settings, queryNodesList, errorNodes, callback);
         }
      });
   }

   function triggerWhenNodesDeleted(pollingIntervalMS, pollingCount, settings, nodeIds, callback) {

      var cloud = cloudProviders[settings.provider];
      if (nodeIds.length === 0) {
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

         foundNodeId = underscore.find(nodeIds, function(nodeId) {
            var tenantNode;
            tenantNode = underscore.find(tenantNodesList, function (node) {
               if (node.id === nodeId) {
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

         setTimeout(triggerWhenNodesDeleted, pollingIntervalMS, pollingIntervalMS, pollingCount - 1, settings, nodeIds, callback);
      });
   }

   function triggerWhenImageActive(settings, imageId, pollingCount, pollingInterval, callback) {

      var cloud = cloudProviders[settings.provider];
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

      // This function creates a list of nodes on the given cloud provider.
      // It calls the callback when all the nods are ready to use.
      // This is acheived by activating a polling process in the end
      // of the configuration process (after launching all conf commands
      // on the cloud).
      createNodes: function(settings, callback) {

         var cloud = cloudProviders[settings.provider],
            createNodeIntervalMS = Math.ceil(60.0/settings.regionConfiguration.postRatePerMinuteLimits)*1000,
            i = 0,
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
               // 10sec*180 = 1800 seconds = 30 minutes
               triggerWhenNodesActive(10000, 180, settings, nodes, errorNodes,
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

         // loop for creating the servers
         for (i = 0, length = settings.servers.length; i < length; i++) {

            // the timeout is for hp cloud post limitation
            setTimeout(cloud.createNode, createNodeIntervalMS*i, {
               identitySettings: settings.identitySettings,
               computeSettings: settings.computeSettings,
               nodeParams: settings.servers[i]
            },createNodesCB);
         } // for
      }, // createNodes

      listNodes: function(settings, callback) {
         var cloud = cloudProviders[settings.provider];
         cloud.listNodes(settings, callback);
      },

      deleteNodes: function(settings, callback) {
         var cloud = cloudProviders[settings.provider],
            deleteNodeIntervalMS = Math.ceil(60.0/settings.regionConfiguration.deleteRatePerMinuteLimits)*1000,
            length = 0,
            i = 0,
            deletedCount = 0,
            errorObject,
            nodeIds = settings.nodeIds,
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
                  triggerWhenNodesDeleted(10000, 180, settings, nodeIds, function(errorPolling, result){

                     callback(errorPolling, {
                        result: result,
                        rawResults: rawResults
                     });
                  });
                  return;
               }
            }
         }//deleteNodesCB()

         for (i = 0, length = nodeIds.length; i < length; i++) {
            setTimeout(cloud.deleteNode, deleteNodeIntervalMS*i, {
               identitySettings: settings.identitySettings,
               computeSettings: settings.computeSettings,
               nodeParams: {
                  id: nodeIds[i]
               }
            }, deleteNodsCB);
         } // for
      },// deleteNodes
      createImage: function(settings, callback) {
         var cloud = cloudProviders[settings.provider];

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
         var cloud = cloudProviders[settings.provider];
         cloud.listImages(settings, callback);
      },
      deleteImage: function(settings, callback) {
         var cloud = cloudProviders[settings.provider];
         cloud.deleteImage(settings, callback);
      }
   };
   return that;
};

