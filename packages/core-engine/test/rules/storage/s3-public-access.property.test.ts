import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SEVERITY_ORDER, applyPatch, scan } from '../../../src/index.js';
import type { Finding } from '../../../src/index.js';
import {
  bucket,
  expectedFindings,
  opensAccess,
  toBucketResource,
} from '../../arbitraries/bucket.js';
import { FC_PARAMS } from '../../support/fc.js';
import { mustApply, scanRule } from '../../support/resources.js';

const RULE = 'PG-STO-002';

const summarize = (findings: readonly Finding[]): string[] =>
  findings.map((finding) => `${finding.locationKey}|${finding.severity}`).sort();

const rank = (finding: Finding): number => SEVERITY_ORDER.indexOf(finding.severity);

describe('PG-STO-002 S3 public access', () => {
  // Feature: phantom-guard, Property 19: Public S3 exposure follows ACL, policy and Block Public Access
  // Validates: Requirements 7.6, 7.7, 7.8, 7.9
  it('reports exactly the findings the requirements describe, each at its severity', () => {
    fc.assert(
      fc.property(bucket, (item) => {
        const found = summarize(scanRule(toBucketResource(item), RULE).findings);
        const expected = expectedFindings(item)
          .map((entry) => `${entry.locationKey}|${entry.severity}`)
          .sort();
        expect(found).toEqual(expected);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 19: Public S3 exposure follows ACL, policy and Block Public Access
  // Validates: Requirements 7.10
  it('describes a missing Block Public Access declaration as a declaration gap, not an open bucket', () => {
    fc.assert(
      fc.property(bucket, (item) => {
        const finding = scanRule(toBucketResource(item), RULE).findings.find(
          (candidate) => candidate.locationKey === 'public-access-block',
        );
        if (item.block !== undefined || finding === undefined) {
          return;
        }
        expect(finding.message).toMatch(/since April 2023/);
        expect(finding.message).toMatch(/missing explicit declaration/);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 9.6
  it('is deterministic', () => {
    fc.assert(
      fc.property(bucket, (item) => {
        const resource = toBucketResource(item);
        expect(scanRule(resource, RULE)).toEqual(scanRule(resource, RULE));
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 11: Patches fix the finding and nothing else
  // Validates: Requirements 11.2, 11.3
  it('clears the patched finding, adds none, and never makes another finding worse', () => {
    fc.assert(
      fc.property(bucket, (item) => {
        const resource = toBucketResource(item);
        const before = scanRule(resource, RULE).findings;
        for (const finding of before) {
          if (finding.patch === undefined) {
            continue;
          }
          const after = scanRule(mustApply(resource, finding.patch), RULE).findings;
          expect(after.some((entry) => entry.locationKey === finding.locationKey)).toBe(false);
          for (const entry of after) {
            const earlier = before.find((candidate) => candidate.locationKey === entry.locationKey);
            expect(earlier).toBeDefined();
            if (earlier !== undefined) {
              expect(rank(entry)).toBeGreaterThanOrEqual(rank(earlier));
            }
          }
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 12: Patch application is pure and idempotent
  // Validates: Requirements 11.1, 11.4
  it('applies patches without mutating the input, and applying twice equals applying once', () => {
    fc.assert(
      fc.property(bucket, (item) => {
        const resource = toBucketResource(item);
        const snapshot = JSON.stringify(resource);
        for (const finding of scanRule(resource, RULE).findings) {
          if (finding.patch === undefined) {
            continue;
          }
          const once = mustApply(resource, finding.patch);
          expect(JSON.stringify(resource)).toBe(snapshot);
          const twice = applyPatch(once, finding.patch);
          expect(twice.ok && twice.resource).toEqual(once);
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 13: Patches never widen access
  // Validates: Requirements 7.9, 10.2, 10.5
  it('only closes access, keeps other attributes, and asks for review exactly when access is open', () => {
    fc.assert(
      fc.property(bucket, (item) => {
        const resource = toBucketResource(item);
        for (const finding of scanRule(resource, RULE).findings) {
          const patch = finding.patch;
          if (patch === undefined) {
            expect(finding.locationKey.startsWith('policy:statement:')).toBe(true);
            expect(finding.guidance).toBeDefined();
            continue;
          }
          const patched = mustApply(resource, patch);
          const touched = finding.locationKey === 'acl' ? 'acl' : 'publicAccessBlock';
          if (finding.locationKey === 'acl') {
            expect(patched.attributes['acl']).toBe('private');
            expect(patch.reviewRequired).toBe(true);
          } else {
            expect(patched.attributes['publicAccessBlock']).toEqual({
              blockPublicAcls: true,
              blockPublicPolicy: true,
              ignorePublicAcls: true,
              restrictPublicBuckets: true,
            });
            expect(patch.reviewRequired).toBe(opensAccess(item));
          }
          for (const [key, value] of Object.entries(resource.attributes)) {
            if (key !== touched) {
              expect(patched.attributes[key]).toEqual(value);
            }
          }
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 11: Patches fix the finding and nothing else
  // Validates: Requirements 7.6, 11.3
  it('does not report a Deny statement or a named principal as public, whatever else the bucket holds', () => {
    fc.assert(
      fc.property(bucket, (item) => {
        const report = scan([toBucketResource(item)], { allow: [RULE] });
        const policyFindings = report.findings.filter((finding) =>
          finding.locationKey.startsWith('policy:statement:'),
        );
        const publicCount = (item.policy ?? []).filter(
          (kind) => kind !== 'deny-star' && kind !== 'allow-named',
        ).length;
        expect(policyFindings.length).toBe(publicCount);
      }),
      FC_PARAMS,
    );
  });
});
