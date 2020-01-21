'use strict';

import { config as _config, S3 } from 'aws-sdk';
import { urlencoded, json as _json } from 'body-parser';
import { isExpoPushToken } from 'expo-server-sdk';
import express, { Router } from 'express';
import { BucketsApi, ObjectsApi, AuthClientTwoLegged, DerivativesApi } from 'forge-apis';
import { createWriteStream, statSync, existsSync, mkdirSync, readFile, createReadStream } from 'fs';
import helmet from 'helmet';
import { flattenDeep } from 'lodash';
import { resolve as _resolve, join, dirname, extname, basename } from 'path';
import { createClient, print } from 'redis';
import request, { get } from 'request';
import rp from 'request-promise';
import Zip from 'node-zip';

// Load configuration settings
import { REDIS_PORT, REDIS_ENDPOINT, SCOPES, RECAP_OUTPUT_FILE_PATH, BUCKET_KEY, BUBBLES_OUTPUT_DIR, TLS_VERSION, DERIVATIVE_BASE_ENDPOINT, AWS_S3_BUCKET } from './config';

// Load Redis
const client = createClient(REDIS_PORT, REDIS_ENDPOINT, {no_ready_check: true});
client.auth(process.env.REDIS_PASSWORD, function (err) {
  if (err) { console.error('ERROR: Redis authentification failed: ' + err); }
})
client.on('connect', function () { console.info('INFO: Connected to Redis'); })

// Amazon init
_config.update({region: 'us-east-1'});

// Load express
const app = express();
app.use(helmet());

// Load bodyParser
app.use(urlencoded({ extended: false }));
app.use(_json());

// Expo push endpoints
const expoRouter = Router()
expoRouter.post('/tokens', function (req, res) {
  if (!req.body) { res.status(500).send({'Expo': 'Missing body!'}); }
  if (isExpoPushToken(req.body.pushToken)) {
    client.set('pushToken', req.body.pushToken, function (err, reply) {
      if (reply) { res.send({'pushToken': reply, 'source': 'expo cache'}); }
      if (err) { res.status(500).send({'Expo': err}); }
    })
  } else {
    res.status(500).send({'Expo': 'Unrecognized Expo push token!'});
  }
})
app.use('/expo', expoRouter);

// Forge Data Management endpoints
const dataRouter = Router();
dataRouter.post('/uploadAndTranslate', function (req, res) {
  client.get('objectid', function (err, objectid) {
    if (err) { res.status(500).send(err); }
    if (objectid === 'blank') {
      const bucketsApi = new BucketsApi(); // Buckets Client
      const objectsApi = new ObjectsApi(); // Objects Client
      const autoRefresh = true;
      const oAuth2TwoLegged = new AuthClientTwoLegged(
        process.env.FORGE_APP_ID,
        process.env.FORGE_APP_SECRET,
        SCOPES,
        autoRefresh
      );
      oAuth2TwoLegged.authenticate().then(function (credentials) {
        if (!credentials) { res.status(500).send('Empty or undefined credentials!'); }
        createBucketIfNotExist(bucketsApi, oAuth2TwoLegged)
          .then(function (bucketJson) {
            if (!bucketJson) { res.status(500).send('Empty or undefined bucket response!'); }
            client.get('photoscenelink', function (err, photoscenelink) {
              if (err) { res.status(500).send({'ERROR': err}); }
              console.info('INFO: Got photoscenelink value: ' + photoscenelink);
              if (photoscenelink.startsWith('http')) {
                console.info('INFO: Initiating download of scenelink at: ' + photoscenelink);
                get(photoscenelink)
                  .on('error', function (err) { console.error('ERROR: Failed to get photoscenelink: ' + err); })
                  .pipe(createWriteStream(RECAP_OUTPUT_FILE_PATH))
                  .on('finish', () => {
                    console.info('INFO: Output file written to ' + RECAP_OUTPUT_FILE_PATH);
                    try {
                      const zipFileInfo = statSync(RECAP_OUTPUT_FILE_PATH);
                      console.info('INFO: Zip file size: ' + zipFileInfo.size);
                      if (zipFileInfo.size <= 22) {
                        console.error('ERROR: Found corrupt zip file exiting ...');
                        throw new Error('ERROR: Found corrupt zip file, exiting!');
                      }
                      uploadfileToBucket(objectsApi, oAuth2TwoLegged, RECAP_OUTPUT_FILE_PATH)
                        .then(function (uploadRes) {
                          console.info('INFO: Upload results: ' + JSON.stringify(uploadRes));
                          if (!uploadRes) { res.status(500).send({'ERROR': 'Empty or undefined upload response!'}); }
                          client.set('objectid', uploadRes.body.objectId, print)
                          translateToSVF(uploadRes.body.objectId, oAuth2TwoLegged)
                            .then(function (translateRes) {
                              console.info('INFO: translation results: ' + JSON.stringify(translateRes));
                              if (!translateRes) { res.status(500).send({'ERROR': 'Empty or undefined translation response!'}); }
                              res.send(translateRes);
                              res.end();
                            }, function (translateErr) {
                              res.status(500).send({'ERROR': translateErr});
                            })
                        }, function (uploadErr) {
                          res.status(500).send({'ERROR': uploadErr});
                        })
                    } catch (err) {
                      console.error('ERROR: Failed to process scenelink zip file!');
                    }
                  })
              }
            })
          }, function (err) {
            res.status(500).send({'ERROR': err});
          })
      }, function (err) {
        res.status(500).send({'ERROR': err});
      })
    } else {
      res.send({'INFO': 'AlreadyTranslated'});
      res.end();
    }
  })
})
app.use('/data', dataRouter);

