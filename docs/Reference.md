# CloudBlender 0.0.x API Reference

- [`listNodes(settings, callback)`](#listNodes)
- [`createNodes(settings, callback)`](#createNodes)
- [`deleteNodes(settings, callback)`](#deleteNodes)
- [`listImages(settings, callback)`](#listImages)
- [`createImage(settings, callback)`](#createImage)
- [`deleteImage(settings, callback)`](#deleteImage)
- [`setProxy(proxyUrl)`](#setProxy)
- [`createRegionContext(providerName, regionAuthSettings, regionLimits)`](#createRegionContext)
- [`vendorSpecificParams`](#vendorSpecificParams)


### `listNodes(settings, callback)`
Retrieves a list of nodes for a given cloud provider's region.

- `settings` - An input object that contains:
  - `regionContext` An object with the cloud provider's region credentials, settings and limits as described in 
  [createRegionContext](#createRegionContext).
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

### `createNodes(settings, callback)`
Creates a list of nodes on a given cloud provider's region.

- `settings` - An input object that contains:
  - `regionContext` An object with the cloud provider's region credentials, settings and limits as described in 
  [createRegionContext](#createRegionContext).
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
      machine is not currently running. Machines that are in fail state will have **ERROR_errorType**
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
  - `regionContext` An object with the cloud provider's region credentials, settings and limits as described in 
  [createRegionContext](#createRegionContext).
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
  - `regionContext` An object with the cloud provider's region credentials, settings and limits as described in 
  [createRegionContext](#createRegionContext).
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
  - `regionContext` An object with the cloud provider's region credentials, settings and limits as described in 
  [createRegionContext](#createRegionContext).
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
  - `regionContext` An object with the cloud provider's region credentials, settings and limits as described in 
  [createRegionContext](#createRegionContext).
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
- On **aws-ec2** it de registers the AMI and then tries to delete all the EBS snapshots
that are associated to it. If a given snapshot will be associated to a different AMI during
the deleteImage call (a thing that can't happen if you are only using **CloudBlender** API to 
manipulate images), the snapshot will not be deleted and an error will return. Notice that
the image will still be de registered in this case.

### `setProxy(proxyUrl)`
Sets a proxy for outgoing traffic.

- `proxyUrl` a string in the form of http://yourproxy.com:8080


### `createRegionContext(providerName, regionAuthSettings, regionLimits)`
Create a region specific context that allows cloud-blender to authenticate and cache some data
for optimization purposes. It also contains the region's rate limits so that cloud-blender
will not exceed them.

- `providerName`: A string containing "hpcs" for **HPCS-compute v12.12** or "hpcs" for **HPCS-compute v13.5** or "aws" for **AWS-EC2**"
- `regionLimits` is an object containing regions rate limits

   - `postRatePerMinute` A number representing the amount of HTTP POST requests that are
   allowed per minute in the region.
   - `deleteRatePerMinut` A number representing the amount of HTTP DELETE requests that are
   allowed per minute in the region.
- `regionAuthSettings` - An object containing different set of parameters according to the cloud provider:

   - **AWS** the data can be obtained from:
      http://docs.aws.amazon.com/fws/1.1/GettingStartedGuide/index.html?AWSCredentials.html
      
      - `accessKey` AWS access key
      - `secretKey` AWS secret key
      - `region` the region

   - **HPCS** the data can be obtained from:
      https://blog.hpcloud.com/using-hp-cloud-identity-service
      
      - `accessKey` HPCS access key
      - `secretKey` HPCS secret key
      - `region` HPCS region e.g. region-a.geo-1 for uswest
      - `availabilityZone` hpcs availability zone inside the region e.g. az-2
      - `tenantId` hpcs tenant id.


Few notes about the identification process:

- on **hpcs**, an identification token must be present in each API call as a HTTP header.
This token is retrieved by accessing **hpcs-identitifcation service**.
Before each API call **CloudBlender** checks if such a valid (non expired) token exist in the `regionContext`,
and if not it retrieves one and saves it for sequential API calls inside the `regionContext`.
Working this way saves many unnecessary calls to the identification service, so the best
practice is always to use the same `regionContext` object for the same region.

- **aws-ec2** has no such mechanism, its access and secret keys are used to sign the API
call and identify the tenant.

### `vendorSpecificParams`
The API used by **CloudBlender** can only get inputs that are common to all cloud vendors.
It is possible, however, to set specific parameter to a specific cloud vendor by passing
it inside the optional `vendorSpecificParam` object. This object is a key-value store.
The keys and values that are in this object will always overwrite the parameters of the 
regular inputs.
Note that when using this object, your code might not be cross platform, so use it carefully.



