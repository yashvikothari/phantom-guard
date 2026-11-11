import { EXAMPLE_ACCOUNT_ID, datasetResource } from './builder.js';
const ID = 'haunted-mansion';
const ECR = `${EXAMPLE_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com`;
/**
 * A fictional AWS account that breaks every guardrail at least once and keeps a
 * couple of healthy resources for contrast. All names, ARNs and ids are made up.
 */
export const hauntedMansion = [
  datasetResource(ID, 'aws_iam_role', 'phantom-admin', {
    trustPolicy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'ec2.amazonaws.com' },
          Action: 'sts:AssumeRole',
        },
      ],
    },
    document: {
      Version: '2012-10-17',
      Statement: [{ Sid: 'EverythingForEveryone', Effect: 'Allow', Action: '*', Resource: '*' }],
    },
    // Evidence from access analysis: what this role really called in the last 90 days.
    observedUsage: {
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        's3:GetObject',
        's3:ListBucket',
        'sqs:DeleteMessage',
        'sqs:ReceiveMessage',
      ],
      resources: [
        `arn:aws:logs:us-east-1:${EXAMPLE_ACCOUNT_ID}:log-group:/mansion/*`,
        'arn:aws:s3:::crypt-backups',
        'arn:aws:s3:::crypt-backups/*',
        `arn:aws:sqs:us-east-1:${EXAMPLE_ACCOUNT_ID}:seance-queue`,
      ],
    },
  }),
  datasetResource(ID, 'aws_iam_policy', 's3-poltergeist', {
    document: {
      Version: '2012-10-17',
      Statement: [{ Sid: 'AllS3', Effect: 'Allow', Action: 's3:*', Resource: '*' }],
    },
  }),
  datasetResource(ID, 'aws_iam_policy', 'scattered-grants', {
    document: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'ReadEverywhere',
          Effect: 'Allow',
          Action: ['ec2:Describe*', 'logs:Get*'],
          Resource: '*',
        },
        // A Deny never counts as a wildcard grant.
        { Sid: 'NoBucketDeletion', Effect: 'Deny', Action: 's3:DeleteBucket', Resource: '*' },
      ],
    },
  }),
  datasetResource(ID, 'aws_iam_role', 'cross-account-wraith', {
    trustPolicy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AnyoneMayEnter',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 'sts:AssumeRole',
        },
      ],
    },
    document: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: 'arn:aws:s3:::crypt-backups/*',
        },
      ],
    },
  }),
  datasetResource(ID, 'aws_security_group', 'ssh-open-gate', {
    ingress: [
      {
        protocol: 'tcp',
        fromPort: 22,
        toPort: 22,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: [],
        description: 'ssh from anywhere',
      },
      {
        protocol: 'tcp',
        fromPort: 3306,
        toPort: 3306,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: ['::/0'],
        description: 'mysql from anywhere',
      },
      {
        protocol: 'tcp',
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: [],
        description: 'https',
      },
      {
        protocol: 'tcp',
        fromPort: 8080,
        toPort: 8080,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: [],
        description: 'admin console',
      },
    ],
  }),
  datasetResource(ID, 'aws_security_group', 'web-lantern', {
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
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: [],
        description: 'http redirect',
      },
    ],
  }),
  datasetResource(ID, 'aws_s3_bucket', 'crypt-backups', {
    versioning: 'Enabled',
  }),
  // A static-site bucket that someone opened to the world: a public ACL, a public policy,
  // and Block Public Access switched off.
  datasetResource(ID, 'aws_s3_bucket', 'open-gate-assets', {
    acl: 'public-read',
    versioning: 'Suspended',
    publicAccessBlock: {
      blockPublicAcls: false,
      blockPublicPolicy: false,
      ignorePublicAcls: false,
      restrictPublicBuckets: false,
    },
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicRead',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: 'arn:aws:s3:::open-gate-assets/*',
        },
        // A Deny that names "*" restricts access; it is never a public grant.
        {
          Sid: 'RequireTls',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: ['arn:aws:s3:::open-gate-assets', 'arn:aws:s3:::open-gate-assets/*'],
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        },
      ],
    },
  }),
  datasetResource(ID, 'aws_s3_bucket', 'sanctified-logs', {
    versioning: 'Enabled',
    serverSideEncryption: {
      algorithm: 'aws:kms',
      kmsKeyId: 'alias/mansion-logs',
      bucketKeyEnabled: true,
    },
    publicAccessBlock: {
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    },
  }),
  datasetResource(ID, 'aws_ebs_volume', 'cursed-volume', {
    encrypted: false,
    sizeGiB: 500,
    volumeType: 'gp3',
    availabilityZone: 'us-east-1a',
  }),
  datasetResource(ID, 'aws_db_instance', 'banshee-db', {
    engine: 'postgres',
    engineVersion: '16.4',
    instanceClass: 'db.m6g.large',
    storageEncrypted: false,
    publiclyAccessible: false,
  }),
  datasetResource(ID, 'aws_ecs_task_definition', 'zombie-worker', {
    family: 'zombie-worker',
    containers: [
      { name: 'worker', image: `${ECR}/worker:1.4.2`, privileged: true },
      {
        name: 'log-router',
        image: 'public.ecr.aws/aws-observability/aws-for-fluent-bit:stable',
        user: 'root',
      },
      { name: 'metrics', image: `${ECR}/metrics:2.0.1`, user: '10001:10001', privileged: false },
    ],
  }),
];
