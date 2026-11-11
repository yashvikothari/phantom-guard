import type { DetectionRule, Remediation, RuleViolation } from '../../contracts/detection-rule.js';
import type { HauntedResource } from '../../contracts/haunted-resource.js';
import type { JsonObject } from '../../contracts/json.js';
import type { Severity } from '../../contracts/severity.js';
import { buildPatch, renderJson } from '../../remediation/build-patch.js';
import { booleanMember, objectMember, stringMember } from '../../util/attributes.js';
import { printable } from '../../util/text.js';
import { describeStatement, isPublicPrincipal, readStatements } from '../iam/statements.js';
import { CIS_S3_BLOCK_PUBLIC_ACCESS, S3_BLOCK_PUBLIC_ACCESS_GUIDE } from '../references.js';

const BLOCK_SETTINGS = [
  'blockPublicAcls',
  'blockPublicPolicy',
  'ignorePublicAcls',
  'restrictPublicBuckets',
] as const;

/** Canned ACLs that open a bucket, with the severity of the exposure and who they open it to. */
const OPEN_ACLS: ReadonlyMap<string, { readonly severity: Severity; readonly audience: string }> =
  new Map([
    [
      'public-read-write',
      {
        severity: 'CRITICAL',
        audience: 'everyone, including anonymous users, with read and write access',
      },
    ],
    [
      'public-read',
      { severity: 'CRITICAL', audience: 'everyone, including anonymous users, with read access' },
    ],
    [
      'authenticated-read',
      { severity: 'HIGH', audience: 'any AWS account holder with read access' },
    ],
  ]);

const ALL_ENABLED: JsonObject = {
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
};

function publicAccessBlock(resource: HauntedResource): JsonObject | undefined {
  return objectMember(resource.attributes, 'publicAccessBlock');
}

function isEnabled(block: JsonObject | undefined, setting: string): boolean {
  return block !== undefined && booleanMember(block, setting) === true;
}

function publicStatementIndexes(resource: HauntedResource): readonly number[] {
  return readStatements(objectMember(resource.attributes, 'policy'))
    .filter((statement) => statement.effect === 'Allow' && isPublicPrincipal(statement.principal))
    .map((statement) => statement.index);
}

function hasOpenAcl(resource: HauntedResource): boolean {
  const acl = stringMember(resource.attributes, 'acl');
  return acl !== undefined && OPEN_ACLS.has(acl);
}

function evaluate(resource: HauntedResource): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];
  const block = publicAccessBlock(resource);

  const acl = stringMember(resource.attributes, 'acl');
  const open = acl === undefined ? undefined : OPEN_ACLS.get(acl);
  if (acl !== undefined && open !== undefined) {
    const neutralized = isEnabled(block, 'ignorePublicAcls');
    violations.push({
      severity: neutralized ? 'MEDIUM' : open.severity,
      message: `The bucket ACL "${printable(acl)}" grants access to ${open.audience}.${
        neutralized
          ? ' Block Public Access ignores public ACLs on this bucket, so the grant is not effective, but it would take effect if that setting were turned off.'
          : ''
      }`,
      locationKey: 'acl',
      evidence: { acl, neutralized },
      references: [S3_BLOCK_PUBLIC_ACCESS_GUIDE],
    });
  }

  const restricted = isEnabled(block, 'restrictPublicBuckets');
  for (const statement of readStatements(objectMember(resource.attributes, 'policy'))) {
    if (statement.effect !== 'Allow' || !isPublicPrincipal(statement.principal)) {
      continue; // a Deny that names "*" restricts access, so it is never a public grant
    }
    const conditioned = statement.hasCondition;
    violations.push({
      severity: restricted || conditioned ? 'MEDIUM' : 'CRITICAL',
      message: `Statement ${describeStatement(statement)} of the bucket policy allows any principal ("*")${
        conditioned
          ? ' behind a Condition. Review that the Condition really limits who can use it.'
          : ' with no Condition.'
      }${
        restricted
          ? ' RestrictPublicBuckets is on, which limits a public policy to AWS services and principals of the bucket owner account, so the policy is not effective as written.'
          : ''
      }`,
      locationKey: `policy:statement:${String(statement.index)}`,
      evidence: {
        statementIndex: statement.index,
        ...(statement.sid === undefined ? {} : { sid: statement.sid }),
        hasCondition: conditioned,
        neutralized: restricted,
      },
      references: [S3_BLOCK_PUBLIC_ACCESS_GUIDE],
    });
  }

  const disabled = BLOCK_SETTINGS.filter(
    (setting) => block !== undefined && booleanMember(block, setting) === false,
  );
  const unset = BLOCK_SETTINGS.filter(
    (setting) => !isEnabled(block, setting) && !disabled.includes(setting),
  );
  if (disabled.length + unset.length > 0) {
    const detail = [
      ...disabled.map((setting) => `${setting} (set to false)`),
      ...unset.map((setting) => `${setting} (not set)`),
    ].join(', ');
    violations.push({
      severity: 'MEDIUM',
      // New buckets have had Block Public Access on since April 2023, so a missing declaration
      // is not an open door. Say so, as the S3 encryption finding does.
      message:
        block === undefined
          ? 'The bucket declares no Block Public Access configuration. Amazon S3 turns Block Public Access on for buckets created since April 2023, so this is a missing explicit declaration; declare it so the intent is auditable and survives changes to account defaults.'
          : `Block Public Access does not enable: ${detail}.`,
      locationKey: 'public-access-block',
      evidence: { disabled: [...disabled], unset: [...unset] },
      references: [CIS_S3_BLOCK_PUBLIC_ACCESS, S3_BLOCK_PUBLIC_ACCESS_GUIDE],
    });
  }
  return violations;
}

