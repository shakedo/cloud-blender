var should = require('should'),
   underscore = require('underscore'),
   execCloudTests = process.env.EXEC_CLOUD_TESTS,
   rackspaceSettings = require('../examples/rackspace.json'),
   compute = require('../lib/rackspace.js');

// in the form of http://proxy.com:8080 - change to your own proxy
compute.setProxy(process.env.TUNNELING_PROXY);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

describe('checking rackspace local atomic lib', function() {

   it('should create an authentication context', function() {
      var regionContext = compute.createRegionContext({
            region: "dummyRegion",
            accessKey: 'dummyAccessKey',
            secretKey: 'dummySecretKey'
         }, 100);
      should.exist(regionContext.identitySettings, 'should exist regionContext.identitySettings');
      should.exist(regionContext.identitySettings.credentials, 'should exist regionContext.credentials');
      should.exist(regionContext.identitySettings.credentials.username, 'should exist regionContext.credentials.username');
      should.exist(regionContext.identitySettings.credentials.apiKey, 'should exist regionContext.credentials.apiKey');
      should.exist(regionContext.computeSettings, 'should exist regionContext.computeSettings');
      should.exist(regionContext.computeSettings.region, 'should exist regionContext.computeSettings.region');
      should.exist(regionContext.limits, 'should exist regionContext.limits');
      regionContext.limits.should.be.equal(100, 'regionContext.limits.should.be.equal 100');
      regionContext.computeSettings.region.should.be.equal('dummyRegion', 'should be regionContext.computeSettings.region.should.be.equal dummyRegion');
   });
});


if (execCloudTests !== 'true') {
   return;
}

describe('checking rackspace online atomic lib', function() {
   var createdNode = '',
      createdImage = '',
      regionContext = compute.createRegionContext(rackspaceSettings);

   it('should create a node on rackspace', function(done) {
      var name = 'createdByStorm',
         settings = {
            regionContext: regionContext,
            nodeParams: {
               imageId: 'ffa476b1-9b14-46bd-99a8-862d1d94eb7a',
               instanceType: '2',
               tags: {
                  jobId: 'dummyJobId',
                  env: 'test',
                  role: 'injector-Test',
                  logicName: name
               },
               keyName: 'oleg',
               securityGroups: [],
               vendorSpecificParams: {}
            }
         };

      this.timeout(240000);

      compute.createNode(settings, null, null, function(error, result) {
         should.not.exist(error);
         should.exist(result.rawResult, 'should.exist(result.rawResult)');
         should.exist(result.node, 'should.exist(result.node)');
         should.exist(result.node.server, 'should.exist(result.node.server)');
         should.exist(result.node.server.id, 'should.exist(result.node.server.id)');
         should.exist(result.node.server.adminPass, 'should.exist(result.node.server.adminPass)');
         should.exist(result.node.server.links, 'should.exist(result.node.server.links)');
         createdNode = result.node;
         //console.log(JSON.stringify(result.node, null, '   '));
         done();
      });
   });

   it('should get a list of nodes from rackspace', function(done) {
      var settings = {
         regionContext: regionContext
      };

      this.timeout(20000);

      compute.listNodes(settings, function(error, result) {
         var node;
         should.not.exist(error, 'should.not.exist(error)');
         should.exist(result.rawResult, 'should.exist(result.rawResult)');
         should.exist(result.nodes, 'should.exist(result.nodes)');

         console.log(JSON.stringify(result.nodes, null, '   '));
         node = underscore.find(result.nodes, function (node) {
            return node.id === createdNode.server.id;
         });
         should.exist(node, 'should.exist(node)');

         done();
      });
   });

   it('should create image from a node on rackspace', function(done) {
      var settings = {
         regionContext: regionContext,
         imageParams: {
            nodeId: '6a3cbec3-59e0-44ce-b92b-cee5857064f1',
            tags: {
               'creationDate': new Date(),
               'createdFor': 'test purposes',
               'logicName': 'dummy-image'
            },
            vendorSpecificParams: {}
         }
      };
      this.timeout(20000);

      // wait is needed since image can be taken only on running/stopped state...
      // we wait instead of polling since polling is higher level.
      compute.createImage(settings, function(error, result) {
         should.not.exist(error, 'should.not.exist(error)');
         should.exist(result.rawResult, 'should.exist(result.rawResult)');
         should.exist(result.imageId, 'should.exist(result.imageId)');
         createdImage = result.imageId;
         //            console.log(createdImage);
         done();
      });
   });

   it('should get a list of images from rackspace', function(done) {
      var settings = {
         regionContext: regionContext
      };

      this.timeout(20000);

      compute.listImages(settings,null, function(error, result) {
         //console.log(JSON.stringify(result.images, null, '   '));
         should.not.exist(error, 'should.not.exist(error)');
         should.exist(result, 'should.exist(result)');
         should.exist(result.images, 'should.exist(result.images)');
         should.exist(result.rawResult, 'should.exist(result.rawResult)');
         done();
      });
   });

   it('should delete an image from rackspace', function(done) {
      var settings = {
         regionContext: regionContext,
         imageParams: {
            imageId: createdImage
         }
      };

      this.timeout(10000);

      compute.deleteImage(settings, function(error, result) {
         should.not.exist(error, 'should.not.exist(error)');
         should.exist(result, 'should.exist(result)');
         should.exist(result.result, 'should.exist(result.result)');
         createdImage = '';
         //console.log(result);
         done();
      });
   });

   it('should delete a node from rackspace', function(done) {
      var settings = {
         regionContext: regionContext,
         node: createdNode.server
      };

      this.timeout(40000);

      compute.deleteNode(settings, function(error, result) {
         should.not.exist(error, 'should.not.exist(error)');
         should.exist(result, 'should.exist(result)');
         should.exist(result.result, 'should.exist(result.result)');
         //console.log(result);
         done();
      });
   });

});