// Forge derivative endpoints
const derivativeRouter = Router();
derivativeRouter.get('/downloadBubbles', function (req, res) {
  client.get('objectid', function (err, urn) {
    if (err) { res.status(500).send({'ERROR': err}); }
    const autoRefresh = false;
    const oAuth2TwoLegged = new AuthClientTwoLegged(
      process.env.FORGE_APP_ID,
      process.env.FORGE_APP_SECRET,
      SCOPES,
      autoRefresh
    );
    oAuth2TwoLegged.authenticate().then(function (credentials) {
      download(oAuth2TwoLegged, credentials, urn)
        .then((files) => {
          console.info('download bubbles result: ' + JSON.stringify(files));
          if (files.length > 0) {
            let promise;
            let promiseChain = [];
            for (let index in files) {
              promise = uploadToS3Bucket(files[index]);
              promiseChain.push(promise);
            }
            Promise.all(promiseChain)
              .then(function (results) {
                console.info('INFO: Successfully uploaded bubbles to S3!');
                res.status(200).send(results);
              })
              .catch(function (err) {
                console.error('ERROR: Failed to upload bubbles to S3!');
                res.status(500).send(err);
              })
          }
        })
        .catch(function (err) {
          console.error('ERROR: Failed to download bubbles: ' + JSON.stringify(err));
          res.status(500).send(err);
        })
    }, function (err) {
      res.status(500).send(err);
    })
  })
})
derivativeRouter.get('/getManifest', function (req, res) {
  client.get('objectid', function (err, objectid) {
    if (err) { res.status(500).send({'ERROR': err}); }
    client.get('token', function (err, token) {
      if (err) { res.status(500).send(err); }
      if (objectid && token) {
        getManifest(token, objectid)
          .then(function (manifestJson) {
            if (!manifestJson) { res.status(500).send('Empty or undefined manifest response!'); }
            if (manifestJson) { res.status(200).send(manifestJson); }
          })
          .catch(function (err) {
            res.status(500).send(err);
          })
      }
    })
  })
})
app.use('/derivative', derivativeRouter);

export default app;

function createBucket (bucketsApi, oAuth2TwoLegged) {
  const bucketJson = {'bucketKey': BUCKET_KEY, 'policyKey': 'transient'};
  return bucketsApi.createBucket(bucketJson, {}, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials());
}

function createBucketIfNotExist (bucketsApi, oAuth2TwoLegged) {
  return new Promise(function (resolve, reject) {
    getBucketDetails(bucketsApi, oAuth2TwoLegged)
      .then(function (resp) {
        resolve(resp);
      }, function (err) {
        if (err.statusCode === 404) {
          createBucket(bucketsApi, oAuth2TwoLegged)
            .then(function (res) {
              resolve(res);
            }, function (err) {
              if (err.statusCode === 409) {
                console.info('INFO: The specified bucket key already exists.');
                resolve(err);
              }
              reject(err);
            })
        } else {
          reject(err);
        }
      })
  })
}

