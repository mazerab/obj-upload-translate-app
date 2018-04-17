'use strict';

const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const Expo = require('expo-server-sdk');
const express = require('express');
const fetch = require('node-fetch');
const forgeSDK = require('forge-apis');
const fs = require('fs');
const path = require('path');
const redis = require('redis');
const request = require('request');
const unzip = require('unzip');

// Load configuration settings
const config = require('./config');

// Load Redis
const client = redis.createClient(config.REDIS_PORT, config.REDIS_ENDPOINT, {no_ready_check: true});
client.auth(process.env.REDIS_PASSWORD, function(err) {
  if (err) { console.error('ERROR: Redis authentification failed: ' + err); };
});
client.on('connect', function() { console.info('INFO: Connected to Redis'); });

// Load Expo SDK client
const expo = new Expo();

// Amazon init
AWS.config.update({region: 'us-east-1'});

// Load express
const app = express();

// Load bodyParser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Expo push endpoints
const expoRouter = express.Router();
expoRouter.post('/tokens', function(req, res) {
  if (!req.body) { res.status(500).send({'Expo': 'Missing body!'}); }
  if (Expo.isExpoPushToken(req.body.pushToken)) {
    client.set('pushToken', req.body.pushToken, function(err, reply) {
      if (reply) { res.send({'pushToken': reply, 'source': 'expo cache'}); } 
      if (err) { res.status(500).send({'Expo': err}); }
    });
  } else {
    res.status(500).send({'Expo': 'Unrecognized Expo push token!'});
  }
});
app.use('/expo', expoRouter);

// Forge Data Management endpoints
const dataRouter = express.Router();
dataRouter.post('/uploadAndTranslate', function(req, res) {
  client.get('objectid', function(err, objectid) {
    if(err) { res.status(500).send(err); }
    if(objectid === 'blank') {
      const bucketsApi = new forgeSDK.BucketsApi(); // Buckets Client
      const objectsApi = new forgeSDK.ObjectsApi(); // Objects Client
      const autoRefresh = true;
      const oAuth2TwoLegged = new forgeSDK.AuthClientTwoLegged(
        process.env.FORGE_APP_ID,
        process.env.FORGE_APP_SECRET, 
        config.SCOPES,
        autoRefresh
      );
      oAuth2TwoLegged.authenticate().then(function(credentials) {
        if(!credentials) { res.status(500).send('Empty or undefined credentials!'); }
        createBucketIfNotExist(bucketsApi, oAuth2TwoLegged).then(function(bucket_json) {
          if(!bucket_json) { res.status(500).send('Empty or undefined bucket response!'); }
          const zipFile = fs.createWriteStream(config.OUTPUT_FILE_PATH);
          client.get('photoscenelink', function(err, photoscenelink) {
            if (err) { res.status(500).send({'ERROR': err}); }
            console.info('INFO: Got photoscenelink value: ' + photoscenelink);
            if (photoscenelink.startsWith('http')) {
              console.info('INFO: Initiating download of scenelink at: ' + photoscenelink);
              request(photoscenelink)
                .pipe(zipFile)
                .on('close', () => {
                  console.info('INFO: Output file written to ' + config.OUTPUT_FILE_PATH);
                  fs.createReadStream(config.OUTPUT_FILE_PATH)
                    .pipe(unzip.Parse())
                    .on('entry', function(entry) {
                      const fileName = entry.path;
                      if (fileName === 'result.obj') {
                        entry.pipe(fs.createWriteStream('/tmp/result.obj'))
                          .on('finish', () => {
                            console.info('INFO: Finished writing to /tmp/result.obj ...');
                            uploadfileToBucket(objectsApi, oAuth2TwoLegged, '/tmp/result.obj')
                              .then(function(uploadRes) {
                                if(!uploadRes) { res.status(500).send({'ERROR': 'Empty or undefined upload response!'}); }
                                client.set('objectid', uploadRes.body.objectId, redis.print);
                                translateToSVF(uploadRes.body.objectId, oAuth2TwoLegged).then(function(translateRes) {
                                  if(!translateRes) { res.status(500).send({'ERROR': 'Empty or undefined translation response!'}); }
                                  res.send(translateRes);
                                  res.end();
                                }, function(translateErr) {
                                  res.status(500).send({'ERROR': translateErr});
                                });
                              }, function(uploadErr) {
                                res.status(500).send({'ERROR': uploadErr});
                              });
                          });
                      } else { entry.autodrain(); }
                    });
                });
            }
          });
        }, function(err) {
          res.status(500).send({'ERROR': err});
        });
      }, function(err) {
        res.status(500).send({'ERROR': err});
      });
    } else {
      res.send({'INFO': 'AlreadyTranslated'});
      res.end();
    }
  });
});
app.use('/data', dataRouter);

