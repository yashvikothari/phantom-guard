import type { DetectionRule, Remediation, RuleViolation } from '../../contracts/detection-rule.js';
import type { PatchOperation } from '../../contracts/exorcism-patch.js';
import type { HauntedResource } from '../../contracts/haunted-resource.js';
import type { JsonObject, JsonValue } from '../../contracts/json.js';
import type { Severity } from '../../contracts/severity.js';
import { buildPatch, renderJson } from '../../remediation/build-patch.js';
import { deriveActions, hasWildcard, sortedUnique } from '../../remediation/least-privilege.js';
import {
  booleanMember,
  numberMember,
  objectMember,
  stringArrayMember,
} from '../../util/attributes.js';
import { maxSeverity } from '../../util/severity.js';
import { printable } from '../../util/text.js';
import { CIS_IAM_FULL_ADMIN, IAM_LEAST_PRIVILEGE } from '../references.js';
import {
  describeStatement,
  readStatementAt,
  readStatements,
  statementIsArray,
  statementLine,
} from './statements.js';

type ActionClass = 'global' | 'service' | 'partial' | 'none';

/** `*` and `*:*` are global, `<service>:*` is service-wide, any other wildcard is partial. */
function classifyAction(action: string): ActionClass {
  if (action === '*' || action === '*:*') {
    return 'global';
  }
  if (!hasWildcard(action)) {
    return 'none';
  }
  const separator = action.indexOf(':');
  if (
    separator > 0 &&
    action.slice(separator + 1) === '*' &&
    !hasWildcard(action.slice(0, separator))
  ) {
    return 'service';
  }
  return 'partial';
}

/** A Resource that is a bare `*`, or an ARN whose service segment is `*`, is effectively unscoped. */
function isBroadResource(resource: string): boolean {
  if (resource === '*') {
    return true;
  }
  const parts = resource.split(':');
  return parts[0] === 'arn' && parts[2] === '*';
}

function severityOf(actionClass: ActionClass, resourceWildcard: boolean): Severity | undefined {
  switch (actionClass) {
    case 'global':
      return 'CRITICAL';
    case 'service':
      return resourceWildcard ? 'HIGH' : 'MEDIUM';
    case 'partial':
      return 'LOW';
    case 'none':
      return undefined;
  }
}

function evaluate(resource: HauntedResource): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];
  const document = objectMember(resource.attributes, 'document');

  for (const statement of readStatements(document)) {
    if (statement.effect !== 'Allow') {
      continue; // Deny statements restrict access; they are never a wildcard grant.
    }

    // A bare "*" Resource, or any NotResource, leaves the grant unscoped.
    const resourceWildcard = statement.resources.includes('*') || statement.notResources.length > 0;

    const offending: string[] = [];
    let severity: Severity | undefined;
    let hasGlobal = false;
    for (const action of statement.actions) {
      const actionClass = classifyAction(action);
      const actionSeverity = severityOf(actionClass, resourceWildcard);
      if (actionSeverity === undefined) {
        continue;
      }
      offending.push(action);
      hasGlobal = hasGlobal || actionClass === 'global';
      severity = severity === undefined ? actionSeverity : maxSeverity(severity, actionSeverity);
    }

    const usesNotAction = statement.notActions.length > 0;
    if (usesNotAction) {
      severity = severity === undefined ? 'HIGH' : maxSeverity(severity, 'HIGH');
    }
    if (severity === undefined) {
      continue;
    }

    const offendingActions = sortedUnique(offending);
    const scope = resourceWildcard ? 'on all resources' : 'on the listed resources';
    const message = usesNotAction
      ? `Statement ${describeStatement(statement)} uses Allow with NotAction, which grants every action except the ones listed, ${scope}.`
      : `Statement ${describeStatement(statement)} allows wildcard ${
          offendingActions.length === 1 ? 'action' : 'actions'
        } ${offendingActions.map((action) => `"${printable(action)}"`).join(', ')} ${scope}.`;

    // CIS 1.16 is specifically about "Action": "*" on "Resource": "*".
    const fullAdmin = hasGlobal && statement.resources.includes('*');
    const line = statementLine(resource.attributes, statement.index);

    violations.push({
      severity,
      message,
      locationKey: `statement:${String(statement.index)}`,
      evidence: {
        statementIndex: statement.index,
        ...(statement.sid === undefined ? {} : { sid: statement.sid }),
        offendingActions,
        usesNotAction,
        resourceWildcard,
      },
      ...(line === undefined ? {} : { line }),
      references: fullAdmin ? [CIS_IAM_FULL_ADMIN, IAM_LEAST_PRIVILEGE] : [IAM_LEAST_PRIVILEGE],
    });
  }
  return violations;
}

