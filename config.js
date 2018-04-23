'use strict';

module.exports = {
  // Amazon settings
  AWS_S3_BASE_ENDPOINT: 'https://s3.amazonaws.com',
  AWS_S3_BUCKET: '<your bucket name>',
  // Redis settings
  REDIS_ENDPOINT: '<your redis endpoint>.cloud.redislabs.com',
  REDIS_PORT: 19812,
  // DO NOT EDIT BELOW THIS LINE
  // Autodesk Forge settings
  DERIVATIVE_BASE_ENDPOINT: 'https://developer.api.autodesk.com/modelderivative/v2',
  OSS_BASE_ENDPOINT: 'https://developer.api.autodesk.com/oss/v2',
  STORAGE_BASE_ENDPOINT: 'https://developer.api.autodesk.com/data/v1',
  SCOPES: ['bucket:create','bucket:read','data:create','data:read','data:write'],
  // Autodesk Data Management settings
  BUCKET_KEY: 'reality-capture-output',
  RECAP_OUTPUT_FILE_PATH: '/tmp/reality-capture-output.zip',
  BUBBLES_OUTPUT_DIR: '/tmp/derivatives',
  BUBBLES_FILE_PATH: '/tmp/derivatives.zip',
};
