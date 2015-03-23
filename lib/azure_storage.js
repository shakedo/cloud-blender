var azure = require('azure-storage'),
   underscore = require('underscore');

module.exports = (function () {

   var tableService = azure.createTableService();


   var that = {

      createTable: function (tableName, callback) {
         tableService.createTableIfNotExists(tableName, function (error, result, response) {
            if (!error) {
               callback(error);
               return;
            }
            callback(null, 'true');
         });

      },

      addNodeTagging: function (partition, id, KeysValues, launchStatus, cloudServiceSetting, callback) {

         var tableService = azure.createTableService(),
            entGen = azure.TableUtilities.entityGenerator,
            entity = {},
            index = 1;

         entity.PartitionKey = entGen.String(partition);
         entity.RowKey = entGen.String(id);
         entity.launchStatus = entGen.String(launchStatus);
         entity.cloudService = entGen.String(cloudServiceSetting.cloudService);
         entity.deployment = entGen.String(cloudServiceSetting.deployment);

         underscore.each(underscore.keys(KeysValues), function (Key) {
            entity['keys' + index] = entGen.String(Key);
            entity['values' + index] = entGen.String(KeysValues[Key]);
            index += 1;
         });

         tableService.insertEntity('nodesTagging', entity, function (error, result, response) {
            if (error) {
               console.log('error adding tagging-' + error);
               callback(error);
               return;
            }

            callback(null, true);
         });

      },

      addImageTagging: function (partition, id, KeysValues, callback) {

         var tableService = azure.createTableService(),
            entGen = azure.TableUtilities.entityGenerator,
            entity = {},
            index = 1;

         entity.PartitionKey = entGen.String(partition);
         entity.RowKey = entGen.String(id);

         underscore.each(underscore.keys(KeysValues), function (Key) {
            entity['keys' + index] = entGen.String(Key);
            entity['values' + index] = entGen.String(KeysValues[Key]);
            index += 1;
         });


         tableService.insertEntity('imageTagging', entity, function (error, result, response) {
            if (error) {
               console.log('error adding image tagging-' + error);
               callback(error);
               return;
            }

            callback(null, true);
         });

      },

      addNodeIp: function (partition, id, ip, callback) {
         var tableService = azure.createTableService(),
            entGen = azure.TableUtilities.entityGenerator,
            entity = {},
            index = 1;

         entity.PartitionKey = entGen.String(partition);
         entity.RowKey = entGen.String(id);
         entity.ip = entGen.String(ip);

         tableService.insertEntity('nodesIps', entity, function (error, result, response) {
            if (error) {
               console.log('error adding node ip to storage-' + error);
               callback(error);
               return;
            }

            callback(null, true);
         });

      },


      getImageTagging: function (partition, id, callback) {
         var image = {finalTagging: {}};
         tableService = azure.createTableService();

         tableService.retrieveEntity('imageTagging', partition, id, function (error, result, response) {
            if (error) {
               callback(error);
               return;
            }

            underscore.forEach(underscore.filter(underscore.keys(response.body), function (key) {
               return key.indexOf('key') > -1;
            }), function (key) {
               image.finalTagging[response.body[key]] = response.body['values' + key.substring(4, 5)];

            });

            callback(null, image);
         });
      },

      getNodeTagging: function (partition, id, callback) {

         var node = {finalTagging: {}, cloudService: {}, deployment: {}};
         tableService = azure.createTableService();

         tableService.retrieveEntity('nodesTagging', partition, id, function (error, result, response) {
            if (error) {
               callback(error);
               return;
            }

            node.cloudService = response.body.cloudService;
            node.deployment = response.body.deployment;

            underscore.forEach(underscore.filter(underscore.keys(response.body), function (key) {
               return key.indexOf('key') > -1;
            }), function (key) {
               node.finalTagging[response.body[key]] = response.body['values' + key.substring(4, key.length)];

            });

            callback(null, node);
         });

      },

      getNodes: function (partition, callback) {


         var tableService = azure.createTableService(),
            TableQuery = azure.TableQuery,
            tableQuery = new TableQuery(),
            query = tableQuery.where('PartitionKey eq ?', partition);

         tableService.queryEntities('nodesTagging', query, null, function (error, result, response) {
            if (error) {
               console.log('error-' + error);
               callback(error);
               return;
            }
            callback(null, response.body.value);

         });


      },

      getImages: function (partition, callback) {


         var tableService = azure.createTableService(),
            TableQuery = azure.TableQuery,
            tableQuery = new TableQuery(),
            query = tableQuery.where('PartitionKey eq ?', partition);

         tableService.queryEntities('imageTagging', query, null, function (error, result, response) {
            if (error) {
               console.log('error-' + error);
               callback(error);
               return;
            }
            callback(null, response.body.value);

         });


      },

      deleteTagging: function (entityType, partition, id, callback) {
         var tableService = azure.createTableService(),
            entGen = azure.TableUtilities.entityGenerator,
            task = {
               PartitionKey: {'_': partition},
               RowKey: {'_': id}
            }, tableName;

         switch (entityType) {
            case 'node':
               tableName = 'nodesTagging';
               break;
            case 'image':
               tableName = 'imageTagging';
               break;
            case 'pIp':
               tableName = 'nodesIps';
               break;

         }

         tableService.deleteEntity(tableName, task, function (error, response) {
            if (error) {
               console.log('error delete ' + entityType + ' tagging-' + error);
               callback(error);
               return;
            }

            callback(null, true);
         });

      },

      associateAddress: function(settings, callback){
         var error = new Error('no implementation');
         callback(error, null);
      },

      disassociateAddress: function(settings, callback){
         var error = new Error('no implementation');
         callback(error, null);
      }



   };

   return that;
})();