function guidance(text: string): Remediation {
  return { kind: 'guidance', guidance: text };
}

function remediate(resource: HauntedResource, violation: RuleViolation): Remediation {
  const index = numberMember(violation.evidence, 'statementIndex');
  const offending = stringArrayMember(violation.evidence, 'offendingActions');

  if (booleanMember(violation.evidence, 'usesNotAction') === true) {
    return guidance(
      'Replace NotAction with an explicit Action allow-list of the actions this principal needs. An Allow with NotAction grants everything except the listed actions, including actions AWS adds later.',
    );
  }

  const document = objectMember(resource.attributes, 'document');
  const statement = index === undefined ? undefined : readStatementAt(document, index);
  if (index === undefined || statement === undefined) {
    return guidance('Replace the wildcard actions with an explicit list of the actions required.');
  }

  const usage = objectMember(resource.attributes, 'observedUsage');
  const observedActions = usage === undefined ? [] : stringArrayMember(usage, 'actions');
  const derived = deriveActions(offending, observedActions);
  if (derived === undefined) {
    return guidance(
      'PhantomGuard has no usage evidence and no read-only catalog entry for these actions, so it will not guess. Generate a least-privilege policy from CloudTrail activity with IAM Access Analyzer, or list the exact actions the workload calls, then replace the wildcards.',
    );
  }

  // Keep the explicit actions already granted; replace only the wildcards.
  const keptActions = statement.actions.filter((action) => !hasWildcard(action));
  const actions = sortedUnique([...keptActions, ...derived.actions]);

  // Narrow the resources only when evidence names them. A scoped grant is never widened.
  const observedResources =
    usage === undefined
      ? []
      : sortedUnique(
          stringArrayMember(usage, 'resources').filter((item) => !isBroadResource(item)),
        );
  const narrowResources =
    derived.source === 'observed usage' &&
    statement.resources.includes('*') &&
    observedResources.length > 0;

  const base = statementIsArray(document)
    ? `/document/Statement/${String(index)}`
    : '/document/Statement';
  const operations: PatchOperation[] = [{ op: 'set', path: `${base}/Action`, value: actions }];
  if (narrowResources) {
    operations.push({ op: 'set', path: `${base}/Resource`, value: observedResources });
  }

  const after: JsonObject = {
    ...statement.raw,
    Action: actions,
    ...(narrowResources ? { Resource: observedResources as JsonValue } : {}),
  };

  const sourceNote =
    derived.source === 'observed usage'
      ? 'The actions come from usage observed for this principal.'
      : 'The actions come from the read-only catalog for the services named in the wildcard. Write and delete permissions are left out on purpose.';

  return {
    kind: 'patch',
    patch: buildPatch({
      ruleId: 'PG-IAM-001',
      resource,
      locationKey: violation.locationKey,
      title: 'Replace wildcard actions with an explicit least-privilege list',
      rationale: `${sourceNote}${
        narrowResources ? ' Resource is narrowed to the resources seen in use.' : ''
      } Review the list before applying: the policy will grant only what is listed, so anything the workload needs that is missing will be denied.`,
      reviewRequired: true,
      anchor: base,
      operations,
      before: renderJson(statement.raw),
      after: renderJson(after),
    }),
  };
}

export const wildcardPermissions: DetectionRule = {
  id: 'PG-IAM-001',
  category: 'IAM',
  title: 'IAM policy grants wildcard permissions',
  description:
    'An Allow statement uses "*", a service-wide wildcard such as "s3:*", a partial wildcard such as "s3:Get*", or NotAction in its permissions. Wildcard grants exceed least privilege. Full "*:*" administrative access is what CIS AWS Foundations 1.16 prohibits.',
  ward: 'Ward of the Boundless Grant',
  defaultSeverity: 'CRITICAL',
  appliesTo: ['aws_iam_policy', 'aws_iam_role'],
  references: [CIS_IAM_FULL_ADMIN, IAM_LEAST_PRIVILEGE],
  evaluate,
  remediate,
};