function download (oAuth2TwoLegged, credentials, urn) {
  return new Promise(async (resolve, reject) => {
    try {
      // create target directory
      if (!existsSync(BUBBLES_OUTPUT_DIR)) {
        mkdirSync(BUBBLES_OUTPUT_DIR);
      }
      // get auth token
      const derivativesAPI = new DerivativesApi();
      const base64Urn = new Buffer.from(urn).toString('base64');
      const manifest = await derivativesAPI.getManifest(base64Urn, {}, oAuth2TwoLegged, credentials);
      // harvest derivatives
      const derivatives = await getDerivatives(credentials.access_token, manifest.body);
      // format derivative resources
      const nestedDerivatives = derivatives.map((item) => {
        return item.files.map((file) => {
          const localPath = _resolve(BUBBLES_OUTPUT_DIR, item.localPath);
          return {
            basePath: item.basePath,
            guid: item.guid,
            mime: item.mime,
            fileName: file,
            urn: item.urn,
            localPath
          };
        });
      });
      // flatten resources
      const derivativesList = flattenDeep(nestedDerivatives);
      // creates async download tasks for each
      // derivative file
      const downloadTasks = derivativesList.map((derivative) => {
        return new Promise(async (resolve) => {
          const urn = join(derivative.basePath, derivative.fileName);
          const data = await getDerivative(credentials.access_token, urn);
          const filename = _resolve(derivative.localPath, derivative.fileName);
          await saveToDisk(data, filename);
          resolve(filename);
        });
      });
      // wait for all files to be downloaded
      const files = await Promise.all(downloadTasks);
      resolve(files);
    } catch (err) {
      console.error('ERROR: download of bubbles failed! ' + JSON.stringify(err));
      reject(err);
    }
  });
}

function getBucketDetails (bucketsApi, oAuth2TwoLegged) {
  return bucketsApi.getBucketDetails(BUCKET_KEY, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials());
}

function getDerivative (token, urn) {
  return new Promise(async (resolve, reject) => {
    const baseUrl = 'https://developer.api.autodesk.com/';
    const endpoint = baseUrl + `derivativeservice/v2/derivatives/${urn}`;
    request({
      agentOptions: { secureProtocol: TLS_VERSION },
      encoding: null,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept-Encoding': 'gzip, deflate' },
      method: 'GET',
      uri: endpoint
    }, (err, response, body) => {
      if (err) { return reject(err); }
      if (body && body.errors) { return reject(body.errors); }
      if ([200, 201, 202].indexOf(response.statusCode) < 0) { return reject(response); }
      return resolve(body || {});
    })
  });
}

function getDerivatives (token, manifest) {
  return new Promise(async (resolve, reject) => {
    try {
      const items = parseManifest(manifest);
      const derivativeTasks = items.map((item) => {
        switch (item.mime) {
          case 'application/autodesk-svf':
            return getSVFDerivatives(token, item);
          case 'application/autodesk-db':
            return Promise.resolve(
              Object.assign({}, item, {
                files: [
                  'objects_attrs.json.gz',
                  'objects_vals.json.gz',
                  'objects_offs.json.gz',
                  'objects_ids.json.gz',
                  'objects_avs.json.gz',
                  item.rootFileName
                ]}));
          default:
            return Promise.resolve(Object.assign({}, item, { files: [ item.rootFileName ] }));
        }
      })
      const derivatives = await Promise.all(derivativeTasks);
      return resolve(derivatives);
    } catch (err) {
      console.error('Failed to get derivatives! ' + err);
      reject(err);
    }
  });
}

function getManifest (token, objectId) {
  const base64Urn = new Buffer.from(objectId).toString('base64');
  const endpoint = DERIVATIVE_BASE_ENDPOINT + '/designdata/' + base64Urn + '/manifest';
  const options = {
    agentOptions: { secureProtocol: TLS_VERSION },
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    json: true,
    method: 'GET',
    resolveWithFullResponse: true,
    uri: endpoint
  };
  return rp(options)
    .then(res => {
      if (res.statusCode === 200) {
        return res.body;
      }
      console.error('ERROR: Failed to get manifest!\n');
    })
    .catch(reason => {
      console.error(`ERROR: Failed to get manifest: ${JSON.stringify(reason)}\n`);
    })
}

