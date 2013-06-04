var request = require('request'),
   underscore = require('underscore');

// This module implements some of the hp cloud compute functionality.
// The rest api is taken from hp cloud documentation (http://hpcloud.com)
//  (some of the api is broken - like in createNodes)
// The function names are inspired by libcloud with minor differences.
module.exports = function(proxyURL) {

   // The connect method is being called in the beginning 
   //  of each high level function (listNodes, createNodes etc.)
   //  some of these high level function calls to other high level functions
   //  (polling for example). In order to prevent many unnecessary rest 
   //  calls, we save the identityToken in the identitySettings 
   //  and we check the existance and expiration date of the token.
   //
   // The best practice is that the caller of this function
   // will also save this token in the session (so we can save rest calls)
   // parameters:
   // -----------
   // identitySettings should contain auth object, identity url and tenantid
   function connect(identitySettings, callback) {

      // the thresold is 1 hour to be on the safe side
      // (the token expires every 12hours)
      var DIFF_THRESH_HOURS = 1,
         expires = '',
         hourDiff = 0,
         requestSettings = {};

      if ('identityToken' in identitySettings &&
          'access' in identitySettings.identityToken &&
             'token' in identitySettings.identityToken.access &&
                'expires' in identitySettings.identityToken.access.token) {

         expires = identitySettings.identityToken.access.token.expires;
         hourDiff = (new Date(expires) - new Date()) / 1000 / 60 / 60;

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
            callback(new Error('cannot retrieve token from hp cloud. reason: ' + response.statusCode));
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
         addresses: [undefined, undefined]
      };

      if (rawNode.addresses['private'] && rawNode.addresses['private'][0]) {
         node.addresses[0] = rawNode.addresses['private'][0].addr;
      }
      if (rawNode.addresses['private'] && rawNode.addresses['private'][1]) {
         node.addresses[1] = rawNode.addresses['private'][1].addr;
      }

      return node;
   }

   var that = {

      createNode: function(settings, callback) {
         connect(settings.identitySettings, function(error, identityToken) {
            
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
               url: settings.computeSettings.url + '/servers',
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
                  errorObject = null,
                  finalResult = {},
                  errorCreate;

               if (typeof (bodyString) === 'string') {
                  finalResult.rawResult = JSON.parse(bodyString);
               }

               if (error === null && 
                   (response.statusCode + '' === normalResponseCode)) {
                  nodeData = finalResult.rawResult.server;
                  finalResult.node = createSimpleNodeData(nodeData);
               }
               else{
                  finalResult.node = {logicName: settings.nodeParams.logicName, status: 'ERROR'};
                  errorCreate = new Error('can not createNode with paramters: ' + JSON.stringify(settings.nodeParams) + 
                                          '. statusCode: ' +  response.statusCode  + ' ,body string' + bodyString);
               }

               callback(errorCreate, finalResult);
            });
         });
      },

      listNodes: function(settings, callback) {
         connect(settings.identitySettings, function(error, identityToken) {
            var listRequestSettings = {
               method: 'GET',
               url: settings.computeSettings.url + '/servers/detail',
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
                  errorList = new Error('cannot retrieve node machines list from hp cloud. reason: ' + response.statusCode);
               }

               callback(errorList, finalResults);
            });
         });
      },

      deleteNode: function(settings, callback) {
         connect(settings.identitySettings, function(error, identityToken) {
            var deleteRequestSettings = {
               method: 'DELETE',
               headers: {
                  'X-Auth-Token': identityToken.access.token.id,
                  'Accept': 'application/json'
               },
               url: settings.computeSettings.url + '/servers/' + settings.nodeParams.id,
               proxy: proxyURL
            },
            errorDelete;

            request(deleteRequestSettings, function(error, response, bodyString) {

               var normalResponseCode = '204',
                  finalResult = {rawResult: undefined};

               if (error === null && (response.statusCode + '' === normalResponseCode)) {
                  finalResult.result = 'SUCCESS';
               }
               else {
                  finalResult.result = 'ERROR';
                  errorDelete = new Error('deleteNode failed for id: ' + JSON.stringify(settings.nodeParams) +
                                         'statusCode: ' + response.statusCode,
                                         + ', request settings: ' + JSON.stringify(deleteRequestSettings));
               }

               callback(errorDelete, finalResult);
            });
         });
      },

      createImage: function(settings, callback) {

         connect(settings.identitySettings, function(error, identityToken) {

            var createImageRequestSettings,
               imageParams = {
                  name: new Date().valueOf() + '-createdByStorm',
                  serverId: settings.imageParams.nodeId,
                  metadata: settings.imageParams.tags
               };
            underscore.extend(imageParams, settings.imageParams.vendorSpecificParams);
            
            createImageRequestSettings = {
               method: 'POST',
               url: settings.computeSettings.url + '/servers/' + settings.imageParams.nodeId + '/action',
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
                                             ', code: ' + response.statusCode);
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
         connect(settings.identitySettings, function(error, identityToken) {
            var requestSettings = {
               method: 'GET',
               url: settings.computeSettings.url + '/images/detail',
               headers: {
                  'X-Auth-Token': identityToken.access.token.id,
                  'Accept': 'application/json'
               },
               proxy: proxyURL
            },
            errorListImage,
            finalResult = {};

            request(requestSettings, function(error, response, bodyString) {
               var imagesData,
                  normalResponseCodes = {
                     '200': '1',
                     '203': '1'
                  };
               if (error !== null || (typeof (bodyString) !== 'string') ||
                  (normalResponseCodes[response.statusCode + ''] !== '1')
                  ) {
                     errorListImage = new Error('cannot retrieve images list from hp cloud. reason: ' + response.statusCode);
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
         connect(settings.identitySettings, function(error, identityToken) {
            var requestSettings = {
                  url: settings.computeSettings.url + '/images/' + settings.imageParams.imageId,
                  method: 'DELETE',
                  headers: {
                     'X-Auth-Token': identityToken.access.token.id
                  },
                  proxy: proxyURL
               },
               errorDeleteImage,
               finalResult = {rawResult: undefined};

            request(requestSettings, function(error, response, bodyString) {

               var normalResponseCodes = {
                  '200': '1',
                  '204': '1'
               };
               
               if (error !== null ||
                  (normalResponseCodes[response.statusCode + ''] !== '1')
                  ) {
                  errorDeleteImage = new Error('cannot deleteImage, error: ' + error + ', code: ' + response.statusCode);
                  finalResult.result = 'ERROR';
               }
               else {
                  finalResult.result = 'SUCCESS';
               }

               callback(errorDeleteImage, finalResult);
            });
         });
      }
   };

   return that;
};
