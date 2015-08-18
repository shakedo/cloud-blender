# Cloud Blender
A high level node library for cloud compute operations that abstracts away differences among multiple cloud providers.

## Installing
<pre><code>
npm install cloud-blender
</code></pre>

## Overview
Cloud Blender provides a unified way to work with multiple cloud vendor's compute service.
Cloud Blender works in a real asynchronous manner by having the callbacks called only after all the operations of a single function are 
completed and not when they accepted.
You provide generic inputs to every function regardless of the cloud provider. In addition, you can provide cloud specific inputs to use 
functionality provided by that cloud vendor. 
The output of the functions consists of unified result and the original raw result from the cloud provider (converted to JSON). 
This design ensures that if you are not passing specific inputs and not using the raw results, your code is 100% cross platform. 
You can still accomplish cross platform functionality if you use raw results and are passing vendor specific parameters, 
however, you must verify it.

## Basic Use Case
Example of retrieving all the nodes in a region:

```javascript
var cloud = require('cloud-blender'),
   settings = {
      // This is for demo purposes only! Your credentials should not 
      // be hard coded, instead consider loading them from your environment
      // or from a secured file.
      // Information on how to obtain hp access, secret, tenant id, region and az
      // can be found in https://blog.hpcloud.com/using-hp-cloud-identity-service
      regionContext: cloud.createRegionContext('hpcs_13_5', {
            "accessKey": "<your hpcs access key>", 
            "secretKey": "<your hpcs secret key>", 
            "tenantId": "<your hpcs tenant id>",
            "region": "region-a.geo-1", // hpcs uswest
            "availabilityZone": "az-2"  // hpcs uswest - az2
       })
   };

cloud.listNodes(settings, function(error, result) {
   if (error) {
      console.log('error in getting nodes list, details:', error);
   }
   else {
      //result.nodes will contain the same fields regardless the cloud provider
      //result.rawResult will contain the original result from the cloud provider
      console.log('successfully retrieved nodes list', result.nodes);
   }
});
```

## Advanced Use Case
Example of creating multiple nodes with different configurations in the same
provisioning request. Note that **Cloud Blender** allows the 
flexibility to create different configurations such as tags
 and different instance type in the same call. Note that the region post rate is non standard.

```javascript
var cloud = require('cloud-blender'),
   settings = {
         
      // This is for demo purposes only! Your credentials should not 
      // be hard coded, instead consider load them from your envirenmet
      // or from a secured file.
      // Information on how to obtain aws access and secret can be found 
      // in:  http://docs.aws.amazon.com/fws/1.1/GettingStartedGuide/index.html?AWSCredentials.html
      regionContext: cloud.createRegionContext('aws', {
            "accessKey": "<your aws access key>", 
            "secretKey": "<your aws secret key>", 
            "region": "us-east-1", 
         }, { postRatePerMinute: 200}),
         nodes: [ // notice that we use multiple configurations in the same request
            {
               imageId: 'ami-d0f89fb9', // public ubuntu 12.04 i686 on aws east-1 
               instanceType: 't1.micro'
               tags: {
                  logicName: 'machine1'
               }
            },
            {
               imageId: 'ami-d0f89fb9', 
               instanceType: 'm1.large'
               tags: {
                  logicName: 'machine2'
               }
            }]
      };

   cloud.createNodes(settings, function(error, result) {
      if (error) {
         console.log('error in create nodes, details:', error);
      }
      else {
         //note that all nodes are currently in ACTIVE state
         //result.nodes will contain the same fields regardless the cloud provider
         //result.rawResult will contain the original result from the cloud provider
         console.log('successfully created nodes', result.nodes);
      }
   });
```


## Current Cloud Providers Support
The current version supports **HPCS-compute (both 12.12 and 13.5 versions)**, **RackSpace**, **Azure** and **AWS-EC2**.


## Current Version Supported Operations
The current version supports the following operations:

- [createNodes](./docs/Reference.md#createNodes)
- [listNodes](./docs/Reference.md#listNodes)
- [deleteNodes](./docs/Reference.md#deleteNodes)
- [createImage](./docs/Reference.md#createImage)
- [listImages](./docs/Reference.md#listImages)
- [deleteImage](./docs/Reference.md#deleteImage)

## Contributions Welcome
We welcome contributions from the community and are pleased to have them.
For bugs, enhancement requests and comments please open us issues.
For code contribution please fork and ask for pull request:
Please make sure you follow our coding style and that the tests are green.
Make sure not to include your tenant credentials in the source code.

## Running Tests
There are two types of tests:

   - Remote: The majority of the validation tests are remote tests. These tests access real cloud services and you will incur a cost to run them.
   - Local: There are a few validation tests that are local test. These tests are free.

### How to Run a Test

   - By default, only local test are running. If you want to enable remote tests set the EXEC_CLOUD_TESTS environment variable to true. 
      You can also setup a proxy by setting the environment variable TUNNELING_PROXY to your proxy.
   - The tests are run on HPCS US-West-AZ2 and AWS-USEast-1. We hard coded certain properties of these regions. 
      You will need to create two configuration files in which include your credentials.

      - ./examples/hpcs_uswest_az2.json for HPCS US-West-AZ2 credentials.
      - ./examples/aws_east_1.json for AWS US-EAST-1 credentials.

   These JSONs are used as inputs to the ``createRegionContext`` function. For example, ./examples/config_example.json
   Please also create a key pair on each region and hard code it in the test files, where
   keyName is used.

   - To run the acutual tests:
```
npm run test # Tests public API
npm run test-atomic-hpcs # Tests HPCS-Compute atomic module
npm run test-atomic-aws # Tests AWS-EC2 atomic lib
``` 

## Additional Information
- For the **latest updates** follow [@CloudBlender](https://twitter.com/CloudBlender) (coming soon).
- [API reference](/projects/TCS/repos/mutlicloud/browse/docs/Reference.md)
- For **issues or questions**, please open an issue or ask in twitter.


