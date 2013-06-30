# Cloud Blender
A high level node library for cloud compute operations that abstracts away differences among multiple cloud providers.


## Installing
The best way to install **Cloud Blender**:
<pre><code>
npm install cloud-blender
</code></pre>


## Very Easy to Use
Example of retrieving all the nodes in a region:

```javascript
var cloud = require('cloud-blender'),
   settings = {
      // This is for demo purposes only! Your credentials should not 
      // be hard coded, instead consider load them from your envirenmet
      // or from a secured file.
      // Information on how to obtain hp access, secret, tenant id, region and az
      // can be found in https://blog.hpcloud.com/using-hp-cloud-identity-service
      regionContext: cloud.createRegionContext('hpcs', {
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


## Advanced Use Cases
Example of creating multiple nodes with different configurations in the same
provisioning request. Note that **Cloud Blender** allows the 
flexibility to create in the same call different configurations such as tags
 and different instance type. Notice that the region post rate is non standard.

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

## Philosophy
Cloud Blender's philosophy is to provide a unified and simple way to work with 
multiple cloud vendors compute service in a real asynchronous manner by having
the callbacks called only after all the operations of a single function  are 
completed by the cloud provider back-end and not when they were accepted at the
cloud provider.
The user provides the same inputs to every function, regardless the cloud provider choice.
If the user want to supply a vendor specific input, he can pass the vendorSpecificParams object to the call.
The output of the functions consist of a unified result and the original raw result from the cloud provider.
This design ensures that if the user is not passing vendorSpecificParams and not looking at raw result
His code is 100% cross platform.
The user can still be cross platform if he uses raw results or passing vendor specific parameters, but it is under 
the users responsibility to verify that.


## Current Cloud Providers Support
The current version supports **HPCS-compute** and **AWS-EC2**.


## Current Version Supported Operations
The current version supports the following operations:

- [createNodes](./docs/Reference.md#createNodes)
- [listNodes](./docs/Reference.md#listNodes)
- [deleteNodes](./docs/Reference.md#deleteNodes)
- [createImage](./docs/Reference.md#createImage)
- [listImage](./docs/Reference.md#listImage)
- [deleteImage](./docs/Reference.md#deleteImage)

## Contributing
We welcome contributions from the community and are pleased to have them.
For bugs, enhancement requests and comments please open us issues.
For code contribution please fork and ask for pull request:
Please make sure you follow our coding style and that the tests are green.
Make sure not to include your tenant credentials in the source code.

## Running Tests
There are two types of tests:

   - Remote - These tests are actually accessing real cloud so they cost money. The majority
   of the tests are of this type.
   - Local - These tests are not accessing real cloud and therefore are not costing money.

By default for preventing accidentally getting cost,  only local tests are running
if you want to enable the actual cloud tests set the EXEC_CLOUD_TESTS environment variable 
to true.
You can also setup a proxy by setting the environment variable TUNNELING_PROXY to your proxy.

The tests goes to HPCS US-West-AZ2 and AWS US-East-1. We hard coded some of these regions 
data (images IDs etc.) in our tests.
You need to have two configuration files in the ./examples/ directory, these files 
should include your cloud providers credentials so secure them carefully.

   - ./examples/hpcs_uswest_az2.json for HPCS US-West-AZ2 credentials.
   - ./examples/aws_east_1.json for AWS US-EAST-1 credentials.

These JSONs are simply used as inputs to ``createRegionContext`` function.
Please look at ./examples/config_example.json for an example.
Please also create a key pair on each region and hard code it in the test files, where
keyName is used.

After creating the configuration JSON files and setting the environment variables, 
tests can be run by using:

```
npm run test # Tests public API
npm run test-atomic-hpcs # Tests HPCS-Compute atomic module
npm run test-atomic-aws # Tests AWS-EC2 atomic lib
``` 



## Additional Information
- For the **latest updates** follow [@CloudBlender](https://twitter.com/CloudBlender).
- For more **information, tutorials, and references** on the currently published version, visit [**Cloud Blender**](http://somelink@hp.com)
- [API reference](/projects/TCS/repos/mutlicloud/browse/docs/Reference.md)
- For **issues or questions**, please open an issue or ask in twitter.


## License
We should add the relevant license file here
