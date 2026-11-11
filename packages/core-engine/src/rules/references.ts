import type { ComplianceReference } from '../contracts/detection-rule.js';

/**
 * Compliance references. Control numbers change between benchmark versions, so
 * every reference pins the version it was checked against. When bumping a
 * version, re-verify the control number and title against the published benchmark.
 */
const CIS_AWS = 'CIS AWS Foundations Benchmark';

export const CIS_IAM_FULL_ADMIN: ComplianceReference = {
  benchmark: CIS_AWS,
  version: 'v3.0.0',
  control: '1.16',
  title: 'Ensure IAM policies that allow full "*:*" administrative privileges are not attached',
};

export const IAM_LEAST_PRIVILEGE: ComplianceReference = {
  benchmark: 'AWS IAM Best Practices',
  version: 'current',
  control: 'Apply least-privilege permissions',
  title: 'Grant only the permissions required to perform a task',
};

export const CIS_SG_IPV4_ADMIN_PORTS: ComplianceReference = {
  benchmark: CIS_AWS,
  version: 'v3.0.0',
  control: '5.2',
  title:
    'Ensure no security groups allow ingress from 0.0.0.0/0 to remote server administration ports',
};

// UNCONFIRMED: the control number 5.3 for v3.0.0 is from memory, not from a listing. Other
// benchmark versions number the IPv4 and IPv6 controls differently. Verify against the CIS
// v3.0.0 PDF and update the number or the version (tasks.md, task 2.10).
export const CIS_SG_IPV6_ADMIN_PORTS: ComplianceReference = {
  benchmark: CIS_AWS,
  version: 'v3.0.0',
  control: '5.3',
  title: 'Ensure no security groups allow ingress from ::/0 to remote server administration ports',
};

export const CIS_EBS_ENCRYPTION: ComplianceReference = {
  benchmark: CIS_AWS,
  version: 'v3.0.0',
  control: '2.2.1',
  title: 'Ensure EBS Volume Encryption is Enabled in all Regions',
};

export const CIS_RDS_ENCRYPTION: ComplianceReference = {
  benchmark: CIS_AWS,
  version: 'v3.0.0',
  control: '2.3.1',
  title: 'Ensure that encryption-at-rest is enabled for RDS Instances',
};

export const CIS_S3_ENCRYPTION_LEGACY: ComplianceReference = {
  benchmark: CIS_AWS,
  version: 'v1.4.0',
  control: '2.1.1',
  title:
    'Ensure all S3 buckets employ encryption-at-rest (removed from later versions because S3 now encrypts new objects by default)',
};

export const CIS_S3_BLOCK_PUBLIC_ACCESS: ComplianceReference = {
  benchmark: CIS_AWS,
  version: 'v3.0.0',
  control: '2.1.4',
  title: "Ensure that S3 Buckets are configured with 'Block public access (bucket settings)'",
};

export const CIS_DOCKER_NON_ROOT_USER: ComplianceReference = {
  benchmark: 'CIS Docker Benchmark',
  version: 'v1.7.0',
  control: '4.1',
  title: 'Ensure that a user for the container has been created',
};

export const FSBP_EC2_18: ComplianceReference = {
  benchmark: 'AWS Foundational Security Best Practices',
  version: 'current',
  control: 'EC2.18',
  title: 'Security groups should only allow unrestricted incoming traffic for authorized ports',
};

export const S3_DEFAULT_ENCRYPTION: ComplianceReference = {
  benchmark: 'Amazon S3 User Guide',
  version: 'current',
  control: 'Default encryption',
  title:
    'S3 applies SSE-S3 to all new objects; configure SSE-KMS where key-level control and audit are required',
};

export const S3_BLOCK_PUBLIC_ACCESS_GUIDE: ComplianceReference = {
  benchmark: 'Amazon S3 User Guide',
  version: 'current',
  control: 'Blocking public access',
  title:
    'S3 Block Public Access overrides public ACLs and bucket policies, and is on by default for new buckets',
};
