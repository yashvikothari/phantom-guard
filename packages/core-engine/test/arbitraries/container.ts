import * as fc from 'fast-check';
import { parseConfig } from '../../src/index.js';
import type { HauntedResource } from '../../src/index.js';
import { makeResource } from '../support/resources.js';

/** Users a Dockerfile `USER` or an ECS `user` can name. `undefined` means "not set". */
export const ROOT_USERS = ['root', '0', '00', 'root:root', '0:0', 'root:staff'] as const;
export const SAFE_USERS = [
  'app',
  'node',
  '1000',
  '1000:1000',
  '10001:10001',
  'nobody:nogroup',
] as const;

const anyUser = fc.oneof(fc.constantFrom(...ROOT_USERS), fc.constantFrom(...SAFE_USERS));

export const isRoot = (user: string | undefined): boolean =>
  user === undefined || (ROOT_USERS as readonly string[]).includes(user);

/** A build stage as the generator models it. */
export interface GeneratedStage {
  /** USER instructions in order; the LAST one decides. */
  readonly users: readonly string[];
  readonly aliased: boolean;
}

export const stage: fc.Arbitrary<GeneratedStage> = fc.record({
  users: fc.array(anyUser, { maxLength: 3 }),
  aliased: fc.boolean(),
});

export function renderDockerfile(stages: readonly GeneratedStage[]): string {
  return stages
    .map((item, index) =>
      [
        `FROM ${index === 0 ? 'golang:1.23' : 'alpine:3.20'}${item.aliased ? ` AS stage${String(index)}` : ''}`,
        'RUN echo build',
        ...item.users.flatMap((user) => [`USER ${user}`, 'RUN echo as-user']),
        'CMD ["true"]',
      ].join('\n'),
    )
    .join('\n');
}

export const dockerfile: fc.Arbitrary<{ stages: GeneratedStage[]; text: string }> = fc
  .array(stage, { minLength: 1, maxLength: 3 })
  .map((stages) => ({ stages, text: renderDockerfile(stages) }));

/** The one resource a Dockerfile text parses into. */
export function imageOf(text: string): HauntedResource {
  const resource = parseConfig(text, { format: 'dockerfile' }).resources[0];
  if (resource === undefined) {
    throw new Error(`no resource parsed from:\n${text}`);
  }
  return resource;
}

export interface GeneratedContainer {
  readonly user: string | undefined;
  readonly privileged: boolean | undefined;
}

export const container: fc.Arbitrary<GeneratedContainer> = fc.record({
  user: fc.oneof(fc.constant<string | undefined>(undefined), anyUser),
  privileged: fc.constantFrom<boolean | undefined>(true, false, undefined),
});

export function toTaskDefinition(containers: readonly GeneratedContainer[]): HauntedResource {
  return makeResource('aws_ecs_task_definition', {
    family: 'subject',
    containers: containers.map((item, index) => ({
      name: `c${String(index)}`,
      image: 'example/app:1',
      ...(item.user === undefined ? {} : { user: item.user }),
      ...(item.privileged === undefined ? {} : { privileged: item.privileged }),
    })),
  });
}

export const taskDefinition: fc.Arbitrary<{
  containers: GeneratedContainer[];
  resource: HauntedResource;
}> = fc
  .array(container, { minLength: 1, maxLength: 4 })
  .map((containers) => ({ containers, resource: toTaskDefinition(containers) }));
