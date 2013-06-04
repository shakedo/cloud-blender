var should = require('should'),
   underscore = require('underscore'),
   execCloudTests = process.env.EXEC_CLOUD_TESTS,
   config = require('../etc/config'),
   cloud = require('../lib/cloud.js')(config.tunnelingProxyURL);

   if (execCloudTests === 'true') {

      // we intentionally don't receive the vendorsSettings as a whole from
      // etc/config.json, because we want to emphasize the multi cloud
      // operations and because etc/config.json is common for many mocha tests
      describe('cloud management tests', function() {

         var vendorsSettings = [], i, length,
            g_regionConfiguration = {
                  postRatePerMinuteLimits: 200,
                  deleteRatePerMinuteLimits: 60
            };

         vendorsSettings.push({
            provider: 'hpcs',
            identitySettings: config.identitySettingsHPCS,
            computeSettings: config.computeSettingsHPCS,
            nodeIds: [],
            createdImageId: '',
            keyName: config.keyNameHPCS,
            imageId: config.imageIdHPCS, 
            instanceType: 100 // standard.xsmall
         });

         vendorsSettings.push({
            provider: 'aws',
            identitySettings: config.identitySettingsAWS,
            computeSettings: config.computeSettingsAWS,
            nodeIds: [],
            createdImageId: '',
            keyName: config.keyNameAWS,
            imageId: config.imageIdAWS,
            instanceType: 't1.micro'
         });

         underscore.each(vendorsSettings, function(vendor) {

            it('should create nodes on ' + vendor.provider, function(done) {
               var settings = {
                  identitySettings: vendor.identitySettings,
                  computeSettings: vendor.computeSettings,
                  regionConfiguration: g_regionConfiguration,
                  servers: [{
                        imageId: vendor.imageId, 
                        instanceType: vendor.instanceType, 
                        tags: {
                           description: 'created by storm mocha test for libcloud',
                           logicName: 'createdByStorm'
                        },
                        keyName: vendor.keyName
                     },
                     {
                        imageId: vendor.imageId,
                        instanceType: vendor.instanceType,
                        tags: {
                           description: 'created by storm mocha test',
                           jobId: 'jobId-dummy',
                           logicName: 'createdByStorm2'
                        },
                        keyName: vendor.keyName
                     }],
                     provider: vendor.provider
                  };

               this.timeout(360000);

               cloud.createNodes(settings, function(error, result) {
                  var nodes = result.nodes;
                  //console.log(nodes);
                  should.not.exist(error);
                  should.exist(nodes);
                  nodes.length.should.equal(settings.servers.length);
                  should.exist(result.rawResults);
                  underscore.each(nodes, function(node) {
                     vendor.nodeIds.push(node.id);
                     should.exist(node.id);
                     should.exist(node.tags);
                     should.exist(node.tags.logicName);
                     node.status.should.equal('ACTIVE');
                  });
                  done();
               });
            });

            it('should list nodes from ' + vendor.provider, function(done) {
               var settings = {
                     identitySettings: vendor.identitySettings,
                     computeSettings: vendor.computeSettings,
                     provider: vendor.provider
                  };

               this.timeout(360000);

               cloud.listNodes(settings, function(error, result) {
                  var nodeFound,
                     nodes = result.nodes;

                  should.not.exist(error);
                  should.exist(nodes);
                  nodes.length.should.be.above(0);
                  underscore.each(vendor.nodeIds, function(id) {
                     nodeFound = underscore.find(nodes, function(node) {
                        return node.id === id;
                     });

                     should.exist(result.rawResult);
                     should.exist(nodeFound);
                     should.exist(nodeFound.tags);
                     should.exist(nodeFound.tags.logicName);
                  });

                  //            console.log(JSON.stringify(result.rawResult));
                  done();
               });
            });

            it('should create image from a node on ' + vendor.provider, function(done) {
               var settings = {
                     identitySettings: vendor.identitySettings,
                     computeSettings: vendor.computeSettings,
                     provider: vendor.provider,
                     imageParams: {
                        nodeId: vendor.nodeIds[0],
                        tags: {
                           'creationDate': new Date(),
                           'createdFor': 'test purposes',
                           'logicName': 'dummy-image'
                        },
                        vendorSpecificParams: {}
                     }
                  };

               this.timeout(720000);


               cloud.createImage(settings, function(error, result) {
                  should.not.exist(error);
                  should.exist(result.rawResult);
                  should.exist(result.imageId);
                  vendor.createdImageId = result.imageId;
                  done();
               });
            });

            it('should list images from ' + vendor.provider, function(done) {
               var settings = {
                     identitySettings: vendor.identitySettings,
                     computeSettings: vendor.computeSettings,
                     provider: vendor.provider
                  };

               this.timeout(20000);
               cloud.listImages(settings, function(error, result) {
                  var foundImage;
                  should.not.exist(error);
                  should.exist(result.rawResult);

                  foundImage = underscore.find(result.images, function(image) {
                     return image.id === vendor.createdImageId;
                  });
                  should.exist(foundImage);
                  foundImage.status.should.equal('ACTIVE');
                  //            console.log(JSON.stringify(result.images, null, '   '));
                  done();
               });
            });

            it('should delete image from ' + vendor.provider, function(done) {
               var settings = {
                     identitySettings: vendor.identitySettings,
                     computeSettings: vendor.computeSettings,
                     provider: vendor.provider,
                     imageParams: {
                       imageId: vendor.createdImageId
                     }
                  };

               //console.log('from test: ' + JSON.stringify(settings, null, '   '));

               this.timeout(50000);
               cloud.deleteImage(settings, function(error, result) {
                  should.not.exist(error);
                  //            console.log(result);
                  done();
               });
            });

            it('should delete nodes from ' + vendor.provider, function(done) {

               var settings = {
                     identitySettings: vendor.identitySettings,
                     computeSettings: vendor.computeSettings,
                     regionConfiguration: g_regionConfiguration,
                     nodeIds: vendor.nodeIds,
                     provider: vendor.provider
                  };

               this.timeout(360000);

               cloud.deleteNodes(settings, function(error, result) {
                  should.not.exist(error);
                  should.exist(result.result);
                  should.exist(result.rawResults);
                  done();
               });
            });
         }); // each vendor
      }); // describe
   }


