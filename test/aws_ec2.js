var should = require('should'),
   underscore = require('underscore'),
   execCloudTests = process.env.EXEC_CLOUD_TESTS,
   config = require('../etc/config'),
   ec2 = require('../lib/aws_ec2.js');

ec2.setProxy(config.tunnelingProxyURL);

if (execCloudTests === 'true') {

   describe('checking aws-ec2 atomic lib', function() {

      var g_id = '',
         g_imageId,
         identitySettings = config.identitySettingsAWS,
         computeSettings = config.computeSettingsAWS;

      it('should launch instance on aws-ec2', function(done) {
         var name = 'createdByStorm',
            settings = {
               identitySettings: identitySettings,
               computeSettings: computeSettings,
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
            g_id = result.node.id;
            //console.log(JSON.stringify(result.node, null, '   '));
            done();
         });
      });

      it('should get a list of nodes from aws-ec2', function(done) {
         var settings = {
            identitySettings: identitySettings,
            computeSettings: computeSettings
         };

         this.timeout(30000);

         ec2.listNodes(settings, function(error, result) {
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

      it('should create image from a node on aws-ec2', function(done) {
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
               identitySettings: identitySettings,
               computeSettings: computeSettings
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
               identitySettings: identitySettings,
               computeSettings: computeSettings,
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
               identitySettings: identitySettings,
               computeSettings: computeSettings,
               nodeParams: {
                  id: g_id
               }
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
}
