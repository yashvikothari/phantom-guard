import * as fc from 'fast-check';
import type { HauntedResource, JsonObject, JsonValue } from '../../src/index.js';
import { makeResource } from '../support/resources.js';

/** Values an `encrypted` / `storageEncrypted` flag can hold, including look-alikes that are not boolean true. */
const flag = fc.constantFrom<JsonValue | undefined>(true, false, undefined, 'true', 1, null);

const algorithm = fc.constantFrom<string | undefined>(
  undefined,
  'AES256',
  'aws:kms',
  'aws:kms:dsse',
  'none',
  '',
  'aes256',
);

export type StorageKind = 'ebs' | 'rds' | 's3';

export interface GeneratedStorage {
  readonly kind: StorageKind;
  readonly flag: JsonValue | undefined;
  readonly algorithm: string | undefined;
  readonly extra: boolean;
}

export const storage: fc.Arbitrary<GeneratedStorage> = fc.record({
  kind: fc.constantFrom<StorageKind>('ebs', 'rds', 's3'),
  flag,
  algorithm,
  extra: fc.boolean(),
});

/** Oracle written from Requirement 7. */
export function isCompliant(item: GeneratedStorage): boolean {
  if (item.kind === 's3') {
    return (
      item.algorithm === 'AES256' ||
      item.algorithm === 'aws:kms' ||
      item.algorithm === 'aws:kms:dsse'
    );
  }
  return item.flag === true;
}

export function expectedSeverity(item: GeneratedStorage): 'HIGH' | 'MEDIUM' | undefined {
  if (isCompliant(item)) {
    return undefined;
  }
  return item.kind === 's3' ? 'MEDIUM' : 'HIGH';
}

export function toStorageResource(item: GeneratedStorage): HauntedResource {
  const extra: JsonObject = item.extra ? { tags: { team: 'ghosts' } } : {};
  switch (item.kind) {
    case 'ebs':
      return makeResource('aws_ebs_volume', {
        ...extra,
        ...(item.flag === undefined ? {} : { encrypted: item.flag }),
      });
    case 'rds':
      return makeResource('aws_db_instance', {
        ...extra,
        ...(item.flag === undefined ? {} : { storageEncrypted: item.flag }),
      });
    case 's3':
      return makeResource('aws_s3_bucket', {
        ...extra,
        ...(item.algorithm === undefined
          ? {}
          : { serverSideEncryption: { algorithm: item.algorithm } }),
      });
  }
}
