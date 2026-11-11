import { buildPatch, renderJson } from '../../remediation/build-patch.js';
import {
  arrayMember,
  booleanMember,
  isJsonObject,
  numberMember,
  objectMember,
  stringMember,
} from '../../util/attributes.js';
import { printable } from '../../util/text.js';
import { CIS_DOCKER_NON_ROOT_USER } from '../references.js';
/** Numeric ids need no /etc/passwd entry, which makes this a safe default for any base image. */
const NON_ROOT_USER = '10001:10001';
/** `root`, `0`, `00`, and `root:group` / `0:0` pairs. Only the user part (before ":") counts. */
function isRootUser(user) {
  const name = (user.split(':')[0] ?? '').trim();
  return name === 'root' || /^0+$/.test(name);
}
function missingOrRoot(user) {
  return user === undefined || user.trim() === '' || isRootUser(user);
}
function evaluateImage(resource) {
  const stage = objectMember(resource.attributes, 'finalStage');
  if (stage === undefined || booleanMember(stage, 'userUnresolved') === true) {
    return []; // an unresolved user cannot be judged; see diagnose()
  }
  const user = stringMember(stage, 'user');
  if (!missingOrRoot(user)) {
    return [];
  }
  const line = numberMember(stage, 'userLine') ?? numberMember(stage, 'fromLine');
  return [
    {
      severity: 'HIGH',
      message:
        user === undefined || user.trim() === ''
          ? 'The final build stage has no USER instruction, so the container runs as root by default.'
          : `The final build stage switches to the root user ("${printable(user, 32)}").`,
      locationKey: 'finalStage:user',
      evidence: { stage: 'final', user: user ?? null },
      ...(line === undefined ? {} : { line }),
    },
  ];
}
function evaluateTaskDefinition(resource) {
  const violations = [];
  arrayMember(resource.attributes, 'containers').forEach((entry, index) => {
    if (!isJsonObject(entry)) {
      return;
    }
    const name = stringMember(entry, 'name') ?? `container ${String(index + 1)}`;
    const privileged = booleanMember(entry, 'privileged') === true;
    const user = stringMember(entry, 'user');
    if (!privileged && !missingOrRoot(user)) {
      return;
    }
    violations.push({
      severity: privileged ? 'CRITICAL' : 'HIGH',
      message: privileged
        ? `Container "${printable(name, 48)}" runs in privileged mode, which gives it nearly all capabilities of the host.`
        : user === undefined || user.trim() === ''
          ? `Container "${printable(name, 48)}" sets no user, so it runs as root.`
          : `Container "${printable(name, 48)}" runs as the root user ("${printable(user, 32)}").`,
      locationKey: `container:${String(index)}`,
      evidence: {
        containerIndex: index,
        containerName: name,
        privileged,
        user: user ?? null,
      },
    });
  });
  return violations;
}
function evaluate(resource) {
  return resource.kind === 'aws_ecs_task_definition'
    ? evaluateTaskDefinition(resource)
    : evaluateImage(resource);
}
function diagnose(resource) {
  const stage = objectMember(resource.attributes, 'finalStage');
  if (resource.kind !== 'container_image' || stage === undefined) {
    return [];
  }
  if (booleanMember(stage, 'userUnresolved') !== true) {
    return [];
  }
  const line = numberMember(stage, 'userLine');
  return [
    {
      code: 'PG-CTR-UNRESOLVED-USER',
      level: 'info',
      message:
        'The USER instruction in the final build stage uses a variable, so PhantomGuard cannot tell whether the container runs as root. Check that the resolved user is not root.',
      ...(line === undefined ? {} : { line }),
    },
  ];
}
function remediate(resource, violation) {
  if (resource.kind === 'container_image') {
    const user = stringMember(violation.evidence, 'user');
    return {
      kind: 'patch',
      patch: buildPatch({
        ruleId: 'PG-CTR-001',
        resource,
        locationKey: violation.locationKey,
        title: 'Run the final stage as a non-root user',
        rationale: `Sets the final stage user to ${NON_ROOT_USER}. A numeric id needs no entry in /etc/passwd. Review first: files the application writes must be owned by that user (for example COPY --chown), and it must listen on a port above 1024.`,
        reviewRequired: true,
        anchor: '/finalStage/user',
        operations: [{ op: 'set', path: '/finalStage/user', value: NON_ROOT_USER }],
        before: user === undefined ? '# no USER instruction: runs as root' : `USER ${user}`,
        after: `USER ${NON_ROOT_USER}`,
      }),
    };
  }
  const index = numberMember(violation.evidence, 'containerIndex');
  const container =
    index === undefined ? undefined : arrayMember(resource.attributes, 'containers')[index];
  if (index === undefined || !isJsonObject(container)) {
    return {
      kind: 'guidance',
      guidance: `Set "user" to a non-root id such as ${NON_ROOT_USER} and turn off "privileged".`,
    };
  }
  const privileged = booleanMember(container, 'privileged') === true;
  const after = {
    ...container,
    user: NON_ROOT_USER,
    ...(privileged ? { privileged: false } : {}),
  };
  const base = `/containers/${String(index)}`;
  return {
    kind: 'patch',
    patch: buildPatch({
      ruleId: 'PG-CTR-001',
      resource,
      locationKey: violation.locationKey,
      title: privileged
        ? 'Turn off privileged mode and run as a non-root user'
        : 'Run the container as a non-root user',
      rationale: `Sets "user" to ${NON_ROOT_USER}${privileged ? ' and "privileged" to false' : ''}. Review first: the image must work without root (file ownership, ports above 1024)${privileged ? ', and nothing in it may rely on host-level capabilities' : ''}.`,
      reviewRequired: true,
      anchor: base,
      operations: [
        { op: 'set', path: `${base}/user`, value: NON_ROOT_USER },
        ...(privileged ? [{ op: 'set', path: `${base}/privileged`, value: false }] : []),
      ],
      before: renderJson(container),
      after: renderJson(after),
    }),
  };
}
export const rootContainer = {
  id: 'PG-CTR-001',
  category: 'CTR',
  title: 'Container runs as root',
  description:
    'A Dockerfile final stage has no USER instruction or switches to root, or an ECS container runs as root or in privileged mode. A compromised process then starts with full privileges inside the container (CIS Docker Benchmark 4.1).',
  ward: 'Ward Against the Crowned Ghoul',
  defaultSeverity: 'CRITICAL',
  appliesTo: ['container_image', 'aws_ecs_task_definition'],
  references: [CIS_DOCKER_NON_ROOT_USER],
  evaluate,
  remediate,
  diagnose,
};
