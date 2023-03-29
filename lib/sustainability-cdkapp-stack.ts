import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Period } from "aws-cdk-lib/aws-apigateway";
import { Code, Function, Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import * as s3 from "aws-cdk-lib/aws-s3";

export class SustainabilityCdkappStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sustainabilityLambdaFn = new Function(this, `sustainability-core`, {
      runtime: Runtime.NODEJS_16_X,
      description: "This lambda processes sustainability related logic",
      code: Code.fromAsset(`${__dirname}/../src/sustainability`),
      handler: 'index.handler',
      functionName: `sustainability-core`,
      timeout: cdk.Duration.seconds(60),
    });

    const hexCoreLambdaFn = new Function(this, `hex-core-dev`, {
      runtime: Runtime.NODEJS_16_X,
      description: "This lambda processes sustainability related logic",
      code: Code.fromAsset(`${__dirname}/../src/sustainability`),
      handler: 'index.handler',
      functionName: `hex-core-dev`,
      architecture: Architecture.ARM_64,
      timeout: cdk.Duration.seconds(60),
    });

    // Attaching policies to Lambda function
    sustainabilityLambdaFn.role?.attachInlinePolicy(new iam.Policy(this, `sustainability-policy`, {
      statements: [new iam.PolicyStatement({
        actions: ['cloudformation:ListStackResources'],
        resources: ['*'], 
      }),
      new iam.PolicyStatement({
        actions: ['ec2:DescribeInstances'],
        resources: ['*'],  
      }),
      new iam.PolicyStatement({
        actions: ['lambda:GetFunctionConfiguration'],
        resources: ['*'],  
      }),
      new iam.PolicyStatement({
        actions: ['s3:GetLifecycleConfiguration'],
        resources: ['*'], 
      })],
    }));

    // API Gateway
    const sustainability_apigw = new apigateway.RestApi(this, `sustainability-api`, {
      description: 'API triggers Sustainability',
      deployOptions: {
        stageName: 'dev',
      },
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },

      // enable CORS
      defaultCorsPreflightOptions: {
        allowHeaders: [
          '*'
        ],
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
    });

    // adding resources and methods
    const sustainability = sustainability_apigw.root.addResource('green');
    const v1 = sustainability.addResource('v1');
    const checkSustainability = v1.addResource('sustainability');

    checkSustainability.addMethod(
      'POST',
      new apigateway.LambdaIntegration(sustainabilityLambdaFn, { proxy: true }),
      { apiKeyRequired: true }
    );

    //Adding Usage plan for API
    const sustainability_usage_plan = sustainability_apigw.addUsagePlan(`sustainability-usageplan`, {
      name: `sustainability-usageplan`,
      description: 'API key to access sustainability APIs',
      apiStages: [{ api: sustainability_apigw, stage: sustainability_apigw.deploymentStage }],
      throttle: { burstLimit: 1, rateLimit: 1 }, quota: { limit: 1000, period: Period.MONTH } // to be discussed and updated
    });

    const key = sustainability_apigw.addApiKey('ApiKey');
    sustainability_usage_plan.addApiKey(key);
    //======================== API -> Lambda ends

    /*
    S3 Bucket
    */
    const siteBucket = new s3.Bucket(this, "Bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      versioned: false,
      bucketName: `sustainability-proof-of-concept`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      enforceSSL: true,
    });
  }
}
