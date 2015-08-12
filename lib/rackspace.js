var request = require('request'),
    underscore = require('underscore'),
    proxyUrl, token;


function createSimpleNodeData(rawNode) {
    var node = {
        id: rawNode.id,
        status: rawNode.status,
        addresses: [null, null],
        tags: {}
    };

    if (rawNode.addresses.private) {
        underscore.each(rawNode.addresses.private, function (item) {
            if (item.version === 4) {
                node.addresses[0] = item.addr;
            }
        });
    }

    if (rawNode.addresses.public) {
        underscore.each(rawNode.addresses.public, function (item) {
            if (item.version === 4) {
                node.addresses[1] = item.addr;
            }
        });
    }

    if (rawNode.metadata) {
        underscore.each(rawNode.metadata, function (item, key) {
            node.tags[key] = item;
        });
    }

    return node;
}

function setProxy(proxy) {
    proxyUrl = proxy;
}

function getProxy() {
    return proxyUrl;
}

function connect(identitySettings, callback) {
    // the threshold is 1 hour to be on the safe side
    // (the token expires every 12hours)
    var DIFF_THRESH_HOURS = 1,
        expires = '',
        hourDiff = 0,
        requestSettings;

    if (token) {
        identitySettings.identityToken = token;
    }

    if (identitySettings.identityToken && identitySettings.identityToken.access && identitySettings.identityToken.access.token &&
        'id' in identitySettings.identityToken.access.token &&
        'expires' in identitySettings.identityToken.access.token) {

        expires = identitySettings.identityToken.access.token.expires;
        hourDiff = (new Date(expires).getTime() - new Date().getTime()) / 1000 / 60 / 60;

        if (hourDiff > DIFF_THRESH_HOURS) {
            return callback(null, identitySettings.identityToken);
        }
    }

    var auth = {
        "RAX-KSKEY:apiKeyCredentials": {
            "username": identitySettings.regionContext.identitySettings.credentials.username,
            "apiKey": identitySettings.regionContext.identitySettings.credentials.apiKey
        }
    };

    requestSettings = {
        method: 'POST',
        url: 'https://identity.api.rackspacecloud.com/v2.0/tokens',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({auth: auth}),
        proxy: getProxy()
    };

    request(requestSettings, function (error, response, bodyString) {
        var identityToken;

        if ((error) || ((response) && (response.statusCode !== 200))) {
            return callback(new Error('cannot retrieve token from rackspace. reason: ' +
            (response ? response.statusCode : ' empty response - probably bad tunneling proxy')));
        }

        identityToken = JSON.parse(bodyString); //.access.token;
        identitySettings.identityToken = identityToken;
        setToken(identityToken);
        callback(null, identityToken);
    });
}

function setToken(identityToken) {
    token = identityToken;
}

function getToken() {
    return token;
}

function getEndpoint(success, region) {
    var compute = underscore.find(success.access.serviceCatalog, function (item) {
        if (item.type === 'compute')
            return true;
        else
            return false;
    });
    var endpoint;
    if (compute && compute.endpoints) {
        endpoint = underscore.find(compute.endpoints, function (item) {
            if (item.region === region)
                return true;
            else
                return false;
        });
    }
    return endpoint;
}

