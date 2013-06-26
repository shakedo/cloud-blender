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
completed by the cloud provider backend and not when they were accepted at the
cloud provider.
The user provides the same inputs to every function, regardless the cloud provider choice.
If the user want to supply a vendor specific input, she can pass the vendorSpecificParams object to the call.
The output of the functions is always called result. `result` contains two outputs:

- result.rawResult(s): The original result(s) from the cloud provider. 
- result.outputName: The unified API output.

This design ensures that if the user is not passing vendorSpecificParams and not looking at result.rawResult(s)
His code is 100% cross platform.
The user can still be cross platform if she uses raw results or passing vendor specific parameters, but it is under 
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

## Additional Information
- For the **latest updates** follow [@CloudBlender](https://twitter.com/CloudBlender).
- For more **information, tutorials, and references** on the currently published version, visit [**Cloud Blender**](http://somelink@hp.com)
- [API reference](/projects/TCS/repos/mutlicloud/browse/docs/Reference.md)
- For **issues or questions**, please open an issue or ask in twitter.


## License
We should add the relevant license file here
