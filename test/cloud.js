var should = require('should'),
   underscore = require('underscore'),
   execCloudTests = process.env.EXEC_CLOUD_TESTS,
//hpcsUSWestAz2Settings = require('../examples/hpcs_uswest_az2'),
//awsUSEast1Settings = require('../examples/aws_east_1'),
//hpcsUSWest_13_5_Settings = require('../examples/hpcs_uswest_13_5'),
//azure_Settings = require('../examples/azure'),
   cloud = require('../lib/cloud.js'),
   azureConfig = require('../examples/azure.json');

// in the form of http://proxy.com:8080 - change to your own proxy
cloud.setProxy(process.env.TUNNELING_PROXY);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;


if (execCloudTests !== 'true') {
   return;
}

describe('cloud management tests', function() {

   var regionsSettings = [],
      regionLimitsConfiguration = {
         postRatePerMinute: 50,
         deleteRatePerMinute: 60
      };

   var providerName = 'azure',
      regionAuthSettings = azureConfig,
      regionLimits = {maxRolesPerService: 2};

   regionsSettings.push({
      regionContext: cloud.createRegionContext(providerName,
         regionAuthSettings ,
         regionLimits
      ),
      nodes: [],
      keyName: 'stormRegion2',
      imageId: 'image', // ubuntu 12.04
      instanceType: 'Basic_A0' // standard.xsmall
   });


   /*
    regionsSettings.push({
    regionContext: cloud.createRegionContext('hpcs_13_5', hpcsUSWest_13_5_Settings,
    regionLimitsConfiguration),
    nodes: [],
    createdImageId: '',
    keyName: 'stormRegion2', // private key - please create you own
    imageId: '27be722e-d2d0-44f0-bebe-471c4af76039', // ubuntu 12.04
    instanceType: 100 // standard.xsmall
    });

    regionsSettings.push({
    regionContext: cloud.createRegionContext('hpcs', hpcsUSWestAz2Settings,
    regionLimitsConfiguration),
    nodes: [],
    createdImageId: '',
    keyName: 'stormRegion2', // private key - please create you own
    imageId: 14075, // public fedora on hpc2 uswest az2
    instanceType: 100 // standard.xsmall
    });

    regionsSettings.push({
    regionContext: cloud.createRegionContext('aws', awsUSEast1Settings,
    regionLimitsConfiguration),
    nodes: [],
    createdImageId: '',
    keyName: 'storm-east1', // private key - please create your own
    imageId: 'ami-d0f89fb9', // public ubuntu 12.04 i686 on aws east-1
    instanceType: 't1.micro'
    });
    */



   underscore.each(regionsSettings, function(region) {


      it('should create nodes on ' + region.regionContext.providerName, function(done) {
         var settings = {
            regionContext: region.regionContext,
            nodes: [{
               imageId: region.imageId,
               instanceType: region.instanceType,
               tags: {
                  description: 'created by cloud blender mocha test for libcloud',
                  logicName: 'createdByStorm'
               },
               keyName: region.keyName
            },
               {
                  imageId: region.imageId,
                  instanceType: region.instanceType,
                  tags: {
                     description: 'created by cloud blender mocha test',
                     jobId: 'jobId-dummy',
                     logicName: 'createdByStorm2'
                  },
                  userData: {'paramA': 'keyA', 'paramB': 'keyB', 'paramC': 'keyc'},
                  keyName: region.keyName
               }
            ]
         };

         this.timeout(460000);

         cloud.createNodes(settings, function(error, result) {
            var nodes = result.nodes;
            //console.log(nodes);
            should.not.exist(error);
            should.exist(nodes);
            nodes.length.should.equal(settings.nodes.length);
            should.exist(result.rawResults);
            underscore.each(nodes, function(node) {
               region.nodes.push(node);
               should.exist(node.id);
               should.exist(node.tags);
               should.exist(node.tags.logicName);
               node.status.should.equal('ACTIVE');
            });
            done();
         });
      });

      /*
       it('should fail to create nodes from non existed image on ' + region.regionContext.providerName, function(done) {
       var settings = {
       regionContext: region.regionContext,
       nodes: [{
       imageId: 'not-exist',
       instanceType: region.instanceType,
       tags: {
       description: 'created by cloud blender mocha test',
       jobId: 'jobId-dummy',
       logicName: 'createdByStorm2'
       },
       userData: {'paramA': 'keyA', 'paramB': 'keyB', 'paramC': 'keyc'},
       keyName: region.keyName
       }]
       };

       this.timeout(360000);
       cloud.createNodes(settings, function(error, result) {
       should.exist(error);
       done();
       });
       });
       */

      it('should list nodes from ' + region.regionContext.providerName, function(done) {
         var settings = {
            regionContext: region.regionContext
         };

         this.timeout(460000);
         cloud.listNodes(settings, function(error, result) {
            var nodeFound,
               nodes = result.nodes;

            should.not.exist(error);
            should.exist(nodes);
            nodes.length.should.be.above(0);
            underscore.each(region.nodes, function(regionNode) {
               nodeFound = underscore.find(nodes, function(node) {
                  return node.id === regionNode.id;
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

      it('should create image from a node on ' + region.regionContext.providerName, function(done) {
         var settings = {
            regionContext: region.regionContext,
            imageParams: {
               nodeId: region.nodes[0].id,
               tags: {
                  'creationDate': new Date(),
                  'createdFor': 'test purposes',
                  'logicName': 'dummy-image'
               },
               regionSpecificParams: {}
            }
         };

         this.timeout(90000);


         cloud.createImage(settings, function(error, result) {


            should.not.exist(error);
            //should.exist(result.rawResult);
            should.exist(result.imageId);
            region.createdImageId = result.imageId;
            done();
         });
      });


      it('should fail to create image from a non existed node on ' + region.regionContext.providerName, function(done) {
         var settings = {
            regionContext: region.regionContext,
            imageParams: {
               nodeId: 'not-exist'
            }
         };

         this.timeout(72000);

         cloud.createImage(settings, function(error, result) {
            should.exist(error);
            done();
         });
      });


      it('should list images from ' + region.regionContext.providerName, function(done) {
         var settings = {
            regionContext: region.regionContext
         };

         this.timeout(96000);
         cloud.listImages(settings, function(error, result) {
            var foundImage;
            should.not.exist(error);
            should.exist(result.rawResult);

            foundImage = underscore.find(result.images, function(image) {
               return image.id === region.createdImageId;
            });
            should.exist(foundImage);
            foundImage.status.should.equal('ACTIVE');
            //            console.log(JSON.stringify(result.images, null, '   '));
            done();
         });
      });


      it('should delete image from ' + region.regionContext.providerName, function(done) {
         var settings = {
            regionContext: region.regionContext,
            imageParams: {
               imageId: region.createdImageId
            }
         };

         //console.log('from test: ' + JSON.stringify(settings, null, '   '));

         this.timeout(99000);
         cloud.deleteImage(settings, function(error, result) {
            should.not.exist(error);
            //            console.log(result);
            done();
         });
      });



      it('should fail to delete not existed image from ' + region.regionContext.providerName, function(done) {
         var settings = {
            regionContext: region.regionContext,
            imageParams: {
               imageId: 'not-exist'
            }
         };

         //console.log('from test: ' + JSON.stringify(settings, null, '   '));

         this.timeout(50000);
         cloud.deleteImage(settings, function(error, result) {
            should.exist(error);
            //            console.log(result);
            done();
         });
      });



      it('should delete nodes from ' + region.regionContext.providerName, function(done) {
         var settings = {
            regionContext: region.regionContext,
            nodes: region.nodes.slice(1, region.nodes.length)
         };

         this.timeout(360000);

         cloud.deleteNodes(settings, function(error, result) {
            should.not.exist(error);
            should.exist(result.result);
            should.exist(result.rawResults);
            done();
         });
      });
      /*
       it('should fail to delete not existed nodes from ' + region.regionContext.providerName, function(done) {
       var settings = {
       regionContext: region.regionContext,
       nodes: ['not-exist']
       };

       this.timeout(360000);

       cloud.deleteNodes(settings, function(error, result) {
       should.exist(error);
       done();
       });
       });
       */
   }); // each region
}); // describe
