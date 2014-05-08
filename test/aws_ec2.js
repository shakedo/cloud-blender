var should = require('should'),
   underscore = require('underscore'),
   execCloudTests = process.env.EXEC_CLOUD_TESTS,
   awsEast1Settings = require('../examples/aws_east_1'),
   ec2 = require('../lib/aws_ec2.js');

 // in the form of http://proxy.com:8080 - change to your own proxy
ec2.setProxy(process.env.TUNNELING_PROXY);

describe('checking aws-ec2 local atomic lib', function() {

   it('should create an authentication context', function() {

      var regionContext = ec2.createRegionContext({
         accessKey: 'dummyAccess',
         secretKey: 'dummySecret',
         region: 'dummyRegion'
      });
      should.exist(regionContext.identitySettings);
      should.exist(regionContext.computeSettings);
   });
});

if (execCloudTests !== 'true') {
   return;
}

describe('checking aws-ec2 atomic lib', function() {

   var g_node = '',
      g_imageId,
      regionContext = ec2.createRegionContext(awsEast1Settings);

   it('should launch instance on aws-ec2', function(done) {
      var name = 'createdByStorm',
         settings = {
            regionContext: regionContext,
            nodeParams: {
               imageId: 'ami-def89fb7', 
               instanceType: 't1.micro',
               tags: {
                  jobId: 'dummyJobId',
                  env: 'test',
                  role: 'injector-Test',
                  logicName: name
               },
               keyName: 'storm-east1',
               userData: {'paramA': 'keyA'},
               securityGroups: ['quick-start-1']
            }
         };

         this.timeout(10000);
         ec2.createNode(settings, function(error, result) {
            should.not.exist(error);
            should.exist(result.rawResult);
            should.exist(result.node);
            should.exist(result.node.id);
            should.exist(result.node.tags);
            g_node = result.node;
            //console.log(JSON.stringify(result.node, null, '   '));
            done();
         });
   });

   it('should get a list of nodes from aws-ec2', function(done) {
      var settings = {
         regionContext: regionContext
      };

      this.timeout(30000);

      ec2.listNodes(settings, function(error, result) {
         var node;
         should.not.exist(error);
         should.exist(result.rawResult);
         should.exist(result.nodes);

         //console.log(JSON.stringify(result.nodes, null, '   '));
         node = underscore.find(result.nodes, function (node) {
            return node.id === g_node.id;
         });
         should.exist(node);

         done();
      });
   });

   it('should create image from a node on aws-ec2', function(done) {
      var settings = {
         regionContext: regionContext,
         imageParams: {
            nodeId: g_node.id,
            tags: {
               'creationDate': new Date(),
               'createdFor': 'test purposes',
               'logicName': 'dummy-image'
            },
            vendorSpecificParams: {
               Description: 'blah blah blah created by a dummy test'
            }
         }
      },
      waitInterval = 80000;

      this.timeout(waitInterval+10000);

      // wait is needed since image can be taken only on running/stopped state...
      // we wait instead of polling since polling is higher level.
      setTimeout(function() {
         ec2.createImage(settings, function(error, result) {
            should.not.exist(error);
            should.exist(result.rawResult);
            should.exist(result.imageId);
            g_imageId = result.imageId;
            //            console.log(g_imageId);
            done();
         });
      }, waitInterval);
   });

   it('should get a list of images from aws-ec2', function(done) {
      var settings = {
         regionContext: regionContext
      };

      this.timeout(30000);

      ec2.listImages(settings, function(error, result) {
         should.not.exist(error);
         should.exist(result);
         should.exist(result.images);
         should.exist(result.rawResult);
         //console.log(JSON.stringify(result.images, null, '   '));
         //console.log(JSON.stringify(result.rawResult, null, '   '));
         done();
      });
   });

   it('should delete image from aws-ec2', function(done) {
      var settings = {
         regionContext: regionContext,
         imageParams: {
            imageId: g_imageId
         }
      },
      waitInterval = 240000;
      this.timeout(waitInterval + 20000);

      setTimeout(function(){
         ec2.deleteImage(settings, function(error, result) {
            should.not.exist(error);
            should.exist(result);
            should.exist(result.result);
            g_imageId = '';
            //         console.log(result);
            done();
         });
      }, waitInterval);
   });

   it('should delete instance from aws-ec2', function(done) {
      var settings = {
         regionContext: regionContext,
         node: g_node
      };

      this.timeout(10000);

      ec2.deleteNode(settings, function(error, result) {
         should.not.exist(error);
         should.exist(result);
         should.exist(result.result);
         //console.log(result);
         done();
      });
   });
});
