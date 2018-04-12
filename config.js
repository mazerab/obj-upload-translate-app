'use strict';

module.exports = {
  // Autodesk Forge settings
  DERIVATIVE_BASE_ENDPOINT: 'https://developer.api.autodesk.com/modelderivative/v2',
  OSS_BASE_ENDPOINT: 'https://developer.api.autodesk.com/oss/v2',
  STORAGE_BASE_ENDPOINT: 'https://developer.api.autodesk.com/data/v1',
  SCOPES: ['bucket:create','bucket:read','data:create','data:read','data:write'],
  // Redis settings
  REDIS_ENDPOINT: '<your redis endpoint>.cloud.redislabs.com',
  REDIS_PORT: 19812,
  // Autodesk Data Management settings
  BUCKET_KEY: 'reality-capture-output',
  OUTPUT_FILE_PATH: '/tmp/reality-capture-output.zip',
};