function remediate(resource: HauntedResource, violation: RuleViolation): Remediation {
  if (violation.locationKey === 'acl') {
    const current = stringMember(resource.attributes, 'acl');
    return {
      kind: 'patch',
      patch: buildPatch({
        ruleId: 'PG-STO-002',
        resource,
        locationKey: violation.locationKey,
        title: 'Make the bucket ACL private',
        rationale:
          'Sets the canned ACL to "private" so the bucket is no longer opened to the public through its ACL. Anything that relied on public reads stops working, so review it first.',
        reviewRequired: true,
        anchor: '/acl',
        operations: [{ op: 'set', path: '/acl', value: 'private' }],
        before: renderJson({ acl: current ?? null }),
        after: renderJson({ acl: 'private' }),
      }),
    };
  }

  if (violation.locationKey === 'public-access-block') {
    const current = publicAccessBlock(resource);
    // Turning Block Public Access on changes behavior only when something is public today.
    const changesAccess = hasOpenAcl(resource) || publicStatementIndexes(resource).length > 0;
    return {
      kind: 'patch',
      patch: buildPatch({
        ruleId: 'PG-STO-002',
        resource,
        locationKey: violation.locationKey,
        title: 'Turn on all four Block Public Access settings',
        rationale: changesAccess
          ? 'Sets blockPublicAcls, blockPublicPolicy, ignorePublicAcls and restrictPublicBuckets to true. This bucket has a public ACL or policy today, so turning these on will cut off public access. Review who still needs it.'
          : 'Sets blockPublicAcls, blockPublicPolicy, ignorePublicAcls and restrictPublicBuckets to true. Nothing on this bucket is public today, so behavior does not change; the settings keep it that way.',
        reviewRequired: changesAccess,
        anchor: '/publicAccessBlock',
        operations: [{ op: 'set', path: '/publicAccessBlock', value: ALL_ENABLED }],
        before: renderJson({ publicAccessBlock: current ?? {} }),
        after: renderJson({ publicAccessBlock: ALL_ENABLED }),
      }),
    };
  }

  // A public bucket policy: PhantomGuard cannot know which principal is meant.
  return {
    kind: 'guidance',
    guidance:
      'Replace the wildcard Principal with the specific AWS accounts, roles or services that need access, or restrict it with a Condition such as aws:PrincipalOrgID or aws:SourceArn. Then turn on Block Public Access so a later mistake cannot expose the bucket.',
  };
}

export const s3PublicAccess: DetectionRule = {
  id: 'PG-STO-002',
  category: 'STO',
  title: 'S3 bucket can be reached by the public',
  description:
    'An S3 bucket has a public canned ACL, a bucket policy that allows any principal, or Block Public Access settings that are not all enabled. Block Public Access is on by default for new buckets, so a missing declaration is rated as a declaration gap, not as an open bucket.',
  ward: 'Ward of the Open Gate',
  defaultSeverity: 'CRITICAL',
  appliesTo: ['aws_s3_bucket'],
  references: [CIS_S3_BLOCK_PUBLIC_ACCESS, S3_BLOCK_PUBLIC_ACCESS_GUIDE],
  evaluate,
  remediate,
};
