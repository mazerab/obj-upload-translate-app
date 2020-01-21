'use strict';

export const DERIVATIVE_BASE_ENDPOINT = 'https://developer.api.autodesk.com/modelderivative/v2';
export const OSS_BASE_ENDPOINT = 'https://developer.api.autodesk.com/oss/v2';
export const STORAGE_BASE_ENDPOINT = 'https://developer.api.autodesk.com/data/v1';
export const SCOPES = ['bucket:create', 'bucket:read', 'data:create', 'data:read', 'data:write'];
// SSL / TLS settings
export const TLS_VERSION = 'TLSv1_2_method';
// Redis settings
export const REDIS_ENDPOINT = '<your redis server url>.cloud.redislabs.com';
export const REDIS_PORT = 19812;
// Autodesk Data Management settings
export const BUCKET_KEY = 'reality-capture-output';
export const RECAP_OUTPUT_FILE_PATH = '/tmp/reality-capture-output.zip';
export const BUBBLES_OUTPUT_DIR = '/tmp/derivatives';
export const BUBBLES_FILE_PATH = '/tmp/derivatives.zip';
// Amazon settings
export const AWS_S3_BASE_ENDPOINT = 'https://s3.amazonaws.com';
export const AWS_S3_BUCKET = 'xxx';
