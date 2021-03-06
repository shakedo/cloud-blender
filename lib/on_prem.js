var request = require('request'),
    underscore = require('underscore'),
    crypto = require('crypto'),
    errorHandler = require('./error_handler.js'),
    parseString = require('xml2js').parseString,
    API_VERSION = '2013-02-01';

module.exports = (function() {

    var regionAzs = {
    };

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
            callback(new Error('Sau Paulo region has bug in az-c - disabling az usage for it'));
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
            callback(new Error ('failed to find azs'));
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

    function localCloudRequest(settings, callback) {
        var body,
            requestSettings,
            uriStr,
            nowDate = createNowDate();

        settings.params.Action = settings.action;
        settings.params.Version = API_VERSION;

        uriStr = createURIString(settings.params);
        //console.log('uri str is ' + uriStr);
        if (settings.method === 'POST') {
            //body = uriStr;
            body = JSON.stringify(settings.params);
        }

        requestSettings = {
            method: settings.method,
            url: (process.env.STORM_LOCALCLOUD_HOST || 'http://localhost:3001') + settings.path + ((settings.method === 'POST')?'':('?' + uriStr)),// TODO: make it configurable - http://localhost:3001
            headers: {
                /*'Authorization': authHeader,*/
                //'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
                'Content-Type': 'application/json',
                /*'Host': 'ec2.' + settings.region + '.amazonaws.com',*/
                'x-amz-date': nowDate
            },
            body: body,
            timeout: 120000
        };

//        if (tunnelingProxyURL !== undefined) {
//            requestSettings.proxy = tunnelingProxyURL;
//        }
        console.log('******* '+JSON.stringify(requestSettings));
        request(requestSettings, function (error, response, bodyString) {
            var errorRequest,
                result;

            if (!error && bodyString &&
                response.statusCode < 300) {
//                parseString(bodyString, function (errorParsing, jsonObj) {
//
//                    if (errorParsing) {
//                        errorRequest = new Error('bad parsing to XML of: ' + bodyString +
//                            ', parsing error is: ' + errorParsing.message);
//                    }
//                    else {
//                        result = jsonObj;
//                    }
//                    callback(errorRequest, result);
//                });

                callback(errorRequest, JSON.parse(bodyString));
            }
            else {
                errorRequest = new Error('problem in request: ' +
                    JSON.stringify(requestSettings) + ', description: ' + bodyString +
                    (response ? response.statusCode : 'request failed') +
                    ', requestError: ' + error);

                callback(errorRequest, result);
            }
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

        localCloudRequest(tagsSettings, function(errorTags, result) {
            if (errorTags && pollingCount > 1){
//            console.log('tags creation failed, polling count: ' + pollingCount + ' ' +errorTags);
                setTimeout(createTagsPolling, interval, settings, nodeId, pollingCount - 1, interval, callback);
            }
            else {
                callback(errorTags, result);
            }
        });
    }

    // the exported functions
    var that = {

        setProxy: function (proxyUrl) {
            tunnelingProxyURL = proxyUrl;
        },

        createPreparation: function (settings, callback) {
            callback(null,null);
        },

        describeAZs: function(settings, callback) {
            var generateSettings = {
                credentials: settings.regionContext.identitySettings.credentials,
                region: settings.regionContext.computeSettings.region,
                path: '/',
                method: 'GET',
                params: {},
                action: 'DescribeAvailabilityZones'
            };

            localCloudRequest(generateSettings, function(error, result) {
                var regionAZs = [];
                if (error) {
                    callback(error);
                    return;
                }

                underscore.each(result.DescribeAvailabilityZonesResponse.availabilityZoneInfo[0].item, function(zone) {
                    if (zone.zoneState[0] === 'available') {
                        regionAZs.push(zone.zoneName[0]);
                    }
                });


                callback(error, regionAZs);
            });

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
                providerName: 'onprem',
                pollingCount: 180
            };
        },

        listNodes: function(settings, callback) {
            var generateSettings = {
                credentials: settings.regionContext.identitySettings.credentials,
                region: settings.regionContext.computeSettings.region,
                path: '/',
                method: 'GET',
                params: {},
                action: 'DescribeInstances'
            };

            localCloudRequest(generateSettings, function(error, result) {
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

        createNode: function(settings, cloudServicesTestSettings, nodeIndex, callback) {

            getAvailabiltyZone(settings, function(errorAZ, az) {
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

                if (az) {
                    generateSettings.params['Placement.AvailabilityZone'] = az;
                }

                // adding (and possibly overriding) vendor specific params
                underscore.extend(generateSettings.params, settings.nodeParams.vendorSpecificParams);

                localCloudRequest(generateSettings, function(error, result) {

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
                        node = underscore.extend(node,createSimpleNodeData(rawNode));
                    }
                    finalResult.rawResult = result;
                    finalResult.node = node;

                    if (!error && settings.nodeParams.tags) {
                        createTagsPolling(settings, node.id, 3, 10000, function(errorTags, result) {
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

        deleteNode: function(settings, callback) {
            var deleteSettings = {
                    credentials: settings.regionContext.identitySettings.credentials,
                    region: settings.regionContext.computeSettings.region,
                    path: '/',
                    method: 'POST',
                    params: {'InstanceId.1': settings.node.id},
                    action: 'TerminateInstances'
                },
                finalResult = {};

            localCloudRequest(deleteSettings, function(error, result) {
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

            localCloudRequest(createImageSettings, function(error, result) {
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

                    localCloudRequest(tagsSettings, function(errorTags, result) {
                        callback(errorTags, finalResult);
                    });
                }
                else {
                    callback(error, finalResult);
                }
            });
        },

        listImages: function(settings, callback) {
            var listSettings = {
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
            localCloudRequest(listSettings, function(error, result) {
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

            localCloudRequest(deleteSettings, function(error, result) {
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

            localCloudRequest(deregisterSettings, function(error, result) {
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
        },

        associateAddress: function(settings, callback){
            settings.publicIp = settings.associatePairs.publicIp;
            that.disassociateAddress(settings, function(error) {
                var associateSettings = {
                        credentials: settings.regionContext.identitySettings.credentials,
                        region: settings.regionContext.computeSettings.region,
                        path: '/',
                        method: 'POST',
                        params: {'InstanceId': settings.associatePairs.instanceId,
                            'PublicIp': settings.associatePairs.publicIp},
                        action: 'AssociateAddress'
                    },
                    finalResult = {};
                localCloudRequest(associateSettings, function(error, result) {
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

        disassociateAddress: function(settings, callback){
            var disassociateSettings = {
                    credentials: settings.regionContext.identitySettings.credentials,
                    region: settings.regionContext.computeSettings.region,
                    path: '/',
                    method: 'POST',
                    params: {'PublicIp': settings.publicIp},
                    action: 'DisassociateAddress'
                },
                finalResult = {};

            localCloudRequest(disassociateSettings, function(error, result) {
                var confirmationString = 'SUCCESS';
                if (error) {
                    confirmationString = 'ERROR';
                }
                finalResult.rawResult = result;
                finalResult.result = confirmationString;
                callback(error, finalResult);
            });
        }
    };

    return that;
})();
