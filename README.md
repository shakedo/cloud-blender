# CloudBlender
A high level library for cloud compute operations that abstracts away differences among multiple cloud providers.



## Installing
The best way to install **CloudBlender**:
<pre><code>
npm install cloudBlender
</code></pre>



## Very Easy to Use
Example of reteriving all the nodes in a region
<pre><code>
var cloud = require('cloudBlender'),
   config = require('../etc/config'), //read credentials from a file or environment variable
                                        instead of hard coding the credentials!
                                        (look in etc/config_example.json for an example)
   settings = {
         provider: 'hpcs',
         identitySettings: config.identitySettingsHPCS,
         computeSettings: config.computeSettingsHPCS
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
</code></pre>



## Advanced Use Cases
Example of creating multiple nodes with different configurations in the same
provisioning request. Note that there is no cloud provider API that allows the 
flexibility to create in the same call different configurations such as tags
 and different instanceType. Notice that the region post rate is non standard.
<pre><code>
var cloud = require('cloudBlender'),
   config = require('../etc/config'), //read credentials from a file or environment variable
                                        instead of hard coding the credentials!
                                        (look in etc/config_example.json for an example)
   settings = {
         provider: 'hpcs',
         identitySettings: config.identitySettingsHPCS,
         computeSettings: config.computeSettingsHPCS, //we use us-west-az2 in this example
         regionConfiguration: {
            postRatePerMinuteLimits: 200,
         }
         servers: [ // notice that we use multiple configurations in the same request
            {
               imageId: imageId: 9883, //ubunbtu 12.04, only known in uswest-az-2
               instanceType: 100, //xsmall
               tags: {
                  logicName: 'machine1'
               }
            },
            {
               imageId: imageId: 9883, 
               instanceType: 103, //large
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
         //result.nodes will contain the same fields regardless the cloud privider
         //result.rawResult will contain the original result from the cloud provider
         console.log('successfully created nodes', result.nodes);
      }
   });
</code></pre>



## Current Cloud Providers Support
The current version supports **HPCS-compute** and **AWS-EC2**.



## Current Version Supported Operations
The current version supports the following operations:

- createNodes
- listNodes
- deleteNodes
- createImage
- listImages
- deleteImage



## Additional Information
- For the **latest updates** follow [@CloudBlender](https://twitter.com/CloudBlender).
- For more **information, tutorials, and references** on the currently published version, visit [**CloudBlender**](http://somelink@hp.com)
- [API reference](/docs/Reference.md)
- For **issues or questions**, please open an issue or ask in twitter.

## License
We should add the relevant license file here