function getItemPathInfo (encodedURN) {
  const urn = decodeURIComponent(encodedURN);
  const rootFileName = urn.slice(urn.lastIndexOf('/') + 1);
  const basePath = urn.slice(0, urn.lastIndexOf('/') + 1);
  const localPathTmp = basePath.slice(basePath.indexOf('/') + 1);
  const localPath = localPathTmp.replace(/^output\//, '');
  return {
    rootFileName,
    localPath,
    basePath,
    urn
  };
}

function getSVFDerivatives (token, item) {
  return new Promise(async (resolve, reject) => {
    try {
      const svfPath = item.urn.slice(item.basePath.length);
      const files = [svfPath];
      const data = await getDerivative(token, item.urn);
      const pack = new Zip(data, { checkCRC32: true, base64: false });
      const manifestData = pack.files['manifest.json'].asNodeBuffer();
      const manifest = JSON.parse(manifestData.toString('utf8'));
      if (manifest.assets) {
        manifest.assets.forEach((asset) => {
          // Skip SVF embedded resources
          if (asset.URI.indexOf('embed:/') === 0) { return; }
          files.push(asset.URI);
        })
      }
      return resolve(Object.assign({}, item, { files }));
    } catch (ex) {
      reject(ex);
    }
  })
}

function parseManifest (manifest) {
  const items = [];
  const parseNodeRec = (node) => {
    const roles = [
      'Autodesk.CloudPlatform.DesignDescription',
      'Autodesk.CloudPlatform.PropertyDatabase',
      'Autodesk.CloudPlatform.IndexableContent',
      'leaflet-zip',
      'thumbnail',
      'graphics',
      'preview',
      'raas',
      'pdf',
      'lod'
    ];
    if (roles.includes(node.role)) {
      const item = { guid: node.guid, mime: node.mime };
      const pathInfo = getItemPathInfo(node.urn);
      items.push(Object.assign({}, item, pathInfo));
    }
    if (node.children) {
      node.children.forEach((child) => { parseNodeRec(child) });
    }
  }
  parseNodeRec({ children: manifest.derivatives });
  return items;
}

function saveToDisk (data, filename) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!existsSync(dirname(filename))) {
        mkdirSync(dirname(filename));
      }
      const wstream = createWriteStream(filename);
      const ext = extname(filename);
      wstream.on('finish', () => { resolve() })
      if (typeof data === 'object' && ext === '.json') {
        wstream.write(JSON.stringify(data));
      } else {
        wstream.write(data);
      }
      wstream.end();
    } catch (err) {
      reject(err);
    }
  })
}

function translateToSVF (objectId, oAuth2TwoLegged) {
  return new Promise(function (resolve, reject) {
    const derivativeApi = new DerivativesApi();
    const base64Urn = new Buffer.from(objectId).toString('base64');
    const job = {
      'input': { 'urn': base64Urn, 'compressedUrn': true, 'rootFilename': 'result.obj' },
      'output': { 'formats': [ { 'type': 'svf', 'views': [ '2d', '3d' ] } ] }
    };
    const options = { 'xAdsForce': true };
    console.info(`INFO: Submitting translation job for urn: ${objectId}`);
    console.info(`INFO: Job details: ${JSON.stringify(job)}`);
    derivativeApi.translate(job, options, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials())
      .then(function (resp) {
        if (resp.statusCode === 200) {
          resolve(resp);
        } else {
          reject(resp);
        }
      }, function (err) {
        reject(err);
      });
  });
}

function uploadfileToBucket (objectsApi, oAuth2TwoLegged, filePath) {
  return new Promise(function (resolve, reject) {
    readFile(filePath, function (err, data) {
      if (err) {
        reject(err);
      } else {
        const fileName = filePath.split('/').pop();
        objectsApi.uploadObject(BUCKET_KEY, fileName, data.length, data, {}, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials())
          .then(function (res) {
            resolve(res);
          }, function (err) {
            reject(err);
          });
      }
    });
  });
}

function uploadToS3Bucket (svfFilePath) {
  const s3 = new S3({apiVersion: '2006-03-01'});
  let uploadParams = {Bucket: AWS_S3_BUCKET};
  const fileStream = createReadStream(svfFilePath);
  fileStream.on('error', function (err) {
    console.log('File Error', err);
  })
  uploadParams.Body = fileStream;
  uploadParams.Key = basename(svfFilePath);
  // call S3 to retrieve upload file to specified bucket
  const uploadPromise = s3.upload(uploadParams).promise();
  return uploadPromise
    .then(function (data) {
      console.info(`INFO: Successfully uploaded SVF file to S3! S{JSON.stringify(data)}\n`);
    })
    .catch(function (err) {
      console.error(`ERROR: Failed to upload SVF file to S3! ${err}\n`);
    });
}
