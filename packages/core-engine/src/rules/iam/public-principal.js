import { objectMember } from '../../util/attributes.js';
import { IAM_LEAST_PRIVILEGE } from '../references.js';
import {
  describeStatement,
  isPublicPrincipal,
  readStatements,
  statementLine,
} from './statements.js';
/** Policy documents on a resource that can carry a Principal. */
const DOCUMENT_FIELDS = [
  { field: 'document', label: 'policy document' },
  { field: 'trustPolicy', label: 'trust policy' },
];
function evaluate(resource) {
  const violations = [];
  for (const { field, label } of DOCUMENT_FIELDS) {
    for (const statement of readStatements(objectMember(resource.attributes, field))) {
      if (statement.effect !== 'Allow' || !isPublicPrincipal(statement.principal)) {
        continue;
      }
      const conditioned = statement.hasCondition;
      const line =
        field === 'document' ? statementLine(resource.attributes, statement.index) : undefined;
      violations.push({
        // A Condition may narrow who can really use the grant, so it is reviewed, not condemned.
        severity: conditioned ? 'MEDIUM' : 'CRITICAL',
        message: `Statement ${describeStatement(statement)} in the ${label} allows any principal ("*")${
          conditioned
            ? ' behind a Condition. Review that the Condition really limits who can use it.'
            : ' with no Condition.'
        }`,
        locationKey: `${field}:statement:${String(statement.index)}`,
        evidence: {
          document: field,
          statementIndex: statement.index,
          ...(statement.sid === undefined ? {} : { sid: statement.sid }),
          hasCondition: conditioned,
        },
        ...(line === undefined ? {} : { line }),
      });
    }
  }
  return violations;
}
function remediate(_resource, _violation) {
  // PhantomGuard cannot know which principal is meant, so it will not invent one.
  return {
    kind: 'guidance',
    guidance:
      'Replace the wildcard Principal with the specific AWS account, role or service principal that needs access. If broad access is intended, restrict it with a Condition such as aws:PrincipalOrgID, aws:SourceArn or aws:SourceAccount.',
  };
}
export const publicPrincipal = {
  id: 'PG-IAM-002',
  category: 'IAM',
  title: 'IAM statement allows any principal',
  description:
    'An Allow statement names "*" (or {"AWS": "*"}) as its Principal, so anyone, including other AWS accounts, can use the grant. Without a Condition this is a public grant.',
  ward: 'Ward Against the Faceless Visitor',
  defaultSeverity: 'CRITICAL',
  appliesTo: ['aws_iam_policy', 'aws_iam_role'],
  references: [IAM_LEAST_PRIVILEGE],
  evaluate,
  remediate,
};
