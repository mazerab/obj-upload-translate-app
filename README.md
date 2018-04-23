# obj-upload-translate-app
An AWS lambda function to upload an OBJ file to Autodesk Cloud and translate it to SVF format.

## Introduction

This server app calls the Forge Data Management and Model Derivatives API to upload an OBJ file to a OSS bucket and then translate the OBJ file to a viewable format (SVF). 

The flow is simple:

The mobile app lets users select image files from the camera roll and upload them to a S3 bucket.

1. The server app logs into Forge using 2-legged oAuth flow
1. The server app 

## Getting Started

Before you start, make sure you read [Serverless Code with Amazons AWS and Claudia](https://vincetocco.com/serverless-code/) to learn more about the setup.

1. Create a new repository directory
1. Download [this repository]() and extract to the new directory

### Prerequisites

#### Node.js

1. Install [Node.js and npm](https://www.npmjs.com/get-npm)
1. Run `npm install npm@latest -g`
