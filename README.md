# obj-upload-translate-app

[![License](http://img.shields.io/:license-MIT-blue.svg)](http://opensource.org/licenses/MIT)

[![Data-Management](https://img.shields.io/badge/Data%20Management-v1-green.svg)](http://developer.autodesk.com/)
[![Model-Derivative](https://img.shields.io/badge/Model%20Derivative-v2-green.svg)](http://developer.autodesk.com/)

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

### Installing

1. Browse to the repository directory
1. Run `npm install`
1. Edit the file `package.json` to change the app name on line 2. Pick a name that is unique to you.
1. Continue editing the same file `package.json` to update the Forge App ID and secret, Amazon S3 bucket and Redis password on the setvars script line  `--set-env FORGE_APP_ID=xxx,FORGE_APP_SECRET=yyy,S3_BUCKET=reality-capture-images,REDIS_PASSWORD=zzz`
1. Save the changes
1. Run `npm run create` to send everything up to AWS Lambda. It will return a 'new URL'.
1. Run `npm run setvars` to push the environment variables to Lambda.

### Updating the app

Below I demonstrate ['Claudia.js'](https://claudiajs.com/tutorials/serverless-express.html) 'update' command to re-deploy a small code change. Claudia handles the task of zipping, uploading and re-wiring node.js endpoints to 'AWS-Lambda & API-Gateway' automatically. 

1. Using your favorite text editor, open the *config.js* file from the root directory
1. Input the correct values in **REDIS_ENDPOINT** and **AWS_S3_BUCKET** variables, save the changes
1. Run `npm run update`...

Anytime you need to make code changes, you should use the 'update' command to push your changes to the AWS lambda function. 

### AWS Lambda Function Configuration

* Login to your AWS console
* Navigate to Lambda Functions
* Open your new Lambda function
* Change the Node.js version to 8.10
* Increase memory to 512 Mb and timeout value to 30 seconds
* Connect the demo alias to $LATEST version
* Save the changes

## Testing

Go back to your mobile app to edit the `./constants/Config.js` file to have the correct AWS lambda endpoint in the variable named **AWS_UPLOAD_TRANSLATE_LAMBDA_BASE_ENDPOINT**. Save the change and submit **3 or more** images for processing by pressing the button called *"Process Photoscene"*.

This should generate a new OBJ file. Wait for the OBJ file to be translated. When ready, the *View File* button will become available, click on it to launch the Forge Viewer and open the viewables. 

## Built With
* [Amazon Lambda](https://aws.amazon.com/lambda/) - Run code without thinking about servers.
* [Amazon API Gateway](https://aws.amazon.com/api-gateway) - Fully managed service to create, publish, maintain, monitor, and secure APIs.
* [Amazon S3](https://aws.amazon.com/s3) - Amazon Simple Storage Service.
* [Claudia JS](https://claudiajs.com/) - JavaScript cloud micro-services the easy way.
* [NodeJS](https://nodejs.org/en/) - JavaScript runtime.
* [Express](http://expressjs.com/) - Fast, unopiniated, minimalist web framework for Node.js.
* [AWS SDK](https://github.com/aws/aws-sdk-js) - AWS SDK for JavaScript in the browser and Node.js.
* [AWS Serverless Express](https://github.com/awslabs/aws-serverless-express) - AWS Serverless JavaScript framework.

## Authors

Bastien Mazeran, Autodesk Inc.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 

## Acknowledgements

This code came from [GITHUB-Express-Lambda](https://github.com/claudiajs/example-projects/tree/master/express-app-lambda)

More information on Express/Serverless can be found here:
[Running Express Apps in AWS Lambda](https://claudiajs.com/tutorials/serverless-express.html)  

The package.json was modified from here: [Package.json](
https://vincetocco.com/serverless-code/)

[Why use Claudia?](https://github.com/claudiajs/claudia/blob/master/FAQ.md)

Inspired by [this blog post](https://forge.autodesk.com/blog/running-forge-viewer-aws-lambda-server-and-api-gateway), by Philippe Leefsma.
