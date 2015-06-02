var should = require('should'),
   underscore = require('underscore'),
   execCloudTests = process.env.EXEC_CLOUD_TESTS,
   awsEast1Settings = require('../examples/aws_east_1'),
   ec2 = require('../lib/aws_ec2.js');

 // in the form of http://proxy.com:8080 - change to your own proxy
ec2.setProxy(process.env.HTTPS_PROXY);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

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
      g_ip = '184.73.164.67',
      allocatedIp,
      regionContext = ec2.createRegionContext(awsEast1Settings);

   it ('should check describeAZs', function(done) {
      var settings = {
         regionContext: regionContext
      };

      this.timeout(30000);
      ec2.describeAZs(settings, function(error, result) {
         should.not.exist(error);
         should.exist(result);
         result.length.should.be.above(0);
         //console.log('azs are: ' + JSON.stringify(result));
         done();
      });
   });

   it('should allocate IP on aws-ec2', function(done) {

      var settings = {
         regionContext: regionContext
      };

      ec2.allocateAddress(settings, function(error, res) {
         console.log('allocated Address-'+res.result);
         should.not.exist(error);
         should.exist(res.result);
         allocatedIp=res.result;
         done();
      });
   });

   it('should release IP on aws-ec2', function(done) {
      this.timeout(60000);
      var settings = {
         regionContext: regionContext,
         publicIp:allocatedIp
      };

      ec2.releaseAddress(settings, function(error, res) {
         should.not.exist(error);
         'true'.should.equal(res.result);
         done();
      });
   });

   it('should launch instance on aws-ec2', function(done) {
      var name = 'createdByStorm',   settings = {
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
         ec2.createNode(settings, {}, 1, function(error, result) {
            should.not.exist(error);
            should.exist(result.rawResult);
            should.exist(result.node);
            should.exist(result.node.id);
            should.exist(result.node.tags);
            should.exist(result.node.releaseInfo);
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

   it.only('should create image from a node on aws-ec2', function(done) {
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

   it('should associate address from aws-ec2', function(done) {
      var settings = {
         regionContext: regionContext,
         associatePairs: {
            instanceId: g_node.id,
            publicIp: g_ip
         }
      };

      this.timeout(10000);

      ec2.associateAddress(settings, function(error, result) {
         should.not.exist(error);
         should.exist(result);
         should.exist(result.result);
         //console.log(result);
         done();
      });
   });

   it('should disassociate address from aws-ec2', function(done) {
      var settings = {
         regionContext: regionContext,
         publicIp: g_ip
      };

      this.timeout(10000);

      ec2.disassociateAddress(settings, function(error, result) {
         should.not.exist(error);
         should.exist(result);
         should.exist(result.result);
         //console.log(result);
         done();
      });
   });

   it('reset launch permissions of image', function(done) {
      var settings = {
         regionContext: regionContext,
         imageId: 'ami-bca4a8d4'
      };

      this.timeout(10000);
      ec2.resetLaunchPermissions(settings, function(error, result) { //add launch permissions
         should.not.exist(error);
         should.exist(result);
         should.exist(result.result);
         done();
      });
   });

   it('check launch permission api of image', function(done) {
      var settings = {
         regionContext: regionContext,
         imageId: 'ami-bca4a8d4',  //a special image (plain ubuntu)created in advance for unit tests
         accountIds: ['000000000000','000000000001', '000000000002', 'all'] //seems that launch permissions works for any account Id that contains 12 digits even if it is not a real account.
      };
      this.timeout(40000);
      settings.bAdd = true;
      ec2.resetLaunchPermissions(settings, function (error, result) { //first Reset launch permissions
         ec2.modifyLaunchPermissions(settings, function (error, result) { //add launch permissions
            should.not.exist(error, 'Failed to add launch permissions');
            should.exist(result);
            should.exist(result.result);
            settings.bAdd = false;
            ec2.getLaunchPermissions(settings, function (error, result) {
               var userIds;
               should.not.exist(error, 'Failed to get launch permissions');
               should.exist(result);
               userIds = result.rawResult;
               userIds.length.should.equal(4);
               settings.accountIds.forEach(function(id){
                  userIds.should.include(id, 'Cannot find account in launch permission list');
               });
               ec2.modifyLaunchPermissions(settings, function (error, result) { //remove launch permissions
                  should.not.exist(error, 'Failed to remove launch permissions');
                  should.exist(result);
                  should.exist(result.result);
                  ec2.getLaunchPermissions(settings, function (error, result) { //remove launch permissions
                     var userIds = result.rawResult;
                     should.not.exist(error, 'Failed to get launch permissions');
                     userIds.length.should.equal(0);
                     done();

                  });
               });
            });
         });
      });
   });

   it('check provider error handling', function(done) {
      var settings = {
         regionContext: regionContext,
         imageId: 'bad id'
      };
      this.timeout(10000);
      ec2.getLaunchPermissions(settings, function(error, result) { //add launch permissions
         should.exist(error);
         should.exist(error.isFatal);
         should.exist(error.providerDetails);
         error.isFatal.should.be.true;
         done();
      });
   });

   it('check credential validation', function(done) {
      var settings = {
         accountId :   awsEast1Settings.accountId,
         credentials: {
            "accessKeyId": awsEast1Settings.accessKey,
            "secretAccessKey": awsEast1Settings.secretKey

         }
      };
      this.timeout(10000);
      ec2.validateCredentials(settings, function(error, result) {
         should.not.exist(error);
         result.should.be.equal(0); //0 means validation success
         done();
      });
   });

   it('check mismatch between account Id and security credentials', function(done) {
      var settings = {
         accountId :   '123456789012', //give a different account
         credentials: {
            "accessKeyId": awsEast1Settings.accessKey,
            "secretAccessKey": awsEast1Settings.secretKey

         }
      };
      this.timeout(10000);
      ec2.validateCredentials(settings, function(error, result) {
         should.not.exist(error);
         result.should.be.equal(1); //credentials Ok but account does not .
         done();
      });
   });

   it('check invalid security credentials', function(done) {
      var settings = {
         accountId :   awsEast1Settings.accountId,
         credentials: {
            "accessKeyId": 'ABCDEFGHIJ1234567890',
            "secretAccessKey": awsEast1Settings.secretKey

         }
      };
      this.timeout(10000);
      ec2.validateCredentials(settings, function(error, result) {
         should.not.exist(error);
         result.should.be.equal(2); //2 means security credentials are wrong
         done();
      });
   });

});
