var request = require('request'),
   underscore = require('underscore'),
   crypto = require('crypto'),
   errorHandler = require('./error_handler.js'),
   parseString = require('xml2js').parseString;

module.exports = (function() {

   // internal members
   // ----------------
   var tunnelingProxyURL;


   // internal functions
   // ------------------
   function uriEscape(string) {                                                                                                                                                              
      var output = encodeURIComponent(string);
      output = output.replace(/[^A-Za-z0-9_.~\-%]+/g, escape);

      output = output.replace(/[*]/g, function(ch) {
         return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
      }); 

      return output;
   } 

   function createURIString(params) {
      var sortedKeysArr,
         i, length,
         uriString = '';

      sortedKeysArr = underscore.keys(params).sort();

      for (i = 0, length = sortedKeysArr.length; i < length; i++) {
         uriString += uriEscape(sortedKeysArr[i]) + '=' +
            uriEscape(params[sortedKeysArr[i]]);
         if (i !== length -1) {
            uriString += '&';
         }
      }
      return uriString;
   }

   function generateEC2Request(settings, callback) {
      var body,
         requestSettings,
         uriStr,
         signature,
         stringForSignature,
         paramExtended = underscore.extend({
            "Version":"2013-02-01",
            "Action":settings.action,
            "Timestamp": new Date().toISOString(),
            "SignatureVersion":"2",
            "SignatureMethod":"HmacSHA256",
            "AWSAccessKeyId": settings.credentials.accessKeyId
         }, settings.params);

      stringForSignature = settings.method + '\n' +
        'ec2.' + settings.region + '.amazonaws.com\n' + 
        settings.path + '\n';

      stringForSignature += createURIString(paramExtended);
      signature = crypto.createHmac('sha256', settings.credentials.secretAccessKey).update(stringForSignature).digest('base64');
      paramExtended.Signature = signature;
      uriStr = createURIString(paramExtended); 

      if (settings.method === 'POST') {
        body = uriStr;
     }

     requestSettings = {
        method: settings.method,
        url: 'http://ec2.' + settings.region + '.amazonaws.com'+ settings.path + '?' + uriStr,
        headers: {
           'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
        },
        body: body
     };

     if (tunnelingProxyURL !== undefined) {
        requestSettings.proxy = tunnelingProxyURL;
     }

     request(requestSettings, function(error, response, bodyString) {
        var errorRequest,
           result;

        if (!error && bodyString && 
            typeof (bodyString) === 'string' && 
               response.statusCode < 300 ) {
           parseString(bodyString, function(errorParsing, jsonObj) {

              if (errorParsing) {
                 errorRequest = new Error('bad parsing to XML of: '  + bodyString +
                                          ', parsing error is: ' + errorParsing.message);
              }
              else {
                 result = jsonObj;
              }
              callback(errorRequest, result);
              return;

           });
        }
        else{
           errorRequest = new Error('problem in request: ' + 
                                    JSON.stringify(requestSettings) + ', description: ' + bodyString +
                                    (response?response.statusCode:'request failed') + 
                                    ', requestError: ' + error);

           callback(errorRequest, result);
        }
     });
  }

   function createSimpleNodeData(rawNode) {
      var node = {
         id: rawNode.instanceId[0],
         status: rawNode.instanceState[0].name[0].toUpperCase(), // libCloud
         addresses: [null, null]
      };

      if (node.status === 'RUNNING') {
         node.status = 'ACTIVE';// make it aligned with libCloud
      }

      if (rawNode.privateIpAddress) {
         node.addresses[0] = (rawNode.privateIpAddress[0]);
      }

      if (rawNode.ipAddress) {
         node.addresses[1] = (rawNode.ipAddress[0]);
      }

      if (rawNode.tagSet) {
         node.tags = {};
         underscore.each(rawNode.tagSet, function(tagSet) {
            underscore.each(tagSet.item, function(item) {
               node.tags[item.key[0]] = item.value[0];
            });
         });
      }

      return node;
   }

   // the exported functions
   var that = {

      setProxy: function (proxyUrl) {
         tunnelingProxyURL = proxyUrl;
      },


      createRegionContext: function(regionSettings, limits) {
         return {
            identitySettings: {
               credentials: { 
                  accessKeyId: regionSettings.accessKey,
                  secretAccessKey: regionSettings.secretKey
               }
            },
            computeSettings: {
               region: regionSettings.region 
            },
            limits: limits,
            providerName: 'aws'
         };
      },

      listNodes: function(settings, callback) {
         var i, length, ec2, nodesCount = 0,
            generateSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'GET',
               params: {},
               action: 'DescribeInstances'
            };

         generateEC2Request(generateSettings, function(error, result) {
            var finalResults = {
               nodes: [],
               rawResult: result
            };
            if (result) {
               //console.log(JSON.stringify(result, null, '   '));
               underscore.each(result.DescribeInstancesResponse.reservationSet, function(group) {
                  underscore.each(group.item, function(item){
                     underscore.each(item.instancesSet, function(instanceSet) {
                        underscore.each(instanceSet.item, function(item) {
                           var node = createSimpleNodeData(item);
                           // terminated machines can confuse us
                           // other cloud vendors may not return them so 
                           // we skip them - they can be obtained using rawNodes
                           if (node.status !== 'TERMINATED'){
                              finalResults.nodes.push(node);
                           }
                        });
                     });
                  });
               });
            }
            callback(error, finalResults);
         });
      }, //listNodes

      createNode: function(settings, callback) {

         var generateSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {
                  ImageId: settings.nodeParams.imageId,
                  InstanceType: settings.nodeParams.instanceType,
                  KeyName: settings.nodeParams.keyName,
                  MinCount: 1,
                  MaxCount: 1
               },
               action: 'RunInstances'
            },
            finalResult = {
            },
            i, length,
            securityGroups = settings.nodeParams.securityGroups,
            userData = settings.nodeParams.userData;

         // adding securityGroups
         if (securityGroups) {
            for (i = 0, length = securityGroups.length; i < length; i++) {
               generateSettings.params['SecurityGroup.' + i] = securityGroups[i];
            }
         }

         // adding user data
         if (userData) {
            generateSettings.params.UserData = new Buffer(JSON.stringify(userData)).toString('base64');
         }

         // adding (and possibly overiding) vendor specific params
         underscore.extend(generateSettings.params, settings.nodeParams.vendorSpecificParams);

         generateEC2Request(generateSettings, function(error, result) {

            // we add tags synthethically since adding tags is not supported
            // in the RunInstance command like in hpcloud
            var node = {
                  tags: settings.nodeParams.tags
               }, 
               rawNode,
               tagsSettings,
               tagCount = 0;

            if (error) {
               node.status = 'ERROR';
            }
            else {
               rawNode = result.RunInstancesResponse.instancesSet[0].item[0];
               node = underscore.extend(node,createSimpleNodeData(rawNode));
            }
            finalResult.rawResult = result;
            finalResult.node = node;

            if (!error && settings.nodeParams.tags) {
               tagsSettings = {
                  credentials: settings.regionContext.identitySettings.credentials,
                  region: settings.regionContext.computeSettings.region,
                  path: '/',
                  method: 'POST',
                  params: {'ResourceId.1': node.id},
                  action: 'CreateTags'
               };
               underscore.each(settings.nodeParams.tags, function(value, key) {
                  tagsSettings.params['Tag.' + tagCount + '.Key'] = key;
                  tagsSettings.params['Tag.' + tagCount + '.Value'] = value;
                  tagCount++;
               });
               
               generateEC2Request(tagsSettings, function(errorTags, result) {
                  callback(errorTags, finalResult);
               });
            }
            else {
               callback(error, finalResult);
            }
         });
      },//createNode

      deleteNode: function(settings, callback) {
         var deleteSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {'InstanceId.1': settings.nodeParams.id},
               action: 'TerminateInstances'
            },
            finalResult = {};

         generateEC2Request(deleteSettings, function(error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });
      },// delete node

      createImage: function(settings, callback) {
         var createImageSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {
                  InstanceId: settings.imageParams.nodeId,
                  Name: new Date().valueOf() + '-createdByStorm',
                  NoReboot: true
               },
               action: 'CreateImage'
            },
            finalResult = {};

         if (settings.imageParams.vendorSpecificParams) {
            underscore.extend(createImageSettings.params, settings.imageParams.vendorSpecificParams);
         }

         generateEC2Request(createImageSettings, function(error, result) {
            var tagCount = 0,
               tagsSettings;
            finalResult.rawResult = result;
            if (result) {
               finalResult.imageId = result.CreateImageResponse.imageId[0];
            }

            if (!error && settings.imageParams.tags) {
               tagsSettings = {
                  credentials: settings.regionContext.identitySettings.credentials,
                  region: settings.regionContext.computeSettings.region,
                  path: '/',
                  method: 'POST',
                  params: {'ResourceId.1': finalResult.imageId},
                  action: 'CreateTags'
               };
               underscore.each(settings.imageParams.tags, function(value, key) {
                  tagsSettings.params['Tag.' + tagCount + '.Key'] = key;
                  tagsSettings.params['Tag.' + tagCount + '.Value'] = value;
                  tagCount++;
               });
               
               generateEC2Request(tagsSettings, function(errorTags, result) {
                  callback(errorTags, finalResult);
               });
            }
            else {
               callback(error, finalResult);
            }
         });
      },

      listImages: function(settings, callback) {
         var i, length, ec2, nodesCount = 0,
            listSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'GET',
               params: {
                  'Owner.1': 'self'
               },
               action: 'DescribeImages'
            };

         if (settings.vendorSpecificParams) {
            underscore.extend(listSettings.params, settings.vendorSpecificParams);
         }
         generateEC2Request(listSettings, function(error, result) {
            var finalResults = {
               images: [],
               rawResult: result
            };

            if (result) {

               finalResults.images = [];
               underscore.each(result.DescribeImagesResponse.imagesSet, function(imageSet) {
                  underscore.each(imageSet.item, function(item) {
                     var image = underscore.pick(item, 'imageId', 'name', 'imageState', 'tagSet'),
                        tags = {};
                     underscore.each(image.tagSet, function(tagSet) {
                        underscore.each(tagSet.item, function(tagItem) {
                           tags[tagItem.key[0]] = tagItem.value[0];
                        });
                     });

                     finalResults.images.push({
                        id: image.imageId[0],
                        status:  (image.imageState[0]==='available')?'ACTIVE':image.imageState[0].toUpperCase(),
                        name: image.name[0],
                        tags: tags
                     });
                  });
               });
            }
            callback(error, finalResults);
         });
      },

      deleteSnapshot: function(settings, callback) {
         var deleteSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {'SnapshotId': settings.snapshotId},
               action: 'DeleteSnapshot'
            },
            finalResult = {};

         generateEC2Request(deleteSettings, function(error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });
      },

      deregisterImage: function(settings, callback) {
         var deregisterSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {'ImageId': settings.imageParams.imageId},
               action: 'DeregisterImage'
            },
            finalResult = {};

         generateEC2Request(deregisterSettings, function(error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });

      },

      deleteImage: function(settings, callback) {
         var errorDeleteImage,
            finalResult = {
               rawResult: []
            },
            listSettings = {
               regionContext: settings.regionContext,
               vendorSpecificParams: {
                  'ImageId.1': settings.imageParams.imageId
               }
            },
            snapshotsToDelete = [],
            i, length, snapshotCounter = 0;


         function deleteSnapshotCB(errorDeleteSnapshot, resultDeleteSnapshot) {
            snapshotCounter++;
            if (errorDeleteSnapshot) {
               errorDeleteImage = errorHandler.concatError(errorDeleteImage, errorDeleteSnapshot);
               finalResult.result = 'ERROR';
            }

            finalResult.rawResult.push(resultDeleteSnapshot.rawResult);

            if (snapshotCounter === length) {
               callback(errorDeleteImage, finalResult);
            }
         }

         that.listImages(listSettings, function(errorList, resultList) {

            if (errorList || (
               resultList.images[0] && resultList.images[0].status !== 'ACTIVE')) {
               finalResult.result = 'ERROR';
               callback(new Error('problem in images state: ' + JSON.stringify(resultList.images[0]) + ', error: '+
                                  errorList), finalResult);
               return;
            }

            // @@@@@@@ should make sure all these loops are necessary
            underscore.each(resultList.rawResult.DescribeImagesResponse.imagesSet, function(imageSet) {
               underscore.each(imageSet.item, function(item) {
                  underscore.each(item.blockDeviceMapping, function(block) {
                     underscore.each(block.item, function(blockItem) {
                        underscore.each(blockItem.ebs, function(ebsItem) {
                           snapshotsToDelete.push(ebsItem.snapshotId[0]);
                        });
                     });
                  });
               });
            });

            that.deregisterImage(settings, function(errorDeregister, resultDeregister) {
               
               finalResult.result = 'SUCCESS';
               finalResult.rawResult.push(resultDeregister.rawResult);
               if (errorDeregister) {
                  errorDeleteImage = errorHandler.concatError(errorDeleteImage, errorDeregister);
                  finalResult.result = 'ERROR';
                  callback(errorDeleteImage, finalResult);
                  return;
               }

               for (i = 0, length = snapshotsToDelete.length; i < length; i++) {
                  that.deleteSnapshot({
                     regionContext: settings.regionContext,
                     snapshotId: snapshotsToDelete[i]
                  }, deleteSnapshotCB); 
               }
            });
         });
      }
   };

   return that;
})();
