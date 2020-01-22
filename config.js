'use strict';

module.exports = {
  // Autodesk Forge settings
  DERIVATIVE_BASE_ENDPOINT: 'https://developer.api.autodesk.com/modelderivative/v2',
  OSS_BASE_ENDPOINT: 'https://developer.api.autodesk.com/oss/v2',
  STORAGE_BASE_ENDPOINT: 'https://developer.api.autodesk.com/data/v1',
  SCOPES: ['bucket:create', 'bucket:read', 'data:create', 'data:read', 'data:write'],
  // SSL / TLS settings
  TLS_VERSION: 'TLSv1_2_method',
  // Redis settings
  REDIS_ENDPOINT: '<your redis server>.cloud.redislabs.com',
  REDIS_PORT: 17538,
  // Autodesk Data Management settings
  BUCKET_KEY: 'reality-capture-output',
  RECAP_OUTPUT_FILE_PATH: '/tmp/reality-capture-output.zip',
  BUBBLES_OUTPUT_DIR: '/tmp/derivatives',
  BUBBLES_FILE_PATH: '/tmp/derivatives.zip',
  // Amazon settings
  AWS_ACCESS_KEY_ID: process.env.AWS_ID,
  AWS_S3_BASE_ENDPOINT: 'https://s3.amazonaws.com',
  AWS_S3_BUCKET: 'xxx',
  AWS_EXPIRES_SECONDS: 300,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET
};
