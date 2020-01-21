'use strict'
import { createServer, proxy } from 'aws-serverless-express';
import app from './app';
const binaryMimeTypes = [
  'application/octet-stream',
  'font/eot',
  'font/opentype',
  'font/otf',
  'image/jpeg',
  'image/png',
  'image/svg+xml'
];
const server = createServer(app, null, binaryMimeTypes);
export function handler(event, context) { return proxy(server, event, context); }
