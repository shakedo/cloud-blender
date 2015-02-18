var request = require('request'),
   underscore = require('underscore');

// This module implements some of the hp cloud compute functionality.
// The rest api is taken from hp cloud documentation (http://hpcloud.com)
//  (some of the api is broken - like in createNodes)
// The function names are inspired by libcloud with minor differences.
module.exports = (function() {

   // internal members
   // ----------------
   var proxyURL;

   // internal functions
   // ------------------
   // The connect method is being called in the beginning 
   //  of each high level function (listNodes, createNodes etc.)
   //  some of these high level function calls to other high level functions
   //  (polling for example). In order to prevent many unnecessary rest 
   //  calls, we save the identityToken in the identitySettings 
   //  and we check the existence and expiration date of the token.
   //
   // The best practice is that the caller of this function
   // will also save this token in the session (so we can save rest calls)
   // parameters:
   // -----------
   // identitySettings should contain auth object, identity url and tenantid
   function connect(identitySettings, callback) {

      // the threshold is 1 hour to be on the safe side
      // (the token expires every 12hours)
      var DIFF_THRESH_HOURS = 1,
         expires = '',
         hourDiff = 0,
         requestSettings;

      if ('identityToken' in identitySettings &&
          'token' in identitySettings.identityToken &&
          'accessToken' in identitySettings.identityToken &&
          'expires_at' in identitySettings.identityToken.token) {

         expires = identitySettings.identityToken.token.expires_at;
         hourDiff = (new Date(expires).getTime() - new Date().getTime()) / 1000 / 60 / 60;

         if (hourDiff > DIFF_THRESH_HOURS) {
            callback(null, identitySettings.identityToken);
            return;
         }
      }

      requestSettings = {
         method: 'POST',
         url: identitySettings.url,
         headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
         },
         body: JSON.stringify({auth: identitySettings.auth}),
         proxy: proxyURL
      };

      request(requestSettings, function(error, response, bodyString) {
         var identityToken,
            normalResponseCode = '201';

         if (error !== null || (typeof (bodyString) !== 'string') || !response || 
             (response.statusCode + '' !== normalResponseCode) || 
                (!response.headers['x-subject-token'])) {
            callback(new Error('cannot retrieve token from hp cloud. reason: ' +
                               (response?response.statusCode:' empty response - probably bad tunneling proxy')));
            return;
         }

         identityToken = JSON.parse(bodyString);

         // the reason to create this hierarchy is just backward compatibility laziness
         identityToken.accessToken = response.headers['x-subject-token'];

         identitySettings.identityToken = identityToken;
         callback(null, identityToken);
      });
   }

   // called before floating ip binding - and assumes only one network is in use...
   function createSimpleNodeData(rawNode) {
      var node = {
         id: rawNode.id,
         status: rawNode.status,
         tags: rawNode.metadata,
         addresses: [undefined, undefined]
      };

      underscore.each(rawNode.addresses, function(network) {
         if (network[0]) {
            node.addresses[0] = network[0].addr;
         }
         if (network[1]) {
            node.addresses[1] = network[1].addr;
         }

      });

      return node;
   }
   
   function pollForStatusIp(settings, id, pollingCount, callback) {

      connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
         var statusSettings;

         if (errorConnect) {
            callback(errorConnect, {});
            return;
         }

         statusSettings = {
            method: 'GET',
            url: settings.regionContext.computeSettings.url + '/servers/' + id,
            headers: {
               'X-Auth-Token': identityToken.accessToken,
               'Content-Type': 'application/json',
               'Accept': 'application/json'
            },
            proxy: proxyURL
         };

         request(statusSettings, function(error, response, bodyString) {

            var normalResponseCode = '200',
               finalResult = {},
               finalError, bodyJson;

            try{
               finalResult.rawResult = JSON.parse(bodyString);
            }
            catch(errorParse) {
            }

            if (error !== null || (!finalResult.rawResult) || !response ||
               (response.statusCode + '' !== normalResponseCode)) {
               finalError = new Error('problem in finding jobStatus, error: ' + error +
                                      ', responseCode: ' + (response?response.statusCode:'undefined'));
            }

            if (pollingCount === 1 && finalError) {
               callback(finalError, {});
               return;
            }

            // a special case of hpcs bug  - in this case we must fail the machine
            if (((!finalError) && finalResult.rawResult) &&
                (finalResult.rawResult.server.status === 'SHUTOFF' ||
                 finalResult.rawResult.server.status.indexOf('ERROR') === 0)) {

               callback(new Error('found a machine with shutoff status - hpcs cloud bug detected'));
               return;
            }

            // statuses taken from:
            // http://docs.hpcloud.com/api/v13/compute/ (look for NETWORKING string)
            if ((!finalError) && finalResult.rawResult && (finalResult.rawResult.server.status === 'ACTIVE' || 
                finalResult.rawResult.server.status === 'BUILD(block_device_mapping)' ||
                finalResult.rawResult.server.status === 'BUILD(spawning)')) {
               callback(undefined, finalResult);
               return;
            }

            setTimeout(pollForStatusIp, 10000, settings, id, pollingCount - 1, callback);
         });
      });
   }

   function allocateAndBindIpAddress(settings, nodeId, callback) {

      connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
         var allocateIpSettings;

         if (errorConnect) {
            callback(errorConnect, {});
            return;
         }

         allocateIpSettings = {
            method: 'POST',
            url: settings.regionContext.computeSettings.url + '/os-floating-ips',
            headers: {
               'X-Auth-Token': identityToken.accessToken,
               'Content-Type': 'application/json',
               'Accept': 'application/json'
            },
            proxy: proxyURL
         };

         request(allocateIpSettings, function(error, response, bodyString) {
            var normalResponseCode = '200',
               finalResult = {},
               addFloatingIpSettings;

            try{
               finalResult.rawResult = JSON.parse(bodyString);
            }
            catch(errorParse){
            }

            if (error === null && (finalResult.rawResult) && response &&
               (response.statusCode + '' === normalResponseCode)) {

               finalResult.ipAddress = finalResult.rawResult.floating_ip.ip;
               
               addFloatingIpSettings = {
                  method: 'POST',
                  url: settings.regionContext.computeSettings.url + '/servers/' + nodeId +'/action',
                  headers: {
                     'X-Auth-Token': identityToken.accessToken,
                     'Content-Type': 'application/json',
                     'Accept': 'application/json'
                  },
                  proxy: proxyURL,
                  body: JSON.stringify({addFloatingIp: {
                     address: finalResult.ipAddress
                  }})
               };

               request(addFloatingIpSettings, function(error, response, bodyString) {
                  var normalResponseCode = '202',
                     finalError;
                  
                  if (error || !response || (response.statusCode + '' !== normalResponseCode)) {
                     finalError = new Error('can not add ip adress ' + (response?response.statusCode:'undefined') + ' ' + 
                                            error);
                  }

                  callback(finalError, finalResult);
               });
            } else {
               callback(new Error('can not allocate a floating ip'));
               return;
            }
         });
      });
   }

   function deallocateFloatingIpOfNode(settings, callback) {

      connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
         var keys = [],
            ipsCounter = 0,
            finalError;

         function releaseIpCB(error, response, bodyString) {
            var normalResponseCode = '202';

            ipsCounter++;
            if (error || !response || (response.statusCode + '' !== normalResponseCode)) {
               finalError = new Error('can not release ip adress ' + (response?response.statusCode:'undefined') + ' ' +
                                      error);
            }

            if (ipsCounter === keys.length) {
               callback(finalError);
            }
         }

         if (errorConnect) {
            callback(errorConnect, {});
            return;
         }

         if (settings.node && settings.node.releaseInfo && settings.node.releaseInfo.addresses)
            keys = underscore.keys(settings.node.releaseInfo.addresses);

         if (keys.length === 0) {
            callback(undefined);
            return;
         }

         underscore.each(keys, function(key) {
            var releaseIpSettings = {
               method: 'DELETE',
               url: settings.regionContext.computeSettings.url + '/os-floating-ips/' + settings.node.releaseInfo.addresses[key],
               headers: {
                  'X-Auth-Token': identityToken.accessToken,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
               },
               proxy: proxyURL
            };

            request(releaseIpSettings, releaseIpCB);
         });
      });
   }

   // creates a map of ip address to ip id for making things efficient
   function listIps(settings, callback) {
      connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
         var listIpsSettings;

         if (errorConnect) {
            callback(errorConnect, {});
            return;
         }

         listIpsSettings = {
            method: 'GET',
            url: settings.regionContext.computeSettings.url + '/os-floating-ips',
            headers: {
               'X-Auth-Token': identityToken.accessToken,
               'Content-Type': 'application/json',
               'Accept': 'application/json'
            },
            proxy: proxyURL
         };


         request(listIpsSettings, function(error, response, bodyString) {
            var normalResponseCode = '200',
               finalError,
               rawResult,
               ipsHash = {};

            try{
               rawResult = JSON.parse(bodyString);
            }
            catch(errorParse) {
            }

            if (error || !response || (response.statusCode + '' !== normalResponseCode) || (!rawResult)) {
               finalError = new Error('can not find floating ips ' + (response?response.statusCode:'undefined') + ' ' + 
                                      error);
            }

            if (rawResult && rawResult.floating_ips) {
               underscore.each(rawResult.floating_ips, function(floating) {
                 ipsHash[floating.ip] = floating.id;
               });
            }

            callback(finalError, ipsHash);
         });
      });
   }

   var that = {

      setProxy: function(proxyUrl) {
         proxyURL = proxyUrl;
      },

      createPreparation: function (settings, callback) {
         callback(null,null);
      },

      createRegionContext: function(authSettings, limits) {
         return {
            identitySettings: {
               
               auth: {
                  identity: {
                     methods: ['accessKey'],
                     accessKey: {
                        "accessKey": authSettings.accessKey,
                        "secretKey": authSettings.secretKey
                     }
                  },
                  scope: {
                     project: {
                        id: authSettings.tenantId
                     }
                  }
               },

               url: 'https://' + authSettings.region + '.identity.hpcloudsvc.com:35357/v3/auth/tokens'
            },
            computeSettings: {
               url: 'https://' +
               authSettings.region + '.compute.hpcloudsvc.com/v2/' +
                  authSettings.tenantId
            },
            limits: limits,
            providerName: 'hpcs_13_5',
            pollingCount: 1
         };
      },

      createNode: function(settings, cloudServicesTestSettings, nodeIndex, callback) {
         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
            var createNodeSettings,
               nodeParams = {
                  name: new Date().valueOf() + '-createdByStorm',
                  imageRef: settings.nodeParams.imageId,
                  flavorRef: settings.nodeParams.instanceType,
                  metadata: settings.nodeParams.tags,
                  key_name: settings.nodeParams.keyName,
                  availability_zone: 'az2'
               },
               securityGroups = settings.nodeParams.securityGroups,
               userData = settings.nodeParams.userData;
         
            if (errorConnect) {
               callback(errorConnect, {});
               return;
            }

            // adding securityGroups
            if (securityGroups) {
               nodeParams.security_groups = [];
               underscore.each(securityGroups, function(securityGroup) {
                  nodeParams.security_groups.push({"name": securityGroup});
               });
            }
            // adding user data
            if (userData) {
               nodeParams.user_data = new Buffer(JSON.stringify(userData)).toString('base64');
            }

            // vendor specific extension must be last
            underscore.extend(nodeParams, settings.nodeParams.vendorSpecificParams);
            
            createNodeSettings = {
               method: 'POST',
               url: settings.regionContext.computeSettings.url + '/servers',
               headers: {
                  'X-Auth-Token': identityToken.accessToken,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
               },
               proxy: proxyURL,
               body: JSON.stringify({server: nodeParams})
            };

            request(createNodeSettings, function(error, response, bodyString) {

               var nodeData,
                  normalResponseCode = '202',
                  finalResult = {
                     rawResult: {},
                     node: {
                        tags: {logicName: settings.nodeParams.logicName}
                     }
                  },
                  errorCreate, nodeId, bodyJson;

               try{
                  bodyJson = JSON.parse(bodyString);
               }catch(errorParse) {
               }

               if (error !== null || !response || (response.statusCode + '' !== normalResponseCode) || 
                  !bodyJson) {
                  finalResult.node.status =  'ERROR_ALLOCATION';
                  errorCreate = new Error('can not createNode with paramters: ' + JSON.stringify(settings.nodeParams) +
                                          '. statusCode: ' + (response?response.statusCode:'undefined') +
                                          ' ,body string' + bodyString,
                                          'error: ' + error);
                  callback(errorCreate, finalResult);
                  return;
               }

               nodeId = bodyJson.server.id;
              
               setTimeout(pollForStatusIp, 10000, settings, nodeId, 20, function(errorStatus, resultsNode) {

                  if (errorStatus) {
                     finalResult.node.status =  'ERROR_STATUS_POLLING';
                     callback(errorStatus, finalResult);
                     return;
                  }

                  finalResult.rawResult = resultsNode.rawResult;
                  //console.log(JSON.stringify(finalResult.rawResult, null, '   '));
                  finalResult.node = createSimpleNodeData(resultsNode.rawResult.server);

                  allocateAndBindIpAddress(settings, finalResult.rawResult.server.id, function(errorIp, ipResult) {

                     if (errorIp) {
                        finalResult.node.status =  'ERROR_IP';
                        errorCreate = new Error('can not allocate ip address with paramters: ' + JSON.stringify(settings.nodeParams) + 
                                                errorIp);
                        callback(errorIp, finalResult);
                        return;
                     }

                     finalResult.node.addresses[1] = ipResult.ipAddress;
                     finalResult.node.releaseInfo = {addresses: {}};
                     finalResult.node.releaseInfo.addresses[ipResult.ipAddress] = 
                        ipResult.rawResult.floating_ip.id;

                     callback(undefined, finalResult);
                  });
               });
            });
         });
      },

      listNodes: function(settings, callback) {

         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {

            if (errorConnect) {
               callback(errorConnect, {});
               return;
            }

            listIps(settings, function(errorConnect, ipsHash) {

               var listRequestSettings;

               listRequestSettings = {
                  method: 'GET',
                  url: settings.regionContext.computeSettings.url + '/servers/detail',
                  headers: {
                     'X-Auth-Token': identityToken.accessToken,
                     'Accept': 'application/json'
                  },
                  proxy: proxyURL
               };

               request(listRequestSettings, function(error, response, bodyString) {
                  var finalResults = {
                        nodes: []
                     },
                     normalResponseCode = '200',
                     errorList;

                  try {
                     finalResults.rawResult = JSON.parse(bodyString);
                  } catch (errorParse) {}

                  if (error === null && finalResults.rawResult && response &&
                     (response.statusCode + '' === normalResponseCode)) {

                     underscore.each(finalResults.rawResult.servers, function(server) {
                        var node = createSimpleNodeData(server);

                        node.releaseInfo = {addresses: {}};
                        node.releaseInfo.addresses[node.addresses[1]] = 
                           ipsHash[node.addresses[1]];

                        finalResults.nodes.push(node);
                     });
                  } else {
                     errorList = new Error('cannot retrieve node machines list from hp cloud. reason: ' +
                        '. statusCode: ' + (response ? response.statusCode : 'undefined'));
                  }

                  callback(errorList, finalResults);
               });
            });
         });
      },
      deleteNode: function(settings, callback) {

         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
            if (errorConnect) {
               callback(errorConnect, {});
               return;
            }

            // we should ignore the errorDeleteIp
            deallocateFloatingIpOfNode(settings, function(errorDeleteIp, result) {
               var deleteRequestSettings;

               deleteRequestSettings = {
                  method: 'DELETE',
                  headers: {
                     'X-Auth-Token': identityToken.accessToken,
                     'Accept': 'application/json'
                  },
                  url: settings.regionContext.computeSettings.url + '/servers/' + settings.node.id,
                  proxy: proxyURL
               };

               request(deleteRequestSettings, function(error, response, bodyString) {

                  var normalResponseCode = '204',
                     finalResult = {rawResult: undefined},
                  errorDelete;

                  if (error === null && response && (response.statusCode + '' === normalResponseCode)) {
                     finalResult.result = 'SUCCESS';
                  }
                  else {
                     finalResult.result = 'ERROR';
                     errorDelete = new Error('deleteNode failed for id: ' + JSON.stringify(settings.nodeParams) +
                                             '. statusCode: ' + (response?response.statusCode:'undefined') +
                                             ', request settings: ' + JSON.stringify(deleteRequestSettings));
                  }

                  callback(errorDelete, finalResult);
               });
            });
         });
      },

      createImage: function(settings, callback) {
         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {

            var createImageRequestSettings,
               imageParams = {
            name: new Date().valueOf() + '-createdByStorm',
            serverId: settings.imageParams.nodeId,
            metadata: settings.imageParams.tags
               };

               if (errorConnect) {
                  callback(errorConnect, {});
               return;
            }

            underscore.extend(imageParams, settings.imageParams.vendorSpecificParams);

            createImageRequestSettings = {
               method: 'POST',
               url: settings.regionContext.computeSettings.url + '/servers/' + settings.imageParams.nodeId + '/action',
               headers: {
                  'X-Auth-Token': identityToken.accessToken,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
               },
               proxy: proxyURL,
               body: JSON.stringify({createImage: imageParams})
            };

            request(createImageRequestSettings, function(errorRequest, response, bodyString) {
               var normalResponseCode = '202',
                  location = '',
                  imageId = '',
                  finalResult = {},
                  errorCreate;

               if (errorRequest !== null || !response || 
                  (response.statusCode + '' !== normalResponseCode)) {
                  errorCreate = new Error('cannot createImage with params: '+
                                             JSON.stringify(settings.imageParams) +
                                             ', error: ' + JSON.stringify(errorRequest) +
                                             '. statusCode: ' + (response?response.statusCode:'undefined'));
               }
               else {
                  location = response.headers.location;
                  imageId = location.slice(location.lastIndexOf('/') + 1);
                  finalResult.rawResult = location;
                  finalResult.imageId = imageId;
               }

               callback(errorCreate, finalResult);
            });
         });
      },

      listImages: function(settings, callback) {

         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
            var requestSettings;
            
            if (errorConnect) {
               callback(errorConnect, {});
               return;
            }
           
            requestSettings = {
               method: 'GET',
               url: settings.regionContext.computeSettings.url + '/images/detail',
               headers: {
                  'X-Auth-Token': identityToken.accessToken,
                  'Accept': 'application/json'
               },
               proxy: proxyURL
            };

            request(requestSettings, function(error, response, bodyString) {
               var normalResponseCode = '200',
                  errorListImage,
                  finalResult = {};

               try {
                  finalResult.rawResult = JSON.parse(bodyString);
               }
               catch (errorParse) {
               }


               if (error !== null || (typeof (bodyString) !== 'string') || !response ||
                  (response.statusCode + '' !== normalResponseCode)) {
                  errorListImage = new Error('cannot retrieve images list from hp cloud. ' +
                                                '. statusCode: ' + (response?response.statusCode:'undefined'));
               }
               else {

                  finalResult.images = [];
                  underscore.each(finalResult.rawResult.images, function(rawImage) {
                     var image = underscore.pick(rawImage, 'id', 'status', 'name');
                     image.tags = rawImage.metadata;
                     finalResult.images.push(image);
                  });
               }
               callback(errorListImage, finalResult);
            });
         });
      },

      deleteImage: function(settings, callback) {

         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
            var requestSettings;
            
            if (errorConnect) {
               callback(errorConnect, {});
               return;
            }

            requestSettings = {
               url: settings.regionContext.computeSettings.url + '/images/' + settings.imageParams.imageId,
               method: 'DELETE',
               headers: {
                  'X-Auth-Token': identityToken.accessToken
               },
               proxy: proxyURL
            };
            request(requestSettings, function(error, response, bodyString) {

               var normalResponseCode = '204',
               errorDeleteImage,
               finalResult = {rawResult: undefined};
               
               if (error !== null || !response || 
                  (normalResponseCode !== response.statusCode + '')) {
                  errorDeleteImage = new Error('cannot deleteImage, error: ' + error + ', code: ' + 
                                               (response?response.statusCode:'undefined'));
                  finalResult.result = 'ERROR';
               }
               else {
                  finalResult.result = 'SUCCESS';
               }

               callback(errorDeleteImage, finalResult);
            });
         });
      },

      associateAddress: function(settings, callback){
         var error = new Error('no implementation')
         callback(error, null);
      },

      disassociateAddress: function(settings, callback){
         var error = new Error('no implementation')
         callback(error, null);
      }

      // getLimits: function(settings, callback) {

      //    connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {

      //       var requestSettings;
      //       if (errorConnect) {
      //          callback(errorConnect, {});
      //          return;
      //       }

      //       requestSettings = {
      //          method: 'GET',
      //          url: settings.regionContext.computeSettings.url + '/limits',
      //          headers: {
      //             'X-Auth-Token': identityToken.accessToken,
      //             'Accept': 'application/json'
      //          },
      //          proxy: proxyURL
      //       };

      //       request(requestSettings, function(error, response, bodyString) {
      //          var imagesData,
      //             normalResponseCode = '200',
      //             limits,
      //             finalError;


      //          if (error !== null || (typeof (bodyString) !== 'string') ||
      //             (normalResponseCode !== response.statusCode + '')
      //             ) {
      //             finalError = new Error('cannot retrieve images list from hp cloud. ' +
      //                                           '. statusCode: ' + (response?response.statusCode:'undefined'));
      //          }
      //          else {
      //             limits = JSON.parse(bodyString);
      //          }
      //          callback(finalError, limits);
      //       });
      //    });
      // }

   };

   return that;
})();

