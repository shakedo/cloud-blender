# CloudBlender 0.1.x API Reference


- [`listNodes(settings, callback)`](#listNodes)
- [`createNodes(settings, callback)`](#createNodes)
- [`deleteNodes(settings, callback)`](#deleteNodes)
- [`listImages(settings, callback)`](#listImages)
- [`createImage(settings, callback)`](#createImage)
- [`deleteImage(settings, callback)`](#deleteImage)
- [`setProxy(proxyUrl)`](#setProxy)
- [`identitySettings`](#identitySettings)
- [`computeSettings`](#computeSettings)
- [`vendorSpecificParams`](#vendorSpecificParams)


### `listNodes(settings, callback)`
Retrieves a list of nodes for a given cloud provider's region.

- `settings` - An input object that contains:
  - `identitySettings` An object with the cloud provider's region credentials as described in 
  [identitySettings](#identitySettings).
  - `computeSettings` An object with the cloud provider's region compute settings as described in 
  [computeSettings](#computeSettings).
  - `provider`  "hpcs" for **hpcs-compute** and "aws" for **aws-ec2**
  - [`vendorSpecificParams`] - An optional object with keys and values as described in
  [`vendorSpecificParams`](#vendorSpecificParams).
- `callback` - is `function(error, result)` where:
  - `error` - internal error condition
  - `result` - an object that contains:
    - `rawResult` - the raw result that were retrieved from the cloud provider
    converted to a JSON file (even if the real response is XML based like in aws)
    - `nodes` - an array of nodes that are currently exist on the cloud.
    Notice the `nodes` only contains information that is available from all cloud vendors.
    (For example: some cloud vendors API returns terminated instances which CloudBlender filters
    since it is not cross cloud platform - these instances are not filtered in the rawResult
    property). Each node contains:
      - `id` the machine unique identifier of the clod provider.
      - `status` a string representing the node status. **ACTIVE** means running, all other states indicate that the
      machine is not currently running. Machines that in fail state will have **ERROR_errorType**
      - `addresses` an array of IP addresses where addresses[0] holds the private IP address
      and array[1] holds the public address. Notice that for new machines these may be undefined.
      - `tags` - a key pair object storage that is associated with the node. This object usually 
      created in the provisioning request (but may be defined later using currently unsupported 
      api calls).

Usage Example:
```javascript
   var config = require('./etc/config'),
      cloud = require('CloudBlender');

   var settings = {
      identitySettings: config.identitySettings,
      computeSettings: config.computeSettings,
      provider: config.provider
    };

   cloud.listNodes(settings, function(error, result) {
      if (error) {
         console.log('error:', error);
      }
      else {
         console.log('nodes are: ', result.nodes);
      }
   });
 
```

### `createNodes(settings, callback)`
Creates a list of nodes on a given cloud provider's region.

- `settings` - An input object that contains:
  - `identitySettings` An object with the cloud provider's region credentials as described in 
  [identitySettings](#identitySettings).
  - `computeSettings` An object with the cloud provider's region compute settings as described in 
  [computeSettings](#computeSettings).
  - `regionConfiguration` The region settings and limitations that should contain:
    - `postRatePerMinuteLimits` The regions post rate limitation
  - `provider`  "hpcs" for **hpcs-compute** and "aws" for **aws-ec2**
  - [`vendorSpecificParams`] - An optional object with keys and values as described in
  [`vendorSpecificParams`](#vendorSpecificParams).
  - `nodes` - an array  of input nodes. Each input contains:
    - `imageId` - The image id of the created server
    - `instanceType` - The instance type (e.g. small, medium etc...).
    - `(tags)` - an optional key-value object that will be bounded to the machine
    - `(userData)` - an optional key-value object that will be known to the machine once 
    its loaded.
    - `(keyName)` - an optional key-pair to be associated with the machine.
- `callback` - is a `function(error, result)` that is called after all the machines 
were loaded, where:
  - `error` - internal error condition
  - `result` - an object that contains:
    - `rawResults` - an array of raw results that were retrieved from the cloud provider
    after each post request.
    - `nodes` - an array of nodes that are currently exist on the cloud.
    Notice the `nodes` only contains information that is available from all cloud vendors.
    (For example: some cloud vendors api returns terminated instances which CloudBlender filters
    since it is not cross cloud platform - these instances are not filtered in the rawResult
    property). Each node contains:
      - `id` the machine unique identifier of the clod provider.
      - `status` a string representing the node status. **ACTIVE** means running, all other states indicate that the
      machine is not currently running. Machines that in fail state will have **ERROR_errorType**
      - `addresses` an array of IP addresses where addresses[0] holds the private IP address
      and array[1] holds the public address. Notice that for new machines these may be undefined.
      - `tags` - a key pair object storage that will be associated with the node. This object usually 
      created in the provisioning request (but may be defined later using currently unsupported 
      API calls).

A Note about node names:

**CloudBlender** considers node name as a private data and is not using it to any
purpose. On **hpcs-compute** the node name is required and unique so by default 
**CloudBlender** generates the node name for the user in a way it will be unique.
If you want to have a specific name - you can pass it with [vendorSpecificParam]().
The value there will overwrite the default value given by **CloudBlender**.
Notice that **aws-ec2** does not have node name at all.
If you need a cross cloud provider's node name, please use the tags mechanism, since
it is supported in all cloud vendors.




### `deleteNodes(settings, callback)`
Deletes a given list of nodes from the cloud provider region

- `settings` - An input object that contains:
  - `identitySettings` An object with the cloud provider's region credentials as described in 
  [identitySettings](#identitySettings).
  - `computeSettings` An object with the cloud provider's region compute settings as described in 
  [computeSettings](#computeSettings).
  - `regionConfiguration` The region settings and limitations that should contain:
    - `deleteRatePerMinuteLimits` The regions delete rate limitation
  - `provider`  "hpcs" for **hpcs-compute** and "aws" for **aws-ec2**
  - [`vendorSpecificParams`] - An optional object with keys and values as described in
  [`vendorSpecificParams`](#vendorSpecificParams).
  - `nodesIds` an array of node ids to delete
- `callback` - is `function(error, result)` which is called after the machines were actually 
deleted, where:
  - `error` - internal error condition. If error is undefined the operation succeeded.
  - `result` - an object that contains:
    - `rawResults` - an array of raw result that were retrieved from the cloud provider
    after each delete request.

### `listImages(settings, callback)`
Retrieves a list of images for a given cloud provider's region.

- `settings` - An input object that contains:
  - `identitySettings` An object with the cloud provider's region credentials as described in 
  [identitySettings](#identitySettings).
  - `computeSettings` An object with the cloud provider's region compute settings as described in 
  [computeSettings](#computeSettings).
  - `provider`  "hpcs" for **hpcs-compute** and "aws" for **aws-ec2**
  - [`vendorSpecificParams`] - An optional object with keys and values as described in
  [`vendorSpecificParams`](#vendorSpecificParams).
- `callback` - is `function(error, result)` where:
  - `error` - internal error condition
  - `result` - an object that contains:
    - `rawResult` - the raw result that were retrieved from the cloud provider
    converted to a JSON file (even if the real response is XML based like in aws)
    - `images` - an array of images that are currently available in the region.
    Each image contains the following properties:
      - `id` - Unique cloud provider's ID for the image
      - `status` - The image status (ACTIVE means o.k).
      - `name` - The image unique name 
      - `tags` - A key pair object storage that is associated with the image.

### `createImage(settings, callback)`
Creates a single image on a given cloud provider's region.

- `settings` - An input object that contains:
  - `identitySettings` An object with the cloud provider's region credentials as described in 
  [identitySettings](#identitySettings).
  - `computeSettings` An object with the cloud provider's region compute settings as described in 
  [computeSettings](#computeSettings).
  - `provider`  "hpcs" for **hpcs-compute** and "aws" for **aws-ec2**
  - [`vendorSpecificParams`] - An optional object with keys and values as described in
  [`vendorSpecificParams`](#vendorSpecificParams).
  - `imageParams` an object contains the following:
     - `nodeId` - The node to create the image from.
     - `(tags)` - an optional key pair object storage that will be associated with the image.
- `callback` - is `function(error, result)` which is called when the image is in **ACTIVE**
state, where:
  - `error` - internal error condition
  - `result` - an object that contains:
    - `rawResult` - the raw result that were retrieved from the cloud provider
    converted to a JSON file (even if the real response is XML based like in aws)
    - `imageId` - the newly created image id

A note about image name:

**CloudBlender** considers image name as a private data and is not using it to any
purpose. The image name must be unique with most cloud provider's so by default 
**CloudBlender** generates the image name for the user in a way it will be unique.
If you want to have a specific name - you can pass it with [vendorSpecificParam]().
the value there will overwrite the default value given by **CloudBlender**


Few implementation notes:

- On **hpcs-compute** it just creates a snapshot from a given instance.
- On **aws-ec2** it uses the aws-ec2's `CreateImage` API call on a given instance, resulting in 
a new EBS snapshot and a registered AMI.


### `deleteImage(settings, callback)`
Deletes an image from a given cloud provider's region.

- `settings` - An input object that contains:
  - `identitySettings` An object with the cloud provider's region credentials as described in 
  [identitySettings](#identitySettings).
  - `computeSettings` An object with the cloud provider's region compute settings as described in 
  [computeSettings](#computeSettings).
  - `provider`  "hpcs" for **hpcs-compute** and "aws" for **aws-ec2**
  - [`vendorSpecificParams`] - An optional object with keys and values as described in
  [`vendorSpecificParams`](#vendorSpecificParams).
  - `imageParams` an object contains the following:
     - `imageId` - The image id to delete.
- `callback` - is a `function(error, result)` which is called after the image is deleted, 
where:
  - `error` - internal error condition
  - `result` - an object that contains:
    - `rawResult` - the raw result that were retrieved from the cloud provider
    converted to a JSON file (even if the real response is XML based like in aws)

Few notes:

- On **hpcs-compute** it just deletes the snapshot.
- On **aws-ec2** it dergisters the AMI and then tries to delete all the EBS snapshots
that are associated to it. If a given snapshot will be associated to a different AMI during
the deleteImage call (a thing that can't happen if you are only using **CloudBlender** API to 
manipulate images), the snapshot will not be deleted and an error will return. Notice that
the image will still be deregistered in this case.

### `setProxy(proxyUrl)`
Sets a proxy for outgoing traffic.
`proxyUrl` a string in the form of http://yourproxy.com:8080

### `identitySettings`
A cloud provider's specific object that contains the information that is needed 
for authentication.

**hpcs-compute** object contains access and secret keys, tenant id, region name and should look like:
```javascript
{
   "auth": {
      "apiAccessKeyCredentials": {
         "accessKey": "<your hp access key here>",
         "secretKey": "<your hp secret key here>"
      },
      "tenantId": "<your tenant id>"
   },
   "url": "https://<hp region (e.g. region-a.geo-1)>.identity.hpcloudsvc.com:35357/v2.0/tokens"
}

```
**aws-ec2** object contains access and secret keys and should look like:
```javascript
{
   "credentials": { 
      "accessKeyId": "<your aws access key here>",
      "secretAccessKey": "<your aws secret key here>"
   }
}
```

Few notes about identification process:

- on **hpcs**, an identification token must be present in each API call as a HTTP header.
This token is retrieved by accessing **hpcs-identitifcation service**.
Before each API call **CloudBlender** checks if such a valid (non expired) token exist in the `identitySettings`,
and if not it retrieves one and saves it for sequential API calls inside the identitySettings.
Working this way saves many unnecessary calls to the identification service, so the best
practice is always to use the same `identitySettings` object.

- **aws-ec2** has no such mechanism, its access and secret keys are used to sign the API
call and identify the tenant.

### `computeSettings`
A cloud provider's specific object that contains information on how to work with
specific region/sub-regions' cloud provider.

**hpcs-compute** object should contain the compute URL (contains region, availability
zone and tenant id) and should look like:
```javascript
{
   "url": "https://az-2.region-a.geo-1.compute.hpcloudsvc.com/v1.1/<your tenant id>" // az2 in us west of the given tenant id
}
```

**aws-ec2** object should contain the region/sub-region's name and should look like:
```javascript
{
   "region": "us-east-1"
}
```

### `vendorSpecificParams`
The API used by **CloudBlender** can only get inputs that are common to all cloud vendors.
It is possible, however, to set specific parameter to a specific cloud vendor by passing
it inside the optional `vendorSpecificParam` object. This object is a key-value store.
The keyis and values that are in this object will always overwrite the paramters of the 
regular inputs.
Note that when using this object, your code might not be cross platform, so use it carefully.



