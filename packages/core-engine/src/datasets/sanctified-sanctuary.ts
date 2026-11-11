import type { HauntedResource } from '../contracts/haunted-resource.js';
import { EXAMPLE_ACCOUNT_ID, datasetResource } from './builder.js';

const ID = 'sanctified-sanctuary';
const ECR = `${EXAMPLE_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com`;

/** A fictional AWS account that follows every guardrail. A scan must find nothing here. */
export const sanctifiedSanctuary: readonly HauntedResource[] = [
  datasetResource(ID, 'aws_iam_policy', 'least-privilege-reader', {
    document: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'ReadArchive',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:ListBucket'],
          Resource: ['arn:aws:s3:::sanctuary-archive', 'arn:aws:s3:::sanctuary-archive/*'],
        },
      ],
    },
  }),

  datasetResource(ID, 'aws_iam_role', 'lambda-exec', {
    trustPolicy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole',
        },
      ],
    },
    document: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: `arn:aws:logs:us-east-1:${EXAMPLE_ACCOUNT_ID}:log-group:/sanctuary/*`,
        },
      ],
    },
  }),

  datasetResource(ID, 'aws_security_group', 'web-tier', {
    ingress: [
      {
        protocol: 'tcp',
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: ['::/0'],
        description: 'https',
      },
      {
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        cidrBlocks: ['10.0.0.0/16'],
        ipv6CidrBlocks: [],
        description: 'postgres from the private network only',
      },
    ],
  }),

  datasetResource(ID, 'aws_s3_bucket', 'sanctuary-archive', {
    versioning: 'Enabled',
    serverSideEncryption: {
      algorithm: 'aws:kms',
      kmsKeyId: 'alias/sanctuary',
      bucketKeyEnabled: true,
    },
    publicAccessBlock: {
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    },
  }),

  datasetResource(ID, 'aws_ebs_volume', 'blessed-volume', {
    encrypted: true,
    sizeGiB: 100,
    volumeType: 'gp3',
    availabilityZone: 'us-east-1b',
  }),

  datasetResource(ID, 'aws_db_instance', 'choir-db', {
    engine: 'postgres',
    engineVersion: '16.4',
    instanceClass: 'db.m6g.large',
    storageEncrypted: true,
    publiclyAccessible: false,
  }),

  datasetResource(ID, 'aws_ecs_task_definition', 'choir-service', {
    family: 'choir-service',
    containers: [
      { name: 'api', image: `${ECR}/api:3.2.0`, user: '10001:10001', privileged: false },
    ],
  }),
];