// Forge derivative endpoints
const derivativeRouter = express.Router();
derivativeRouter.get('/getDerivativeUrn', function(req, res) {
  client.get('objectid', function(err, objectid) {
    if(err) { res.status(500).send(err); }
    client.get('svfurn', function(err, svfurn) {
      if(err) { res.status(500).send(err); }
      client.get('token', function(err, token) {
        if(err) { res.status(500).send(err); }
        if(objectid, svfurn, token) {
          getDerivativeUrn(token, objectid, svfurn)
            .then(function() {
              try {
                const svfInfo = fs.statSync(config.SVF_FILE_PATH);
                console.info('INFO: downloaded derivative urn.');
                console.info('INFO: downloaded file size ' + svfInfo.size + ' Bytes.');
                uploadToS3Bucket(config.SVF_FILE_PATH)
                  .then(function() {
                    console.info('INFO: SVF file has been successfully uploaded to S3!');
                    res.send({'INFO': 'SVF file has been successfully uploaded to S3!'});
                  });
              } catch(err) {
                console.error('Failed to get file stats! ' + err);
                res.status(500).send(err);
              }
              
            })
            .catch(function(err) {
              res.status(500).send(err);
            });
        }
      });
    });
  });
});
derivativeRouter.get('/getManifest', function(req, res) {
  client.get('objectid', function(err, objectid) {
    client.get('token', function(err, token) {
      if(err) { res.status(500).send(err); }
      if(objectid && token) {
        getManifest(token, objectid)
          .then(function(manifest_json) {
            if(!manifest_json) { res.status(500).send('Empty or undefined manifest response!'); }
            if( manifest_json.derivatives 
              && manifest_json.derivatives.length > 0 ) {
              if (manifest_json.derivatives[0].children 
                && manifest_json.derivatives[0].children.length > 1
                && manifest_json.derivatives[0].children[1].children
                && manifest_json.derivatives[0].children[1].children.length > 0
                && manifest_json.derivatives[0].children[1].children[0].urn) {
                const svfUrn = manifest_json.derivatives[0].children[1].children[0].urn;
                client.set('svfurn', svfUrn, redis.print);
              }
            }
            res.status(200).send(manifest_json);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
      }
    });
    
  });
});
app.use('/derivative', derivativeRouter);

module.exports = app;

function createBucket(bucketsApi, oAuth2TwoLegged) {
  const bucketJson = {'bucketKey': config.BUCKET_KEY, 'policyKey': 'transient'};
  return bucketsApi.createBucket(bucketJson, {}, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials());
}

function createBucketIfNotExist(bucketsApi, oAuth2TwoLegged) {
  return new Promise(function(resolve, reject) {
    getBucketDetails(bucketsApi, oAuth2TwoLegged).then(function(resp) {
      resolve(resp);
    }, function(err) {
      if (err.statusCode === 404) {
        createBucket(bucketsApi, oAuth2TwoLegged).then(function(res) {
          resolve(res);
        }, function(err) {
          if (err.statusCode === 409) {
            console.info('INFO: The specified bucket key already exists.');
            resolve(err);
          }
          reject(err);
        });
      } else {
        reject(err);
      }
    });
  });
}

function getBucketDetails(bucketsApi, oAuth2TwoLegged) {
  return bucketsApi.getBucketDetails(config.BUCKET_KEY, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials());
}

function getDerivativeUrn(token, objectId, svfUrn) {
  const base64Urn = new Buffer.from(objectId).toString('base64');
  const derivativeUrn = encodeURIComponent(svfUrn);
  const endpoint = config.DERIVATIVE_BASE_ENDPOINT + '/designdata/' + base64Urn + '/manifest/' + derivativeUrn;
  logInfoToConsole('/designdata/:urn/manifest/:derivativeurn', 'GET', endpoint, null);
  return fetch(endpoint, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then((res) => {
      try {
        const svfFile = fs.createWriteStream(config.SVF_FILE_PATH);
        res.body.pipe(svfFile);
      } catch (err) {
        console.error('ERROR: Failed to write binary body to file! ' + err);
      }
    })
    .catch((err) => {
      console.error('ERROR: Failed to get derivative urn! ' + err);
    });
}

function getManifest(token, objectId) {
  const base64Urn = new Buffer.from(objectId).toString('base64');
  const endpoint = config.DERIVATIVE_BASE_ENDPOINT + '/designdata/' + base64Urn + '/manifest';
  logInfoToConsole('/designdata/:urn/manifest', 'GET', endpoint, null);
  return fetch(endpoint, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
  })
    .then((res) => {
      if(res.ok) {
        return res.json();
      } else if(res.statusCode === 401) {
        console.error('ERROR: You are not authorized!');
      } else {
        console.error('ERROR: Failed to get manifest');
      }
    })
    .catch((err) => {
      console.error('ERROR: Failed to get manifest! ' + err);
    });
}

function logInfoToConsole(endPoint, httpMethod, url, body) {
  if (body) {
    console.info('INFO: ' + httpMethod + ' ' + endPoint 
    + '      Url: ' + url
    + '      Body:' + JSON.stringify(body));
  } else {
    console.info('INFO: ' + httpMethod + ' ' + endPoint 
    + '      Url: ' + url);
  } 
}

function responseToConsole(status, body) {
  if (status && body) {
    console.info('INFO: Response Status: ' + status
    + '               Body: ' + body);
  }
}

function translateToSVF(objectId, oAuth2TwoLegged) {
  return new Promise(function(resolve, reject) {
    const derivativeApi = new forgeSDK.DerivativesApi();
    const base64Urn = new Buffer.from(objectId).toString('base64');
    const job = {
      'input': { 'urn': base64Urn },
      'output': { 'formats': [ { 'type': 'svf', 'views': [ '2d', '3d'] } ] }
    };
    const options = { 'xAdsForce': true };
    derivativeApi.translate(job, options, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials())
      .then(function(resp) {
        if (resp.statusCode === 200) {
          resolve(resp);
        } else {
          reject(resp);
        }
      }, function(err) {
        reject(err);
      });
  });
}

function uploadfileToBucket(objectsApi, oAuth2TwoLegged, filePath) {
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, function(err, data) {
      if (err) { 
        reject(err); 
      } else {
        const fileName = filePath.split('/').pop();
        objectsApi.uploadObject(config.BUCKET_KEY, fileName, data.length, data, {}, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials())
          .then(function(res) {
            resolve(res);
          }, function(err) {
            reject(err);
          });
      }
    });
  });
}

function uploadToS3Bucket(svfFilePath) {
  const s3 = new AWS.S3({apiVersion: '2006-03-01'});
  let uploadParams = {Bucket: config.AWS_S3_BUCKET};
  const fileStream = fs.createReadStream(svfFilePath);
  fileStream.on('error', function(err) {
    console.log('File Error', err);
  });
  uploadParams.Body = fileStream;
  uploadParams.Key = path.basename(svfFilePath);
  // call S3 to retrieve upload file to specified bucket
  const uploadPromise = s3.upload(uploadParams).promise();
  return uploadPromise
    .then(function(data) {
      console.info('INFO: Successfully uploaded SVF file to S3! ' + JSON.stringify(data));
    })
    .catch(function(err) {
      console.error('ERROR: Failed to upload SVF file to S3! ' + err);
    });
}
