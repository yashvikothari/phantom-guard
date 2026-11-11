import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyPatch } from '../../../src/index.js';
import {
  expectedSeverity,
  isCompliant,
  storage,
  toStorageResource,
} from '../../arbitraries/storage.js';
import { FC_PARAMS } from '../../support/fc.js';
import { mustApply, scanRule } from '../../support/resources.js';

const RULE = 'PG-STO-001';

describe('PG-STO-001 unencrypted storage', () => {
  // Feature: phantom-guard, Property 7: Encryption flags decide storage findings
  // Validates: Requirements 7.1, 7.2, 7.3, 7.4
  it('reports a finding if and only if the encryption setting is missing, at the severity of the resource kind', () => {
    fc.assert(
      fc.property(storage, (item) => {
        const findings = scanRule(toStorageResource(item), RULE).findings;
        const expected = expectedSeverity(item);
        expect(findings.map((finding) => finding.severity)).toEqual(
          expected === undefined ? [] : [expected],
        );
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 7: Encryption flags decide storage findings
  // Validates: Requirements 7.5
  it('describes a missing S3 declaration accurately: S3 already encrypts new objects by default', () => {
    fc.assert(
      fc.property(storage, (item) => {
        const finding = scanRule(toStorageResource(item), RULE).findings[0];
        if (item.kind !== 's3' || finding === undefined) {
          return;
        }
        expect(finding.message).toMatch(/SSE-S3 to new objects by default/);
        expect(finding.message).toMatch(/missing explicit declaration/);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 9.6
  it('is deterministic', () => {
    fc.assert(
      fc.property(storage, (item) => {
        const resource = toStorageResource(item);
        expect(scanRule(resource, RULE)).toEqual(scanRule(resource, RULE));
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 11: Patches fix the finding and nothing else
  // Validates: Requirements 11.2, 11.3
  it('clears the finding and adds none when the patch is applied', () => {
    fc.assert(
      fc.property(storage, (item) => {
        const resource = toStorageResource(item);
        const finding = scanRule(resource, RULE).findings[0];
        if (finding?.patch === undefined) {
          return;
        }
        expect(scanRule(mustApply(resource, finding.patch), RULE).findings).toEqual([]);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 12: Patch application is pure and idempotent
  // Validates: Requirements 11.1, 11.4
  it('applies patches without mutation and idempotently, even when the attribute was absent', () => {
    fc.assert(
      fc.property(storage, (item) => {
        const resource = toStorageResource(item);
        const snapshot = JSON.stringify(resource);
        const finding = scanRule(resource, RULE).findings[0];
        if (finding?.patch === undefined) {
          return;
        }
        const once = mustApply(resource, finding.patch);
        expect(JSON.stringify(resource)).toBe(snapshot);
        const twice = applyPatch(once, finding.patch);
        expect(twice.ok && twice.resource).toEqual(once);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 13: Patches never widen access
  // Validates: Requirements 10.2, 10.5
  it('only enables hardening, preserves other attributes, and flags replacement as review-required', () => {
    fc.assert(
      fc.property(storage, (item) => {
        const resource = toStorageResource(item);
        const finding = scanRule(resource, RULE).findings[0];
        if (finding?.patch === undefined) {
          expect(isCompliant(item)).toBe(true);
          return;
        }
        const patched = mustApply(resource, finding.patch);
        expect(
          isCompliant({
            ...item,
            ...(item.kind === 's3' ? { algorithm: 'AES256' } : { flag: true }),
          }),
        ).toBe(true);
        for (const [key, value] of Object.entries(resource.attributes)) {
          if (key !== 'encrypted' && key !== 'storageEncrypted' && key !== 'serverSideEncryption') {
            expect(patched.attributes[key]).toEqual(value);
          }
        }
        // Encrypting an existing EBS volume or RDS instance means replacing it; S3 does not.
        expect(finding.patch.reviewRequired).toBe(item.kind !== 's3');
      }),
      FC_PARAMS,
    );
  });
});
