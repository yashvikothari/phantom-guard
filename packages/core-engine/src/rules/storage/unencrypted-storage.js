import { buildPatch, renderJson } from '../../remediation/build-patch.js';
import { booleanMember, member, objectMember, stringMember } from '../../util/attributes.js';
import {
  CIS_EBS_ENCRYPTION,
  CIS_RDS_ENCRYPTION,
  CIS_S3_ENCRYPTION_LEGACY,
  S3_DEFAULT_ENCRYPTION,
} from '../references.js';
/** Server-side encryption algorithms that count as "declared". */
const S3_ENCRYPTION_ALGORITHMS = ['AES256', 'aws:kms', 'aws:kms:dsse'];
function checkFor(resource) {
  const attributes = resource.attributes;
  switch (resource.kind) {
    case 'aws_ebs_volume':
      return booleanMember(attributes, 'encrypted') === true
        ? undefined
        : {
            attribute: 'encrypted',
            severity: 'HIGH',
            message: 'EBS volume is not encrypted at rest: "encrypted" is not true.',
            references: [CIS_EBS_ENCRYPTION],
          };
    case 'aws_db_instance':
      return booleanMember(attributes, 'storageEncrypted') === true
        ? undefined
        : {
            attribute: 'storageEncrypted',
            severity: 'HIGH',
            message:
              'RDS instance storage is not encrypted at rest: "storageEncrypted" is not true.',
            references: [CIS_RDS_ENCRYPTION],
          };
    case 'aws_s3_bucket': {
      const sse = objectMember(attributes, 'serverSideEncryption');
      const algorithm = sse === undefined ? undefined : stringMember(sse, 'algorithm');
      return algorithm !== undefined && S3_ENCRYPTION_ALGORITHMS.includes(algorithm)
        ? undefined
        : {
            attribute: 'serverSideEncryption',
            severity: 'MEDIUM',
            // Accurate wording matters: since 5 January 2023 S3 encrypts every new object with SSE-S3.
            message:
              'S3 bucket declares no server-side encryption configuration. Amazon S3 already applies SSE-S3 to new objects by default, so this is a missing explicit declaration; declare it so the intent is auditable and enforceable.',
            references: [S3_DEFAULT_ENCRYPTION, CIS_S3_ENCRYPTION_LEGACY],
          };
    }
    default:
      return undefined;
  }
}
function evaluate(resource) {
  const check = checkFor(resource);
  if (check === undefined) {
    return [];
  }
  const current = member(resource.attributes, check.attribute);
  return [
    {
      severity: check.severity,
      message: check.message,
      locationKey: check.attribute,
      evidence: { attribute: check.attribute, current: current ?? null },
      references: check.references,
    },
  ];
}
function remediate(resource, violation) {
  const attribute = stringMember(violation.evidence, 'attribute');
  const current = attribute === undefined ? undefined : member(resource.attributes, attribute);
  const snapshot = (value) =>
    renderJson(attribute === undefined || value === undefined ? {} : { [attribute]: value });
  switch (resource.kind) {
    case 'aws_ebs_volume':
      return {
        kind: 'patch',
        patch: buildPatch({
          ruleId: 'PG-STO-001',
          resource,
          locationKey: violation.locationKey,
          title: 'Enable EBS encryption',
          rationale:
            'Sets "encrypted" to true. An existing volume cannot be encrypted in place: snapshot it, copy the snapshot with encryption enabled, and create a replacement volume, then switch the workload over.',
          reviewRequired: true,
          anchor: '/encrypted',
          operations: [{ op: 'set', path: '/encrypted', value: true }],
          before: snapshot(current),
          after: renderJson({ encrypted: true }),
        }),
      };
    case 'aws_db_instance':
      return {
        kind: 'patch',
        patch: buildPatch({
          ruleId: 'PG-STO-001',
          resource,
          locationKey: violation.locationKey,
          title: 'Enable RDS storage encryption',
          rationale:
            'Sets "storageEncrypted" to true. An existing instance cannot be encrypted in place: take a snapshot, copy it with encryption enabled, and restore a new instance from the copy.',
          reviewRequired: true,
          anchor: '/storageEncrypted',
          operations: [{ op: 'set', path: '/storageEncrypted', value: true }],
          before: snapshot(current),
          after: renderJson({ storageEncrypted: true }),
        }),
      };
    case 'aws_s3_bucket': {
      const declared = { algorithm: 'AES256' };
      return {
        kind: 'patch',
        patch: buildPatch({
          ruleId: 'PG-STO-001',
          resource,
          locationKey: violation.locationKey,
          title: 'Declare SSE-S3 encryption explicitly',
          rationale:
            'Declares the same SSE-S3 (AES256) encryption that Amazon S3 already applies by default, so behavior does not change. Use SSE-KMS (aws:kms) with a customer managed key when you need key-level access control and key-usage records in CloudTrail.',
          reviewRequired: false,
          anchor: '/serverSideEncryption',
          operations: [{ op: 'set', path: '/serverSideEncryption', value: declared }],
          before: snapshot(current),
          after: renderJson({ serverSideEncryption: declared }),
        }),
      };
    }
    default:
      return { kind: 'guidance', guidance: 'Enable encryption at rest for this resource.' };
  }
}
export const unencryptedStorage = {
  id: 'PG-STO-001',
  category: 'STO',
  title: 'Storage does not declare encryption at rest',
  description:
    'An EBS volume or RDS instance is not encrypted (high), or an S3 bucket declares no server-side encryption (medium: S3 encrypts new objects with SSE-S3 by default, so the gap is the missing explicit declaration).',
  ward: 'Ward of the Sealed Crypt',
  defaultSeverity: 'HIGH',
  appliesTo: ['aws_ebs_volume', 'aws_db_instance', 'aws_s3_bucket'],
  references: [CIS_EBS_ENCRYPTION, CIS_RDS_ENCRYPTION, S3_DEFAULT_ENCRYPTION],
  evaluate,
  remediate,
};
