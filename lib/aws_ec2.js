var request = require('request'),
   underscore = require('underscore'),
   crypto = require('crypto'),
   parseString = require('xml2js').parseString,
   async = require('async'),
   AWSError = require('./aws-error');



module.exports = (function() {

   var regionAzs = {
   };

   function getApiVersion(serviceType){
      return serviceType === 'ec2' ? '2015-04-15' : '2010-05-08';
   }


   function parseBodyString(str, callback){
      if(underscore.isString(str)){
         parseString(str, callback);
      }
      else{
         callback(null,null);
      }
   }

   // this function build the regionAzs data structure.
   // if it cant find a record - it queries the cloud
   // if it fails - it stops querying the cloud
   // This must be called dynamically the first time the lib is being loaded
   // since ec2 has a lot of mess with AZs
   function getAvailabiltyZone(settings, callback) {
      var region = settings.regionContext.computeSettings.region,
         regionAz = regionAzs[region],
         zones,
         index,
         selectedRegion;

      if (region === 'sa-east-1') {
         callback(new AWSError('Sau Paulo region has bug in az-c - disabling az usage for it'));
         return;
      }

      if (!regionAz) {
         that.describeAZs(settings, function(error, azs) {
            if (error) {
               regionAzs[region] = {counter: -1};// indicating error happened and not to try again
               callback(error);
               return;
            }
            regionAzs[region] = {
               counter: 1, // 1 is for incrementing the counter since we use 0 in this call
               zones: azs
            };

            callback(undefined, azs[0]);
         });
         return;
      }

      zones = regionAz.zones;
      index = regionAz.counter;
      if (index === -1) { // we failed in a previous call
         callback(new AWSError('failed to find azs'));
         return;
      }
      selectedRegion = zones[index%(zones.length)];
      regionAz.counter ++;
      callback(undefined, selectedRegion);
   }
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

   function hash(data) {
      return crypto.createHash('sha256').update(new Buffer(data)).digest('hex');
   }

   function sign(key, data, digest) {
      return crypto.createHmac('sha256', key).update(data).digest(digest);
   }

   function createNowDate() {
      return (new Date()).toISOString().replace(/[:\-]|\.\d{3}/g, '');
   }

   // STEP 1
   function canonicalRequest(settings, nowDate) {
      var canonical = '';

      canonical += settings.method + '\n'; // HTTPRequestMethod
      canonical += settings.path + '\n';
      canonical += ((settings.method === 'GET')?createURIString(settings.params):'') + '\n'; // CanonicalQueryString
      canonical += 'host:' + settings.serviceType + '.' + settings.region + '.amazonaws.com\n' +
         'x-amz-date:' + nowDate + '\n\n';
      canonical += 'host;x-amz-date' + '\n';
      
      if (settings.method === 'POST') {
         canonical += hash(createURIString(settings.params));
      }
      else { // no body in GET
         canonical += hash('');
      }
      
      //console.log('\ncanonical:\n$' + canonical + '$');
      return canonical;
   }

   // STEP 2
   function stringToSign(settings, nowDate) {
      var str = '';
      str += 'AWS4-HMAC-SHA256\n'; // Algorithm
      str += nowDate + '\n'; // RequestDate

      // CredentialScope
      str += nowDate.substr(0,8) + '/';
      str += settings.region + '/';
      str += settings.serviceType + '/';
      str += 'aws4_request\n';

      // HashedCanonicalRequest
      str += hash(canonicalRequest(settings, nowDate));
      //console.log('\nstringToSign:\n$' + str+'$');
      return str;
   }

   // STEP 3
   function signature(settings, nowDate) {
      var kDate = sign('AWS4' + settings.credentials.secretAccessKey, nowDate.substr(0,8)),
         kRegion = sign(kDate, settings.region),
         kService = sign(kRegion, settings.serviceType),
         kCredentials = sign(kService, 'aws4_request');

      return sign(kCredentials, stringToSign(settings, nowDate), 'hex');
   }

   // STEP 4
   // This is the main of the signature process for POST method
   function generateAuthorizationHeader(settings, nowDate) {
      var authHeader = '';

      authHeader = 'AWS4-HMAC-SHA256 ';
      
      authHeader += 'Credential=' + settings.credentials.accessKeyId + '/';
      authHeader += nowDate.substr(0,8) + '/';
      authHeader += settings.region + '/';
      authHeader += settings.serviceType + '/';
      authHeader += 'aws4_request, ';

      authHeader += 'SignedHeaders=host;x-amz-date, ';
      authHeader += 'Signature=' + signature(settings, nowDate);

      //console.log('\nauth header:\n' + authHeader);
      return authHeader;
   }

   function generateEC2Request(settings, callback){
      settings.serviceType = 'ec2';
      generateAWSRequest(settings, callback);
   }

   function generateIAMRequest(settings, callback){
      settings.serviceType = 'iam';
      generateAWSRequest(settings, callback);
   }

   function generateAWSRequest(settings, callback) {
      var body,
         requestSettings,
         uriStr,
         authHeader,
         domainSuffix = ((settings.region === 'cn-north-1')?'.amazonaws.com.cn':'.amazonaws.com'),
         requestUrlBase = 'https://'+ settings.serviceType + (settings.serviceType === 'ec2' ? '.' + settings.region : '') + domainSuffix,
         nowDate = createNowDate();


      settings.params.Action = settings.action;
      settings.params.Version = getApiVersion(settings.serviceType);
      authHeader = generateAuthorizationHeader(settings, nowDate);

      uriStr = createURIString(settings.params);
      //console.log('uri str is ' + uriStr);
      if (settings.method === 'POST') {
         body = uriStr;
      }

      requestSettings = {
         method: settings.method,
         url: requestUrlBase + settings.path + ((settings.method === 'POST')?'':('?' + uriStr)),
         headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            'Host': settings.serviceType + '.' + settings.region + '.amazonaws.com',
            'x-amz-date': nowDate
         },
         body: body,
         timeout: 120000
      };

      if (tunnelingProxyURL !== undefined) {
         requestSettings.proxy = tunnelingProxyURL;
      }


      //console.log(requestSettings);

      request(requestSettings, function (error, response, bodyString) {
         var errorRequest;

         //we always try and parse the body string , even if we have an error. It might contains important information
         //especially for StatusCode 400 errors . This information will be added to the providerError property
         //if bodyString is null it will not return an error but jsonObj will be null
         parseBodyString(bodyString, function(errParsing, jsonObj){
            if(errParsing){
               error = error || new AWSError();
               error.message += 'bad parsing to XML of: ' + bodyString + ', parsing error is: ' + errParsing.message;
            }
            if(!jsonObj || error || response.statusCode>= 300){
               errorRequest = new AWSError('problem in request: ' +
                  JSON.stringify(requestSettings) + ', description: ' + bodyString +
                  (response ? response.statusCode : 'request failed') + 'requestError: ' + error,
                  jsonObj);
               callback(errorRequest);
            }
            else{
               callback(null, jsonObj)
            }
         });

      });
   }

   function createSimpleNodeData(rawNode) {
      var node = {
         id: rawNode.instanceId[0],
         status: rawNode.instanceState[0].name[0].toUpperCase(), // libCloud
         addresses: [null, null],
         releaseInfo: {}
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


   function createTagsPolling(settings, nodeId, pollingCount, interval, callback) {

      var tagsSettings = {
            credentials: settings.regionContext.identitySettings.credentials,
            region: settings.regionContext.computeSettings.region,
            path: '/',
            method: 'POST',
            params: {'ResourceId.1': nodeId},
            action: 'CreateTags'
         },
         tagCount = 0;

      underscore.each(settings.nodeParams.tags, function(value, key) {
         tagsSettings.params['Tag.' + tagCount + '.Key'] = key;
         tagsSettings.params['Tag.' + tagCount + '.Value'] = value;
         tagCount++;
      });
               
      generateEC2Request(tagsSettings, function(errorTags, result) {
         if (errorTags && pollingCount > 1){
//            console.log('tags creation failed, polling count: ' + pollingCount + ' ' +errorTags);
            setTimeout(createTagsPolling, interval, settings, nodeId, pollingCount - 1, interval, callback);
         }
         else {
            callback(errorTags, result);
         }
      });
   }

   function removeSecurityGroup(settings, groupInfo, callback){
      var removeSecurityGroup = {
         credentials: settings.regionContext.identitySettings.credentials,
         region: settings.regionContext.computeSettings.region,
         path: '/',
         method: 'POST',
         params: {
            GroupName: groupInfo.groupName
         },
         action: 'DeleteSecurityGroup'
      };

      generateEC2Request(removeSecurityGroup, function (error) {
         callback(error);
      });
   }

   function createSecurityGroup(settings, groupInfo, callback) {

      var createSecurityGroup = {
            credentials: settings.regionContext.identitySettings.credentials,
            region: settings.regionContext.computeSettings.region,
            path: '/',
            method: 'POST',
            params: {
               GroupName: groupInfo.groupName,
               GroupDescription: groupInfo.groupDescription
            },
            action: 'CreateSecurityGroup'
         };

      generateEC2Request(createSecurityGroup, function (error) {
         //what do we really want to do if we already have a duplicate group should we continue ?  Do we want to check getEc2ErrorCode(error) !== 'InvalidGroup.Duplicate' ?
         if (error) {
            callback(error);
            return;
         }
         var addIngressRules = {
            credentials: settings.regionContext.identitySettings.credentials,
            region: settings.regionContext.computeSettings.region,
            path: '/',
            method: 'POST',
            params: {
               GroupName: groupInfo.groupName
            },
            action: 'AuthorizeSecurityGroupIngress'
         }

         groupInfo.ingressRules.forEach(function (rule, index) {
            index++;
            //we can use either port to define a single port or fromPort toPort.
            if(rule.port){
               rule.fromPort = rule.toPort = rule.port;
            }
            addIngressRules.params['IpPermissions.' + index + '.' + 'IpProtocol'] = rule.protocol ? rule.protocol : 'tcp';
            addIngressRules.params['IpPermissions.' + index + '.' + 'FromPort'] = rule.fromPort;
            addIngressRules.params['IpPermissions.' + index + '.' + 'ToPort'] = rule.toPort;
            addIngressRules.params['IpPermissions.' + index + '.' + 'IpRanges.1.CidrIp'] = rule.ipRange === 'all' ? '0.0.0.0/0' : rule.ipRange;
         });
         generateEC2Request(addIngressRules, function (error, result) {
            callback(error, result);
         });
      });
   }

   function removeKeyPair(settings, keyPair, callback) {

      var deleteKeyPair = {
         credentials: settings.regionContext.identitySettings.credentials,
         region: settings.regionContext.computeSettings.region,
         path: '/',
         method: 'POST',
         params: {
            KeyName: keyPair.name
         },
         action: 'DeleteKeyPair'
      };

      generateEC2Request(deleteKeyPair, function (error) {
         callback(error);
      });
   }

   function importKeyPair(settings, keyPair, callback) {

      var importKeyPair = {
         credentials: settings.regionContext.identitySettings.credentials,
         region: settings.regionContext.computeSettings.region,
         path: '/',
         method: 'POST',
         params: {
            KeyName: keyPair.name,
            //API always sends base64 encoded public key. Input can be either raw or base64
            PublicKeyMaterial: keyPair.publicKey ? new Buffer(keyPair.publicKey).toString("base64") : keyPair.publicKeyBase64
         },
         action: 'ImportKeyPair'
      };

      generateEC2Request(importKeyPair, function (error) {
         callback(error);
      });
   }



   // the exported functions
   var that = {

      setProxy: function (proxyUrl) {
         tunnelingProxyURL = proxyUrl;
      },

      createPreparation: function (settings, callback) {
         callback(null, null);
      },

      describeAZs: function (settings, callback) {
         var generateSettings = {
            credentials: settings.regionContext.identitySettings.credentials,
            region: settings.regionContext.computeSettings.region,
            path: '/',
            method: 'GET',
            params: {},
            action: 'DescribeAvailabilityZones'
         };

         generateEC2Request(generateSettings, function (error, result) {
            var regionAZs = [];
            if (error) {
               callback(error);
               return;
            }
            underscore.each(result.DescribeAvailabilityZonesResponse.availabilityZoneInfo[0].item, function (zone) {
               if (zone.zoneState[0] === 'available') {
                  regionAZs.push(zone.zoneName[0]);
               }
            });


            callback(error, regionAZs);
         });

      },

      createRegionContext: function (regionSettings, limits) {
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
            providerName: 'aws',
            pollingCount: 180
         };
      },

      listNodes: function (settings, callback) {
         var generateSettings = {
            credentials: settings.regionContext.identitySettings.credentials,
            region: settings.regionContext.computeSettings.region,
            path: '/',
            method: 'GET',
            params: {},
            action: 'DescribeInstances'
         };

         generateEC2Request(generateSettings, function (error, result) {
            var finalResults = {
               nodes: [],
               rawResult: result
            };
            if (result) {
               //console.log(JSON.stringify(result, null, '   '));
               underscore.each(result.DescribeInstancesResponse.reservationSet, function (group) {
                  underscore.each(group.item, function (item) {
                     underscore.each(item.instancesSet, function (instanceSet) {
                        underscore.each(instanceSet.item, function (item) {
                           var node = createSimpleNodeData(item);
                           // terminated machines can confuse us
                           // other cloud vendors may not return them so 
                           // we skip them - they can be obtained using rawNodes
                           if (node.status !== 'TERMINATED') {
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

      createNode: function (settings, cloudServicesTestSettings, nodeIndex, callback) {

         getAvailabiltyZone(settings, function (errorAZ, az) {
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
                     MaxCount: 1,
                     'BlockDeviceMapping.1.DeviceName': '/dev/sdb',
                     'BlockDeviceMapping.1.VirtualName': 'ephemeral0'
                  },
                  action: 'RunInstances'
               },
               finalResult = {},
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

            if (az) {
               generateSettings.params['Placement.AvailabilityZone'] = az;
            }

            // adding (and possibly overriding) vendor specific params
            underscore.extend(generateSettings.params, settings.nodeParams.vendorSpecificParams);

            generateEC2Request(generateSettings, function (error, result) {

               // we add tags synthetically since adding tags is not supported
               // in the RunInstance command like in hpcloud
               var node = {
                     tags: settings.nodeParams.tags
                  },
                  rawNode;

               if (error) {
                  node.status = 'ERROR';
               }
               else {
                  rawNode = result.RunInstancesResponse.instancesSet[0].item[0];
                  node = underscore.extend(node, createSimpleNodeData(rawNode));
               }
               finalResult.rawResult = result;
               finalResult.node = node;

               if (!error && settings.nodeParams.tags) {
                  createTagsPolling(settings, node.id, 3, 10000, function (errorTags, result) {
                     if (errorTags) {
                        node.status = 'ERROR_TAGS';
                     }
                     callback(errorTags, finalResult);
                  });
               }
               else {
                  callback(error, finalResult);
               }
            });
         });
      },//createNode

      deleteNode: function (settings, callback) {
         var deleteSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {'InstanceId.1': settings.node.id},
               action: 'TerminateInstances'
            },
            finalResult = {};

         generateEC2Request(deleteSettings, function (error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });
      },// delete node

      createImage: function (settings, callback) {
         var createImageSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {
                  InstanceId: settings.imageParams.nodeId,
                  Name: new Date().valueOf() + '-createdByStorm',
                  'BlockDeviceMapping.1.DeviceName': '/dev/sda1',
                  'BlockDeviceMapping.1.Ebs.VolumeType': 'gp2'
                  //'BlockDeviceMapping.1.Ebs.VolumeType': 'io1',
                  //'BlockDeviceMapping.1.Ebs.Iops': 300,
                  //'BlockDeviceMapping.1.Ebs.VolumeSize': 10
               },
               action: 'CreateImage'
            },
            finalResult = {};

         if (settings.imageParams.vendorSpecificParams) {
            underscore.extend(createImageSettings.params, settings.imageParams.vendorSpecificParams);
         }

         generateEC2Request(createImageSettings, function (error, result) {
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
               underscore.each(settings.imageParams.tags, function (value, key) {
                  tagsSettings.params['Tag.' + tagCount + '.Key'] = key;
                  tagsSettings.params['Tag.' + tagCount + '.Value'] = value;
                  tagCount++;
               });

               generateEC2Request(tagsSettings, function (errorTags, result) {
                  callback(errorTags, finalResult);
               });
            }
            else {
               callback(error, finalResult);
            }
         });
      },

      listImages: function (settings, callback) {
         var listSettings = {
            credentials: settings.regionContext.identitySettings.credentials,
            region: settings.regionContext.computeSettings.region,
            path: '/',
            method: 'GET',
            params: {
               'Owner.1': 'self'
            },
            action: 'DescribeImages'
         }, snapSettings = {
            credentials: settings.regionContext.identitySettings.credentials,
            region: settings.regionContext.computeSettings.region,
            path: '/',
            method: 'GET',
            params: {
               'Owner.1': 'self'
            },
            action: 'DescribeSnapshots'
         }, snapShots = {};

         if (settings.vendorSpecificParams) {
            underscore.extend(listSettings.params, settings.vendorSpecificParams);
         }
         generateEC2Request(listSettings, function (error, result) {


            generateEC2Request(snapSettings, function (errorSnap, resultSnap) {

               underscore.each(resultSnap.DescribeSnapshotsResponse.snapshotSet[0].item, function (snapShot) {

                  snapShots[snapShot.snapshotId[0]] = snapShot.startTime[0];

               })

               var finalResults = {
                  images: [],
                  rawResult: result
               };

               if (result) {

                  finalResults.images = [];
                  underscore.each(result.DescribeImagesResponse.imagesSet, function (imageSet) {
                     underscore.each(imageSet.item, function (item) {

                        var image = underscore.pick(item, 'imageId', 'name', 'imageState', 'tagSet'),
                           tags = {}, creationTime;

                        var i,
                           loopIndex = item.blockDeviceMapping[0].item.length,
                           ebsINdex;

                        for (i = 0; i < loopIndex; i++) {
                           if (item.blockDeviceMapping[0].item[i].ebs) {
                              ebsINdex = i;
                              break;
                           }
                        }

                        if (item.imageState[0] === 'available') { //only if the image is available we can be sure that we have the snapshotId
                           creationTime = snapShots[item.blockDeviceMapping[0].item[ebsINdex].ebs[0].snapshotId[0]];
                        }
                        else {
                           creationTime = Date.now();
                        }
                        underscore.each(image.tagSet, function (tagSet) {
                           underscore.each(tagSet.item, function (tagItem) {
                              tags[tagItem.key[0]] = tagItem.value[0];
                           });
                        });

                        finalResults.images.push({
                           id: image.imageId[0],
                           status: (image.imageState[0] === 'available') ? 'ACTIVE' : image.imageState[0].toUpperCase(),
                           name: image.name[0],
                           creationTime: creationTime,
                           tags: tags
                        });
                     });
                  });
               }
               callback(error, finalResults);
            });
         });
      },

      deleteSnapshot: function (settings, callback) {
         var deleteSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {'SnapshotId': settings.snapshotId},
               action: 'DeleteSnapshot'
            },
            finalResult = {};

         generateEC2Request(deleteSettings, function (error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });
      },

      deregisterImage: function (settings, callback) {
         var deregisterSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {'ImageId': settings.imageParams.imageId},
               action: 'DeregisterImage'
            },
            finalResult = {};

         generateEC2Request(deregisterSettings, function (error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });

      },

      deleteImage: function (settings, callback) {
         var errorDeleteImage = new AWSError(),
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
               errorDeleteImage.appendError(errorDeleteSnapshot);
               finalResult.result = 'ERROR';
            }

            finalResult.rawResult.push(resultDeleteSnapshot.rawResult);

            if (snapshotCounter === length) {
               //we call the getCallbackError that returns null if there no errors in the errorDeleteImage.
               //we do this because we are iterating and the errorDeleteImage can contain 0 or more errors.
               //Instead of doing errorDeleteImage.length > 0 ? errorDeleteImage : null we do this logic in getCallbackError()
               callback(errorDeleteImage.getCallbackError(), finalResult);
            }
         }

         that.listImages(listSettings, function (errorList, resultList) {
            var finalError;
            if (errorList || (
               resultList.images[0] && resultList.images[0].status !== 'ACTIVE')) {
               finalResult.result = 'ERROR';
               finalError =  errorList ? errorList : new AWSError('problem in images state. Status not ACTIVE: ' + JSON.stringify(resultList.images[0]));
               callback(finalError, finalResult);
               return;
            }

            // @@@@@@@ should make sure all these loops are necessary
            underscore.each(resultList.rawResult.DescribeImagesResponse.imagesSet, function (imageSet) {
               underscore.each(imageSet.item, function (item) {
                  underscore.each(item.blockDeviceMapping, function (block) {
                     underscore.each(block.item, function (blockItem) {
                        underscore.each(blockItem.ebs, function (ebsItem) {
                           snapshotsToDelete.push(ebsItem.snapshotId[0]);
                        });
                     });
                  });
               });
            });

            that.deregisterImage(settings, function (errorDeregister, resultDeregister) {

               finalResult.result = 'SUCCESS';
               finalResult.rawResult.push(resultDeregister.rawResult);
               if (errorDeregister) {
                  errorDeleteImage.appendError(errorDeregister);
                  finalResult.result = 'ERROR';
                  callback(errorDeleteImage.getCallbackError(), finalResult);
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
      },

      associateAddress: function (settings, callback) {
         settings.publicIp = settings.associatePairs.publicIp;
         that.disassociateAddress(settings, function (error) {
            var associateSettings = {
                  credentials: settings.regionContext.identitySettings.credentials,
                  region: settings.regionContext.computeSettings.region,
                  path: '/',
                  method: 'POST',
                  params: {
                     'InstanceId': settings.associatePairs.instanceId,
                     'PublicIp': settings.associatePairs.publicIp
                  },
                  action: 'AssociateAddress'
               },
               finalResult = {};
            generateEC2Request(associateSettings, function (error, result) {
               var confirmationString = 'SUCCESS';
               if (error) {
                  confirmationString = 'ERROR';
               }
               finalResult.rawResult = result;
               finalResult.result = confirmationString;
               callback(error, finalResult);
            });
         });
      },

      disassociateAddress: function (settings, callback) {
         var disassociateSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {'PublicIp': settings.publicIp},
               action: 'DisassociateAddress'
            },
            finalResult = {};

         generateEC2Request(disassociateSettings, function (error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });
      },

      allocateAddress: function (settings, callback) {
         var finalResult = {},
            allocateSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {},
               action: 'AllocateAddress'
            };

         generateEC2Request(allocateSettings, function (error, result) {
            if (result) {
               finalResult.result = result.AllocateAddressResponse.publicIp[0];
               finalResult.rawResult = result;
            }
            callback(error, finalResult);
         });
      },

      releaseAddress: function (settings, callback) {
         var finalResult = {},
            paramsObj = (settings.requestInfo) ? {'AllocationId': settings.requestInfo} : {'PublicIp': settings.ip};
         releaseSettings = {
            credentials: settings.regionContext.identitySettings.credentials,
            region: settings.regionContext.computeSettings.region,
            path: '/',
            method: 'POST',
            params: paramsObj,
            action: 'ReleaseAddress'
         };

         generateEC2Request(releaseSettings, function (error, result) {
            if (result) {
               finalResult.result = result.ReleaseAddressResponse.return[0];
               finalResult.ip = settings.ip;
               finalResult.rawResult = result;
            }
            callback(error, finalResult);
         });
      },

      getAddresses: function (settings, callback) {
         var resultObj = {},
            addressSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'GET',
               params: {},
               action: 'DescribeAddresses'
            }

         generateEC2Request(addressSettings, function (error, result) {
            if (!error) {

               underscore.each(result.DescribeAddressesResponse.addressesSet[0].item, function (item) {
                  resultObj[item.publicIp] = item.allocationId;

               })
            }
            callback(error, resultObj);
         });
      },

      modifyLaunchPermissions: function (settings, callback) {
         var modifyLaunchPermissionsSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {ImageId: settings.imageId},
               action: 'ModifyImageAttribute'
            },
            finalResult = {},
            operation = settings.bAdd ? 'Add' : 'Remove',
            scope,
            accounts;

         //accepts either a single accountId or an array
         accounts = underscore.isArray(settings.accountIds) ? settings.accountIds : [settings.accountIds];
         accounts.forEach(function (account, index) {
            scope = account === 'all' ? 'Group' : 'UserId'; //if accountId = all it means all accounts (public)
            index++;
            modifyLaunchPermissionsSettings.params['LaunchPermission.' + operation + '.' + index + '.' + scope] = account;
         });
         generateEC2Request(modifyLaunchPermissionsSettings, function (error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });
      },

      resetLaunchPermissions: function (settings, callback) {
         var resetLaunchPermissionsSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'POST',
               params: {
                  ImageId: settings.imageId,
                  Attribute: 'launchPermission'
               },
               action: 'ResetImageAttribute'
            },
            finalResult = {};

         generateEC2Request(resetLaunchPermissionsSettings, function (error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.rawResult = result;
            finalResult.result = confirmationString;
            callback(error, finalResult);
         });
      },

      getLaunchPermissions: function (settings, callback) {
         var getLaunchPermissionsSettings = {
               credentials: settings.regionContext.identitySettings.credentials,
               region: settings.regionContext.computeSettings.region,
               path: '/',
               method: 'GET',
               params: {
                  ImageId: settings.imageId,
                  Attribute: 'launchPermission'
               },
               action: 'DescribeImageAttribute'
            },
            finalResult = {};

         generateEC2Request(getLaunchPermissionsSettings, function (error, result) {
            var confirmationString = 'SUCCESS';
            if (error) {
               confirmationString = 'ERROR';
            }
            finalResult.result = confirmationString;

            var userIds = [];
            if (!error) {
               underscore.each(result.DescribeImageAttributeResponse.launchPermission[0].item, function (account) {
                  if (account.userId) {
                     userIds.push(account.userId[0]);
                  }
                  else if (account) {
                     userIds.push(account.group[0]);
                  }
               });
            }
            finalResult.rawResult = userIds;
            callback(error, finalResult);
         });
      },


      //Checks the validation of the credentials and that they match the accountId
      //returns:
      //0 - if validation success
      //-1 - if credentials are Ok but the account doesnt match
      //-2 - if credentials are invalid
      //error - any other error
      validateCredentials: function (settings, callback) {

         var credentialValidationSettings = {
               credentials: settings.credentials,
               region: 'us-east-1',  //we just need a default valid region to prepare the AUTHPARAMS. The credentials are the same for all regions
               path: '/',
               method: 'GET',
               params: {},
               action: 'GetUser'
            },
            finalResult = {};

         function checkMatchAccountId(str, accountId){
            var match = new RegExp('arn:aws:iam::(.*?):(?:user|root)').exec(str);
            return match && match[1] === accountId;
         }

         generateIAMRequest(credentialValidationSettings, function (error, result) {
            if (!error) {
               callback(null, checkMatchAccountId(result.GetUserResponse.GetUserResult[0].User[0].Arn[0],settings.accountId) ? 0 : -1);
            }
            else {
               switch (error.providerErrorCode) {
                  case  'AccessDenied':
                     //AccessDenied means that the securityCredentials are Ok but they just don't have permission to perform this action.
                     //So now we try to extract the account Id from the error message , and if it matches the accountId then we know that all credentials match
                     result = checkMatchAccountId(error.providerErrorMessage, settings.accountId) ? 0 : -1;
                     callback(null, result);
                     break;
                  case 'InvalidClientTokenId':  //  The X.509 certificate or AWS access key ID provided does not exist in our records
                  case 'SignatureDoesNotMatch': // securityKey doesnt match accessKeyId
                  case 'IncompleteSignature':   //The request signature does not conform to AWS standards
                     callback(null, -2);   //credentials not valid
                     break;
                  default: //any other error means that something else was wrong with the request (e.g. network error) so we return the error itself.
                     callback(error);

               }
            }
         });
      },

      //configures account with securityGroups and keyPair
      //Input:
      //removeOld - if true , removes the old groups/keyPairs with same names if they exist before creating the new ones
      //securityGroups - Array of security groups to create
      //keyPairs - Array of Key pairs to create
      configureAccount: function (settings, finalCallback) {
         var asyncTasks = [];
         if (settings.securityGroups) {
            asyncTasks.push(function (callback) {
               that.createSecurityGroups(settings, callback);
            })
         }
         if (settings.keyPairs) {
            asyncTasks.push(function (callback) {
               that.createKeyPairs(settings, callback);
            })
         }
         async.series(asyncTasks, finalCallback);
      },

      createSecurityGroups: function (settings, finalCallback) {
         if (!settings.securityGroups) {
            finalCallback(new AWSError('No data for security group creation.'));
            return;
         }
         //should this be parallel or series ?
         async.each(settings.securityGroups, function (group, callback) {
            var preTasks = [];
            if(settings.removeOld){ //delete the old security group if it exists
               preTasks.push( function(callback){
                  removeSecurityGroup(settings, group, function(error){
                     //if there is no security group by this name then we simply continue . Any other error we return
                     if(error && error.providerErrorCode !== 'InvalidGroup.NotFound'){
                        callback(error);
                        return;
                     }
                     callback();
                  })
               });
            }
            async.series(preTasks,function(err){
               if(err){
                  callback(err)
                  return;
               }
               createSecurityGroup(settings, group, function (err) {
                  callback(err);
               })
            });

         },finalCallback);
      },

      createKeyPairs: function (settings, finalCallback) {
         if (!settings.keyPairs) {
            finalCallback(new AWSError('No data for key pair creation'));
            return;
         }
         //should this be parallel or series ?
         async.each(settings.keyPairs, function (keyPair, callback) {
            var preTasks = [];
            if(settings.removeOld){ //delete the old security group if it exists
               preTasks.push( function(callback){
                  removeKeyPair(settings, keyPair, function(error){
                     //if there is no security group by this name then we simply continue . Any other error we return
                     if(error && (error.providerErrorCode !== 'InvalidKeyPair.NotFound')){
                        callback(error);
                        return;
                     }
                     callback();
                  })
               });
            }
            async.series(preTasks,function(err){
               if(err){
                  callback(err)
                  return;
               }
               importKeyPair(settings, keyPair, function (err) {
                  callback(err);
               })
            });

         },finalCallback);
      }

   }
   return that;

})();
