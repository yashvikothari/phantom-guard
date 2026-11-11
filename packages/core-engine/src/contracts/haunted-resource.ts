import type { JsonObject } from './json.js';

/** Input formats PhantomGuard can parse (a parser may not exist yet for every one). */
export type ConfigFormat = 'terraform' | 'dockerfile' | 'iam-policy';

export type ResourceKind =
  | 'aws_iam_policy'
  | 'aws_iam_role'
  | 'aws_security_group'
  | 'aws_s3_bucket'
  | 'aws_ebs_volume'
  | 'aws_db_instance'
  | 'aws_ecs_task_definition'
  | 'container_image';

export type ResourceOrigin =
  | { readonly mode: 'haunted-cloud'; readonly datasetId: string }
  | {
      readonly mode: 'custom-config';
      readonly format: ConfigFormat;
      /** 1-based, inclusive. */
      readonly startLine: number;
      /** 1-based, inclusive. */
      readonly endLine: number;
    };

/**
 * The normalized representation of one infrastructure resource, whatever its
 * source (dataset, Terraform, Dockerfile, IAM policy). Rules read only
 * `attributes`, so one rule serves every source.
 */
export interface HauntedResource {
  /** Unique within one scan and stable across scans of identical input. */
  readonly id: string;
  readonly kind: ResourceKind;
  readonly name: string;
  readonly provider: 'aws' | 'docker';
  readonly region?: string;
  readonly origin: ResourceOrigin;
  /** Normalized, JSON-serializable configuration. */
  readonly attributes: JsonObject;
}
