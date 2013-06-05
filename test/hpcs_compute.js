var should = require('should'),
   underscore = require('underscore'),
   execCloudTests = process.env.EXEC_CLOUD_TESTS,
   config = require('../etc/config'),
   compute = require('../lib/hpcs_compute.js');

compute.setProxy(config.tunnelingProxyURL);

if (execCloudTests === 'true') {
   describe('checking hpcs-compute atomic lib', function() {
      var g_id = '',
         g_imageId = '',
         identitySettings = config.identitySettingsHPCS,
         computeSettings = config.computeSettingsHPCS;

      it('should create a node on hpcs-compute', function(done) {
         var name = 'createdByStorm',
            settings = {
               identitySettings: identitySettings,
               computeSettings: computeSettings,
               nodeParams: {
                  imageId: 9883, //ubuntu 12.04
                  instanceType: 100, // standard.xlarge
                  tags: {
                     jobId: 'dummyJobId',
                     env: 'test',
                     role: 'injector-Test',
                     logicName: name
                  },
                  keyName: 'stormRegion2',
                  securityGroups: ['injector-linux'],
                  userData: {
                     'key1': 'param1'
                  },
                  vendorSpecificParams: {}
               }
            };

         this.timeout(20000);

         compute.createNode(settings, function(error, result) {
            should.not.exist(error);
            should.exist(result.rawResult);
            should.exist(result.node);
            should.exist(result.node.id);
            should.exist(result.node.tags);
            g_id = result.node.id;
            //console.log(JSON.stringify(result.node, null, '   '));
            done();
         });
      });

      it('should get a list of nodes from hpcs-compute', function(done) {
         var settings = {
            identitySettings: identitySettings,
            computeSettings: computeSettings
         };

         this.timeout(20000);

         compute.listNodes(settings, function(error, result) {
            var node;
            should.not.exist(error);
            should.exist(result.rawResult);
            should.exist(result.nodes);

            //console.log(JSON.stringify(result.nodes, null, '   '));
            node = underscore.find(result.nodes, function (node) {
               return node.id === g_id;
            });
            should.exist(node);

            done();
         });
      });

      it('should create image from a node on hpcs-compute', function(done) {
         var settings = {
               identitySettings: identitySettings,
               computeSettings: computeSettings,
               imageParams: {
                  nodeId: g_id,
               tags: {
                  'creationDate': new Date(),
                  'createdFor': 'test purposes',
                  'logicName': 'dummy-image'
               },
               vendorSpecificParams: {}
               }
            },
            waitInterval = 80000;
         this.timeout(waitInterval+20000);

         // wait is needed since image can be taken only on running/stopped state...
         // we wait instead of polling since polling is higher level.
         setTimeout(function() {
            compute.createImage(settings, function(error, result) {
               should.not.exist(error);
               should.exist(result.rawResult);
               should.exist(result.imageId);
               g_imageId = result.imageId;
               //            console.log(g_imageId);
               done();
            });
         }, waitInterval);
      });

      it('should get a list of images from hpcs-compute', function(done) {
         var settings = {
               identitySettings: identitySettings,
               computeSettings: computeSettings
            };

         this.timeout(20000);

         compute.listImages(settings, function(error, result) {
            //console.log(JSON.stringify(result.images, null, '   '));
            should.not.exist(error);
            should.exist(result);
            should.exist(result.images);
            should.exist(result.rawResult);
            done();
         });
      });

      it('should delete an image from hpcs-compute', function(done) {
         var settings = {
               identitySettings: identitySettings,
               computeSettings: computeSettings,
               imageParams: {
                  imageId: g_imageId
               }
            };

         this.timeout(10000);

         compute.deleteImage(settings, function(error, result) {
            should.not.exist(error);
            should.exist(result);
            should.exist(result.result);
            g_imageId = '';
            //console.log(result);
            done();
         });
      });

      it('should delete a node from hpcs-compute', function(done) {
         var settings = {
               identitySettings: identitySettings,
               computeSettings: computeSettings,
               nodeParams: {
                  id: g_id
               }
            };

         this.timeout(10000);

         compute.deleteNode(settings, function(error, result) {
            should.not.exist(error);
            should.exist(result);
            should.exist(result.result);
            //console.log(result);
            done();
         });
      });
   });
}
