# cloudBlender
A high level library for cloud compute operations that abstracts away differences among multiple cloud providers.

## Installing
The best way to install *cloudBlender*:
<pre><code>
npm install cloudBlender
</code></pre>

## Very easy to use
<pre><code>
var cloud = require('cloudBlender'),
   config = require('../etc/config'), // uploads identity settings and compute settings
   identitySettings = config.identitySettingsHPCS, //don't save it directly in the code
   computeSettings = config.computeSettingsHPCS,
   settings = {
         identitySettings: identitySettings,
         computeSettings: computeSettings,
         provider: 'hpcs',
         nodeParams: {
            imageId: 9883, //ubuntu 12.04
            instanceType: 100, // standard.xlarge
         }
      };

   cloud.createNodes(settings, function(error, result) {
      if (error) {
         console.log('error in create nodes, details:', error);
      }
      else {
         // note that all nodes are currently in ACTIVE state
         // result.nodes will contain the same fields regardless the cloud provoder
         console.log('successfully created nodes', result.nodes);
      }
   });
</code></pre>

## Getting started guide
you can find a getting started guide at:
http://...
you can also visit our wiki for full API documentation:
http://...

## Current version supported operations
The current version allows users to work with HPCS-compute and AWS-EC2 and supports the following operations:

1. createNodes
2. listNodes
3. deleteNodes
4. createImage
5. listImages
6. deleteImage

## License
We should add the relevant license file here
