# obj-upload-translate-app
An AWS lambda function to upload an OBJ file to Autodesk Cloud and translate it to SVF format.

## Introduction

This server app uses the Forge [Data Management](https://developer.autodesk.com/en/docs/data/v2/overview/) and [Model Derivatives](https://developer.autodesk.com/en/docs/model-derivative/v2/overview/) APIs to upload an OBJ file to a OSS bucket and then translate the OBJ file to a viewable format (SVF) that the Forge Viewer can open. 

The flow is simple:

After the photoscene has been successfully processed, the mobile app has access to a photoscenelink URL that can be used to download the resulting OBJ file.

1. The server app logs into Forge using 2-legged oAuth flow
1. The server app uploads the OBJ file to an OSS bucket
1. The server app translates the OBJ file to SVF format
1. The resulting viewable files are then uploaded to S3 bucket
1. The mobile app can now view the 3D model

## Getting Started

Before you start, make sure you read [Serverless Code with Amazons AWS and Claudia](https://vincetocco.com/serverless-code/) to learn more about the setup.

1. Create a new repository directory
1. Download [this repository](https://github.com/mazerab/obj-upload-translate-app/archive/master.zip) and extract to the new directory

### Prerequisites

#### Node.js

1. Install [Node.js and npm](https://www.npmjs.com/get-npm)
1. Run `npm install npm@latest -g`
