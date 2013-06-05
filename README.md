# cloudBlender
A high level library for cloud compute operations that abstracts away differences among multiple cloud providers.

## Installing
The best way to install *cloudBlender*:
```sh
npm install cloudBlender
```
## Very easy to use
Example of how to create multiple nodes with different configurations (tags and instanceType):
```js
var cloud = require('cloudBlender'),
   config = require('../etc/config'), // instead of hard coding the credentials!
   settings = {
         provider: 'hpcs',
         identitySettings: config.identitySettingsHPCS,
         computeSettings: config.computeSettingsHPCS, //we use us-west in this example
         regionConfiguration: {
            postRatePerMinuteLimits: 200,
         }
         servers: [ // notice that we use multiple configurations in the same request
            {
               imageId: imageId: 9883, //ubunbtu 12.04
               instanceType: 100, //xsmall
               tags: {
                  description: 'created by cloudBlender mocha test',
                  logicName: 'machine1'
               }
            },
            {
               imageId: imageId: 9883, 
               instanceType: 103, //large
               tags: {
                  description: 'created by cloudBlender mocha test',
                  logicName: 'machine2'
               }
            }]
      };

   cloud.createNodes(settings, function(error, result) {
      if (error) {
         console.log('error in create nodes, details:', error);
      }
      else {
         // note that all nodes are currently in ACTIVE state
         // result.nodes will contain the same fields regardless the cloud privider
         console.log('successfully created nodes', result.nodes);
      }
   });
```

## Getting started guide
you can find a getting started guide at:
http://...
you can also visit our wiki for full API documentation:
http://...

## Current cloud providers support
The current version supports *HPCS-compute* and *AWS-EC2*.

## Current version supported operations
The current version supports the following operations:

1. createNodes
2. listNodes
3. deleteNodes
4. createImage
5. listImages
6. deleteImage

## License
We should add the relevant license file here
