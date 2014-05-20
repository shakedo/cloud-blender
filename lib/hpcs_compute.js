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
          'access' in identitySettings.identityToken &&
             'token' in identitySettings.identityToken.access &&
                'expires' in identitySettings.identityToken.access.token) {

         expires = identitySettings.identityToken.access.token.expires;
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
            normalResponseCode = '200';

         if (error !== null || (typeof (bodyString) !== 'string') ||
             (response.statusCode + '' !== normalResponseCode)) {
            callback(new Error('cannot retrieve token from hp cloud. reason: ' +
                               (response?response.statusCode:' empty response - probably bad tunneling proxy')));
            return;
         }

         identityToken = JSON.parse(bodyString);
         if ((('access' in identityToken) === false) ||
             (('token' in identityToken.access) === false)) {

            callback(new Error('invalid identityToken structure: ' + JSON.stringify(identityToken)));
            return;
         }

         identitySettings.identityToken = identityToken;
         callback(null, identityToken);
      });
   }

   function createSimpleNodeData(rawNode) {
      var node = {
         id: rawNode.id,
         status: rawNode.status,
         tags: rawNode.metadata,
         addresses: [undefined, undefined],
         releaseInfo: {}
      };

      if (rawNode.addresses['private']) {
         if (rawNode.addresses['private'][0]) {
            node.addresses[0] = rawNode.addresses['private'][0].addr;
         }
         if (rawNode.addresses['private'][1]) {
             node.addresses[1] = rawNode.addresses['private'][1].addr;
         }
      }

      return node;
   }

   var that = {

      setProxy: function(proxyUrl) {
         proxyURL = proxyUrl;
      },

      createRegionContext: function(authSettings, limits) {
         return {   
            identitySettings: {
               auth: {
                  apiAccessKeyCredentials: {
                     "accessKey": authSettings.accessKey,
                     "secretKey": authSettings.secretKey
                  },
                  tenantId: authSettings.tenantId
               },
               url: 'https://' + authSettings.region + '.identity.hpcloudsvc.com:35357/v2.0/tokens'
            },
            computeSettings: {
               url: 'https://' + authSettings.availabilityZone + '.' + 
                  authSettings.region + '.compute.hpcloudsvc.com/v1.1/' +
                  authSettings.tenantId 
            },
            limits: limits,
            providerName: 'hpcs'
         };
      },

      createNode: function(settings, callback) {
         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
            
            var createNodeSettings,
               nodeParams = {
                  name: new Date().valueOf() + '-createdByStorm',
                  imageRef: settings.nodeParams.imageId,
                  flavorRef: settings.nodeParams.instanceType,
                  metadata: settings.nodeParams.tags,
                  key_name: settings.nodeParams.keyName
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
                  'X-Auth-Token': identityToken.access.token.id,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
               },
               proxy: proxyURL,
               body: JSON.stringify({server: nodeParams})
            };

            request(createNodeSettings, function(error, response, bodyString) {
               var nodeData,
                  normalResponseCode = '202',
                  finalResult = {},
                  errorCreate;

               finalResult.rawResult = bodyString; // may not be json if something bad happens

               if (error === null && 
                   (response.statusCode + '' === normalResponseCode)) {

                  if (typeof (bodyString) === 'string') {
                     finalResult.rawResult = JSON.parse(bodyString);
                  }

                  nodeData = finalResult.rawResult.server;
                  finalResult.node = createSimpleNodeData(nodeData);
               }
               else{
                  finalResult.node = {logicName: settings.nodeParams.logicName, status: 'ERROR'};
                  errorCreate = new Error('can not createNode with paramters: ' + JSON.stringify(settings.nodeParams) +
                                          '. statusCode: ' + (response?response.statusCode:'undefined') +
                                          ' ,body string' + bodyString);
               }

               callback(errorCreate, finalResult);
            });
         });
      },

      listNodes: function(settings, callback) {

         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
            var listRequestSettings;
 
            if (errorConnect) {
               callback(errorConnect, {});
               return;
            }

            listRequestSettings = {
               method: 'GET',
               url: settings.regionContext.computeSettings.url + '/servers/detail',
               headers: {
                  'X-Auth-Token': identityToken.access.token.id,
                  'Accept': 'application/json'
               },
               proxy: proxyURL
            };

            request(listRequestSettings, function(error, response, bodyString) {
               var finalResults = {
                     nodes: []
                  },
                  normalResponseCodes = {
                     '200': '1',
                     '203': '1'
                  },
                  errorList;

               if (typeof (bodyString) === 'string') {
                  finalResults.rawResult = JSON.parse(bodyString);
               }

               if (error === null && (typeof (bodyString) === 'string') &&
                   (normalResponseCodes[response.statusCode + ''] === '1')) {

                  underscore.each(finalResults.rawResult.servers, function(server) {
                     finalResults.nodes.push(createSimpleNodeData(server));
                  });
               }
               else {
                  errorList = new Error('cannot retrieve node machines list from hp cloud. reason: ' +
                                          '. statusCode: ' + (response?response.statusCode:'undefined'));
               }

               callback(errorList, finalResults);
            });
         });
      },

      deleteNode: function(settings, callback) {

         connect(settings.regionContext.identitySettings, function(errorConnect, identityToken) {
            var deleteRequestSettings;
            
            if (errorConnect) {
               callback(errorConnect, {});
               return;
            }
           
            deleteRequestSettings = {
               method: 'DELETE',
               headers: {
                  'X-Auth-Token': identityToken.access.token.id,
                  'Accept': 'application/json'
               },
               url: settings.regionContext.computeSettings.url + '/servers/' + settings.node.id,
               proxy: proxyURL
            };

            request(deleteRequestSettings, function(error, response, bodyString) {

               var normalResponseCode = '204',
                  finalResult = {rawResult: undefined},
                  errorDelete;

               if (error === null && (response.statusCode + '' === normalResponseCode)) {
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
                  'X-Auth-Token': identityToken.access.token.id,
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

               // console.log('error: ' + JSON.stringify(error) +
               //             ', result: ' + JSON.stringify(bodyString));
               if (errorRequest !== null ||
                  (response.statusCode + '' !== normalResponseCode)
                  ) {
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
                  'X-Auth-Token': identityToken.access.token.id,
                  'Accept': 'application/json'
               },
               proxy: proxyURL
            };

            request(requestSettings, function(error, response, bodyString) {
               var imagesData,
                  normalResponseCodes = {
                     '200': '1',
                     '203': '1'
                  },
                  errorListImage,
                  finalResult = {};


               if (error !== null || (typeof (bodyString) !== 'string') ||
                  (normalResponseCodes[response.statusCode + ''] !== '1')
                  ) {
                  errorListImage = new Error('cannot retrieve images list from hp cloud. ' +
                                                '. statusCode: ' + (response?response.statusCode:'undefined'));
               }
               else {
                  imagesData = JSON.parse(bodyString);
                  finalResult.rawResult = imagesData;
                  finalResult.images = [];
                  underscore.each(imagesData.images, function(rawImage) {
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
                  'X-Auth-Token': identityToken.access.token.id
               },
               proxy: proxyURL
            };
            request(requestSettings, function(error, response, bodyString) {

               var normalResponseCodes = {
                  '200': '1',
                  '204': '1'
               },
               errorDeleteImage,
               finalResult = {rawResult: undefined};
               
               if (error !== null ||
                  (normalResponseCodes[response.statusCode + ''] !== '1')
                  ) {
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
      //             'X-Auth-Token': identityToken.access.token.id,
      //             'Accept': 'application/json'
      //          },
      //          proxy: proxyURL
      //       };

      //       request(requestSettings, function(error, response, bodyString) {
      //          var imagesData,
      //             normalResponseCodes = {
      //                '200': '1',
      //                '203': '1'
      //             },
      //             limits,
      //             finalError;


      //          if (error !== null || (typeof (bodyString) !== 'string') ||
      //             (normalResponseCodes[response.statusCode + ''] !== '1')
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
      //},


   };

   return that;
})();