module.exports = {

    setProxy: function (proxyUrl) {
        setProxy(proxyUrl);
    },

    createPreparation: function (settings, callback) {
        callback(null, null);
    },

    createRegionContext: function (regionSettings, limits) {
        return {
            identitySettings: {
                credentials: {
                    username: regionSettings.accessKey,
                    apiKey: regionSettings.secretKey
                }
            },
            computeSettings: {
                region: regionSettings.region
            },
            limits: limits,
            providerName: 'rackspace',
            pollingCount: 180
        };
    },

    listNodes: function (settings, callback) {

        var region = settings.regionContext.computeSettings.region;

        connect(settings, function (error, success) {
            if (error) {
                return callback(new Error('couldn\'t connect: ' + error));
            }

            var endpoint = getEndpoint(success, region);
            if (!endpoint) {
                return callback(new Error('didn\'t find an endpoint for region: ' + region));
            }

            var listNodesRequestSettings = {
                method: 'GET',
                url: endpoint.publicURL + '/servers/detail',
                headers: {
                    'X-Auth-Token': success.access.token.id,
                    'Accept': 'application/json'
                },
                proxy: getProxy()
            };
            request(listNodesRequestSettings, function (error, response, bodyString) {
                var finalResults = {
                    nodes: [],
                    rawResult: bodyString
                };

                if ((error) || (response && (response.statusCode !== 200) && (response.statusCode !== 203) && (response.statusCode !== 300))) {
                    var errorCreate = new Error('can not listNodes with parameters: ' + JSON.stringify(settings) +
                       '. statusCode: ' + (response ? response.statusCode : 'undefined') +
                       ' ,body string' + bodyString,
                       'error: ' + error);
                    return callback(errorCreate, finalResults);
                }

                var servers = JSON.parse(bodyString).servers;
                underscore.each(servers, function (server) {
                    var node = createSimpleNodeData(server);
                    finalResults.nodes.push(node);
                });

                return callback(null, finalResults);
            });
        });
    },

    createNode: function (settings, cloudServicesTestSettings, nodeIndex, callback) {
        //TODO: handle security groups
        var securityGroups = settings.nodeParams.securityGroups,
           region = settings.regionContext.computeSettings.region,
           nodeParams = {
               name: new Date().valueOf() + '-createdByStorm',
               imageRef: settings.nodeParams.imageId,
               flavorRef: settings.nodeParams.instanceType,
               metadata: settings.nodeParams.tags,
               key_name: settings.nodeParams.keyName
           },
           userData = settings.nodeParams.userData,
           personality = settings.nodeParams.personality;

        connect(settings, function (error, success) {
            if (error) {
                return callback(new Error('couldn\'t connect: ' + error));
            }

            var endpoint = getEndpoint(success, region);
            if (!endpoint) {
                return callback(new Error('didn\'t find an endpoint for region: ' + region));
            }

            // adding user data
            if (userData) {
                nodeParams.user_data = new Buffer(JSON.stringify(userData)).toString('base64');
                nodeParams.config_drive = true;
            }

            if (personality){
                nodeParams.personality = personality;
            }

            // vendor specific extension must be last
            underscore.extend(nodeParams, settings.nodeParams.vendorSpecificParams);

            var createserverRequest = {
                method: 'POST',
                url: endpoint.publicURL + '/servers',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Auth-Token': success.access.token.id
                },
                proxy: getProxy(),
                body: JSON.stringify({server: nodeParams})
            };
            request(createserverRequest, function (error, response, bodyString) {

                var finalResults = {
                    rawResult: bodyString,
                    node: {
                        tags: {logicName: settings.nodeParams.logicName}
                    }
                };
                if ((error) || (response.statusCode !== 202)) {
                    finalResults.node.status = 'ERROR_ALLOCATION';
                    var errorCreate = new Error('can not createNode with parameters: ' + JSON.stringify(settings.nodeParams) +
                       '. statusCode: ' + (response ? response.statusCode : 'undefined') +
                       ' ,body string' + bodyString,
                       'error: ' + error);
                    return callback(errorCreate, finalResults);
                }
                finalResults.node = JSON.parse(bodyString);
                finalResults.rawResult = JSON.parse(bodyString);
                return callback(null, finalResults);
            });
        });
    }
    ,

    deleteNode: function (settings, callback) {
        var region = settings.regionContext.computeSettings.region;

        connect(settings, function (error, success) {
            if (error) {
                return callback(new Error('couldn\'t connect: ' + error));
            }
            var endpoint = getEndpoint(success, region);
            if (!endpoint) {
                return callback(new Error('didn\'t find an endpoint for region: ' + region));
            }

            var deleteServerRequest = {
                method: 'DELETE',
                url: endpoint.publicURL + '/servers/' + settings.node.id,
                headers: {
                    'Accept': 'application/json',
                    'X-Auth-Token': success.access.token.id
                },
                proxy: getProxy()
            };

            request(deleteServerRequest, function (error, response, bodyString) {
                var finalResults = {
                    rawResult: bodyString
                };
                if ((error) || (response.statusCode !== 204)) {
                    finalResults.result = 'ERROR';
                    var errorCreate = new Error('deleteNode failed for id: ' + JSON.stringify(settings.node.id) +
                    '. statusCode: ' + (response ? response.statusCode : 'undefined') +
                    '. response: ' + (response ? JSON.stringify(response) : 'undefined') +
                    ', request settings: ' + JSON.stringify(deleteServerRequest));
                    return callback(errorCreate, finalResults);
                }
                finalResults.result = 'SUCCESS';
                return callback(null, finalResults);
            });
        });
    }
    ,

    createImage: function (settings, callback) {
        var imageParams = {
            name: new Date().valueOf() + '-createdByStorm',
            serverId: settings.imageParams.nodeId,
            metadata: settings.imageParams.tags
        }, region = settings.regionContext.computeSettings.region;

        underscore.extend(imageParams, settings.imageParams.vendorSpecificParams);

        connect(settings, function (error, success) {
            if (error) {
                return callback(new Error('couldn\'t connect: ' + error));
            }

            var endpoint = getEndpoint(success, region);
            if (!endpoint) {
                return callback(new Error('didn\'t find an endpoint for region: ' + region));
            }

            var createImageRequest = {
                method: 'POST',
                url: endpoint.publicURL + '/servers/' + settings.imageParams.nodeId + '/action',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Auth-Token': success.access.token.id
                },
                proxy: getProxy(),
                body: JSON.stringify({createImage: imageParams})
            };
            request(createImageRequest, function (error, response, bodyString) {
                var location = '',
                   imageId = '',
                   finalResult = {};

                if (error || (response && (response.statusCode !== 202))) {
                    var errorCreate = new Error('cannot createImage with params: ' +
                    JSON.stringify(settings.imageParams) +
                    ', error: ' + error +
                    '. statusCode: ' + (response ? response.statusCode : 'undefined'));
                    return callback(errorCreate);
                }

                location = response.headers.location;
                imageId = location.slice(location.lastIndexOf('/') + 1);
                finalResult.rawResult = location;
                finalResult.imageId = imageId;

                return callback(null, finalResult);
            });
        });
    },

    listImages: function (settings, callback) {
        var region = region = settings.regionContext.computeSettings.region;
        connect(settings, function (error, success) {
            if (error) {
                return callback(new Error('couldn\'t connect: ' + error));
            }

            var endpoint = getEndpoint(success, region);
            if (!endpoint) {
                return callback(new Error('didn\'t find an endpoint for region: ' + region));
            }

            var listImagesRequest = {
                method: 'GET',
                url: endpoint.publicURL + '/images/detail',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Auth-Token': success.access.token.id
                },
                proxy: getProxy()
            };

            request(listImagesRequest, function (error, response, bodyString) {
                var finalResult = {};

                if (error || (response && (response.statusCode !== 200))) {
                    var errorCreate = new Error('cannot retrieve images list from rackspace. ' +
                    '. statusCode: ' + (response ? response.statusCode : 'undefined'));
                    return callback(errorCreate)
                }
                finalResult.rawResult = JSON.parse(bodyString);
                finalResult.images = [];
                underscore.each(finalResult.rawResult.images, function (rawImage) {
                    var image = underscore.pick(rawImage, 'id', 'status', 'name');
                    image.tags = rawImage.metadata;
                    finalResult.images.push(image);
                });

                return callback(null, finalResult);
            });
        });
    }
    ,

    deleteImage: function (settings, callback) {
        var region = region = settings.regionContext.computeSettings.region;
        connect(settings, function (error, success) {
            if (error) {
                return callback(new Error('couldn\'t connect: ' + error));
            }

            var endpoint = getEndpoint(success, region);
            if (!endpoint) {
                return callback(new Error('didn\'t find an endpoint for region: ' + region));
            }

            var deleteImageRequest = {
                method: 'DELETE',
                url: endpoint.publicURL + '/images/' + settings.imageParams.imageId,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Auth-Token': success.access.token.id
                },
                proxy: getProxy()
            };

            request(deleteImageRequest, function (error, response, bodyString) {
                var finalResult = {rawResult: undefined};

                if (error || (response && (response.statusCode !== 204))) {
                    var errorCreate = new Error('cannot deleteImage, error: ' + error + ', code: ' +
                    (response ? response.statusCode : 'undefined'));
                    finalResult.result = 'ERROR';
                    return callback(errorCreate, finalResult);
                }

                finalResult.result = 'SUCCESS';
                return callback(null, finalResult);
            });
        });
    },

    associateAddress: function (settings, callback) {
        var error = new Error('no implementation');
        callback(error, null);
    },

    disassociateAddress: function (settings, callback) {
        var error = new Error('no implementation');
        callback(error, null);
    },

    validateCredentials: function (settings, callback) {
        var error = new Error('no implementation');
        callback(error, null);
    }
};
