import { booleanMember, isJsonObject, member, stringMember } from '../util/attributes.js';
import { printable } from '../util/text.js';
import { parseHcl } from './hcl.js';
import { terraformConfidence } from './terraform-signature.js';
import { MAX_JSON_DEPTH } from './types.js';
const S3_COMPANIONS = new Set([
  'aws_s3_bucket_acl',
  'aws_s3_bucket_policy',
  'aws_s3_bucket_public_access_block',
  'aws_s3_bucket_server_side_encryption_configuration',
]);
function info(code, message, line) {
  return { code, level: 'info', message, line, column: 1 };
}
function toJson(value) {
  switch (value.kind) {
    case 'string':
    case 'number':
    case 'bool':
      return value.value;
    case 'null':
      return null;
    case 'tuple':
      return value.items.map(toJson);
    case 'object':
      return Object.fromEntries(value.entries.map((entry) => [entry.key, toJson(entry.value)]));
    case 'call': {
      const [argument] = value.args;
      return value.name === 'jsonencode' && value.args.length === 1 && argument !== undefined
        ? toJson(argument)
        : value.text;
    }
    case 'opaque':
      return value.text;
  }
}
/** True when the value is fully known from the text alone. */
function isLiteral(value) {
  switch (value.kind) {
    case 'string':
      return !value.interpolated;
    case 'number':
    case 'bool':
    case 'null':
      return true;
    case 'tuple':
      return value.items.every(isLiteral);
    case 'object':
      return value.entries.every((entry) => isLiteral(entry.value));
    case 'call': {
      const [argument] = value.args;
      return value.name === 'jsonencode' && argument !== undefined && isLiteral(argument);
    }
    case 'opaque':
      return false;
  }
}
function exceedsDepth(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      depth += 1;
      if (depth > MAX_JSON_DEPTH) {
        return true;
      }
    } else if (char === '}' || char === ']') {
      depth = Math.max(0, depth - 1);
    }
  }
  return false;
}
/** JSON text from a heredoc or string, or the value of `jsonencode(...)` and plain HCL objects. */
function jsonFrom(value) {
  if (value.kind === 'string') {
    if (exceedsDepth(value.value)) {
      return { reason: `is nested deeper than ${String(MAX_JSON_DEPTH)} levels` };
    }
    try {
      return { json: JSON.parse(value.value) };
    } catch {
      return { reason: 'is not valid JSON' };
    }
  }
  if (value.kind === 'object' || value.kind === 'tuple') {
    return { json: toJson(value) };
  }
  if (value.kind === 'call' && value.name === 'jsonencode' && value.args.length === 1) {
    const [argument] = value.args;
    return argument === undefined ? { reason: 'is empty' } : { json: toJson(argument) };
  }
  return { reason: 'cannot be resolved from the text' };
}
/** A policy document with `Statement` as an array, so patches can address statements by index. */
function policyDocument(value) {
  const { json, reason } = jsonFrom(value);
  if (json === undefined) {
    return { reason: reason ?? 'cannot be read' };
  }
  if (!isJsonObject(json) || member(json, 'Statement') === undefined) {
    return { reason: 'has no "Statement"' };
  }
  const statement = member(json, 'Statement');
  const statements = Array.isArray(statement)
    ? statement
    : statement === undefined
      ? []
      : [statement];
  return {
    document: Object.fromEntries(
      Object.entries(json).map(([key, entry]) => [key, key === 'Statement' ? statements : entry]),
    ),
  };
}
function attributeOf(block) {
  return (name) => block.attributes.find((attribute) => attribute.name === name)?.value;
}
function objectGetter(value) {
  return (name) =>
    value.kind === 'object' ? value.entries.find((entry) => entry.key === name)?.value : undefined;
}
function childBlocks(block, type) {
  return block.blocks.filter((child) => child.type === type);
}
/** A string or a number as text. Undefined when absent; `unresolved` is set when it cannot be known. */
function scalarText(value, unresolved, name) {
  if (value === undefined) {
    return undefined;
  }
  if (value.kind === 'string' && !value.interpolated) {
    return value.value;
  }
  if (value.kind === 'number') {
    return String(value.value);
  }
  unresolved.add(name);
  return undefined;
}
function scalarNumber(value, unresolved, name) {
  if (value === undefined) {
    return undefined;
  }
  if (value.kind === 'number') {
    return value.value;
  }
  unresolved.add(name);
  return undefined;
}
/** Strings from a list (or a single string). Items that are references are kept as their text. */
function stringList(value, unresolved, name) {
  if (value === undefined) {
    return [];
  }
  if (value.kind === 'string') {
    return [value.value];
  }
  if (value.kind !== 'tuple') {
    unresolved.add(name);
    return [];
  }
  if (!isLiteral(value)) {
    unresolved.add(name);
  }
  return value.items.flatMap((item) => {
    const json = toJson(item);
    return typeof json === 'string' ? [json] : [];
  });
}
const BLOCK_NAMES = {
  protocol: 'protocol',
  ipv4: 'cidr_blocks',
  ipv6: 'ipv6_cidr_blocks',
};
const VPC_RULE_NAMES = {
  protocol: 'ip_protocol',
  ipv4: 'cidr_ipv4',
  ipv6: 'cidr_ipv6',
};
/** One ingress rule in the dataset shape, or undefined when its protocol or ports cannot be known. */
function ingressEntry(get, names, line, address, diagnostics) {
  const unresolved = new Set();
  const protocol = scalarText(get(names.protocol), unresolved, names.protocol);
  const from = scalarNumber(get('from_port'), unresolved, 'from_port');
  const to = scalarNumber(get('to_port'), unresolved, 'to_port');
  const ipv4 = stringList(get(names.ipv4), unresolved, names.ipv4);
  const ipv6 = stringList(get(names.ipv6), unresolved, names.ipv6);
  const description = scalarText(get('description'), unresolved, 'description');
  const judgeable =
    protocol !== undefined && !unresolved.has('from_port') && !unresolved.has('to_port');
  if (!judgeable) {
    diagnostics.push(
      info(
        'PG-PARSE-OPAQUE',
        `The protocol or port range of the ingress rule at line ${String(line)} of ${address} cannot be resolved from the text, so the rule was not judged.`,
        line,
      ),
    );
    return undefined;
  }
  if (unresolved.has(names.ipv4) || unresolved.has(names.ipv6)) {
    diagnostics.push(
      info(
        'PG-PARSE-OPAQUE',
        `Some sources of the ingress rule at line ${String(line)} of ${address} are references that cannot be resolved, so only the literal ones were judged.`,
        line,
      ),
    );
  }
  return {
    protocol,
    ...(from === undefined ? {} : { fromPort: from }),
    ...(to === undefined ? {} : { toPort: to }),
    cidrBlocks: ipv4,
    ipv6CidrBlocks: ipv6,
    ...(description === undefined ? {} : { description }),
    line,
  };
}
function noteUnresolved(draft, unresolved, out) {
  if (unresolved.size === 0) {
    return;
  }
  const names = [...unresolved].map((name) => printable(name, 40)).join(', ');
  out.push(
    info(
      'PG-PARSE-OPAQUE',
      `Could not resolve ${names} of ${draft.address}. The value is kept as text and treated as unknown, so a finding about it may be a false alarm.`,
      draft.block.line,
    ),
  );
}
function sseFrom(block, unresolved) {
  for (const rule of childBlocks(block, 'rule')) {
    for (const byDefault of childBlocks(rule, 'apply_server_side_encryption_by_default')) {
      const get = attributeOf(byDefault);
      const algorithm = scalarText(get('sse_algorithm'), unresolved, 'sse_algorithm');
      if (algorithm === undefined) {
        continue;
      }
      const keyId = scalarText(get('kms_master_key_id'), unresolved, 'kms_master_key_id');
      const bucketKey = attributeOf(rule)('bucket_key_enabled');
      return {
        algorithm,
        ...(keyId === undefined ? {} : { kmsKeyId: keyId }),
        ...(bucketKey?.kind === 'bool' ? { bucketKeyEnabled: bucketKey.value } : {}),
      };
    }
  }
  return undefined;
}
const PUBLIC_ACCESS_BLOCK_ARGUMENTS = [
  ['block_public_acls', 'blockPublicAcls'],
  ['block_public_policy', 'blockPublicPolicy'],
  ['ignore_public_acls', 'ignorePublicAcls'],
  ['restrict_public_buckets', 'restrictPublicBuckets'],
];
function containerList(value) {
  const { json, reason } = jsonFrom(value);
  if (json === undefined || !Array.isArray(json)) {
    return { reason: reason ?? 'is not a list' };
  }
  const containers = json.flatMap((item) => {
    if (!isJsonObject(item)) {
      return [];
    }
    const name = stringMember(item, 'name');
    const image = stringMember(item, 'image');
    const user = stringMember(item, 'user');
    const privileged = booleanMember(item, 'privileged');
    return [
      {
        ...(name === undefined ? {} : { name }),
        ...(image === undefined ? {} : { image }),
        ...(user === undefined ? {} : { user }),
        ...(privileged === undefined ? {} : { privileged }),
      },
    ];
  });
  return { containers };
}
/** Where a companion resource points: `aws_s3_bucket.<label>.<attribute>` or a literal bucket name. */
function bucketReference(value) {
  if (value === undefined) {
    return {};
  }
  const text = value.kind === 'opaque' ? value.text : value.kind === 'string' ? value.value : '';
  const inner = text.startsWith('${') && text.endsWith('}') ? text.slice(2, -1).trim() : text;
  if (inner.startsWith('aws_s3_bucket.')) {
    const label = inner.slice('aws_s3_bucket.'.length).split('.')[0]?.split('[')[0];
    return label === undefined || label === '' ? {} : { label };
  }
  return value.kind === 'string' && !value.interpolated ? { name: value.value } : {};
}
class Collector {
  drafts = [];
  diagnostics;
  buckets = new Map();
  bucketNames = new Map();
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
  }
  draft(type, kind, block, label) {
    const created = {
      address: `${type}.${label}`,
      kind,
      label,
      block,
      attributes: new Map(),
    };
    this.drafts.push(created);
    return created;
  }
  setPolicy(draft, key, value, argument) {
    if (value === undefined) {
      return;
    }
    const { document, reason } = policyDocument(value);
    if (document === undefined) {
      this.diagnostics.push(
        info(
          'PG-PARSE-OPAQUE',
          `The ${argument} of ${draft.address} ${reason ?? 'cannot be read'}, so it was not judged. Write it with jsonencode(...) or a JSON heredoc.`,
          draft.block.line,
        ),
      );
      return;
    }
    draft.attributes.set(key, document);
  }
  setScalar(draft, key, argument, value, unresolved) {
    if (value === undefined) {
      return;
    }
    if (!isLiteral(value)) {
      unresolved.add(argument);
    }
    draft.attributes.set(key, toJson(value));
  }
  /** First pass: every resource except the S3 companions, in file order. */
  addResource(type, label, block) {
    const get = attributeOf(block);
    const unresolved = new Set();
    switch (type) {
      case 'aws_iam_policy':
      case 'aws_iam_role_policy': {
        const draft = this.draft(type, 'aws_iam_policy', block, label);
        this.setPolicy(draft, 'document', get('policy'), 'policy');
        return;
      }
      case 'aws_iam_role': {
        const draft = this.draft(type, 'aws_iam_role', block, label);
        this.setPolicy(draft, 'trustPolicy', get('assume_role_policy'), 'assume_role_policy');
        return;
      }
      case 'aws_security_group': {
        const draft = this.draft(type, 'aws_security_group', block, label);
        const ingress = [];
        for (const rule of childBlocks(block, 'ingress')) {
          const entry = ingressEntry(
            attributeOf(rule),
            BLOCK_NAMES,
            rule.line,
            draft.address,
            this.diagnostics,
          );
          if (entry !== undefined) {
            ingress.push(entry);
          }
        }
        const listed = get('ingress');
        if (listed?.kind === 'tuple') {
          for (const item of listed.items) {
            const entry = ingressEntry(
              objectGetter(item),
              BLOCK_NAMES,
              block.line,
              draft.address,
              this.diagnostics,
            );
            if (entry !== undefined) {
              ingress.push(entry);
            }
          }
        }
        draft.attributes.set('ingress', ingress);
        return;
      }
      case 'aws_security_group_rule':
      case 'aws_vpc_security_group_ingress_rule': {
        const isLegacy = type === 'aws_security_group_rule';
        if (isLegacy && scalarText(get('type'), unresolved, 'type') !== 'ingress') {
          return;
        }
        const draft = this.draft(type, 'aws_security_group', block, label);
        const entry = ingressEntry(
          get,
          isLegacy ? BLOCK_NAMES : VPC_RULE_NAMES,
          block.line,
          draft.address,
          this.diagnostics,
        );
        draft.attributes.set('ingress', entry === undefined ? [] : [entry]);
        return;
      }
      case 'aws_s3_bucket': {
        const draft = this.draft(type, 'aws_s3_bucket', block, label);
        this.setScalar(draft, 'acl', 'acl', get('acl'), unresolved);
        for (const legacy of childBlocks(block, 'server_side_encryption_configuration')) {
          const sse = sseFrom(legacy, unresolved);
          if (sse !== undefined) {
            draft.attributes.set('serverSideEncryption', sse);
          }
        }
        this.buckets.set(label, draft);
        const bucketName = get('bucket');
        if (bucketName?.kind === 'string' && !bucketName.interpolated) {
          this.bucketNames.set(bucketName.value, draft);
        }
        noteUnresolved(draft, unresolved, this.diagnostics);
        return;
      }
      case 'aws_ebs_volume': {
        const draft = this.draft(type, 'aws_ebs_volume', block, label);
        this.setScalar(draft, 'encrypted', 'encrypted', get('encrypted'), unresolved);
        this.setScalar(draft, 'sizeGiB', 'size', get('size'), new Set());
        this.setScalar(draft, 'volumeType', 'type', get('type'), new Set());
        noteUnresolved(draft, unresolved, this.diagnostics);
        return;
      }
      case 'aws_db_instance': {
        const draft = this.draft(type, 'aws_db_instance', block, label);
        this.setScalar(
          draft,
          'storageEncrypted',
          'storage_encrypted',
          get('storage_encrypted'),
          unresolved,
        );
        this.setScalar(draft, 'engine', 'engine', get('engine'), new Set());
        this.setScalar(
          draft,
          'publiclyAccessible',
          'publicly_accessible',
          get('publicly_accessible'),
          new Set(),
        );
        noteUnresolved(draft, unresolved, this.diagnostics);
        return;
      }
      case 'aws_ecs_task_definition': {
        const draft = this.draft(type, 'aws_ecs_task_definition', block, label);
        const definitions = get('container_definitions');
        if (definitions !== undefined) {
          const { containers, reason } = containerList(definitions);
          if (containers === undefined) {
            this.diagnostics.push(
              info(
                'PG-PARSE-OPAQUE',
                `The container_definitions of ${draft.address} ${reason ?? 'cannot be read'}, so its containers were not judged.`,
                block.line,
              ),
            );
          } else {
            draft.attributes.set('containers', containers);
          }
        }
        return;
      }
      default:
        return;
    }
  }
  /** Second pass: S3 companion resources are merged into the bucket they point at. */
  addCompanion(type, label, block) {
    const get = attributeOf(block);
    const reference = bucketReference(get('bucket'));
    const target =
      reference.label !== undefined
        ? this.buckets.get(reference.label)
        : reference.name !== undefined
          ? this.bucketNames.get(reference.name)
          : undefined;
    if (target === undefined) {
      this.diagnostics.push(
        info(
          'PG-PARSE-ORPHAN',
          `${type}.${label} points at a bucket that is not defined in this text, so its settings were not applied to any bucket.`,
          block.line,
        ),
      );
      return;
    }
    const unresolved = new Set();
    switch (type) {
      case 'aws_s3_bucket_acl':
        this.setScalar(target, 'acl', 'acl', get('acl'), unresolved);
        break;
      case 'aws_s3_bucket_policy':
        this.setPolicy(target, 'policy', get('policy'), 'policy');
        break;
      case 'aws_s3_bucket_public_access_block': {
        const settings = [];
        for (const [argument, key] of PUBLIC_ACCESS_BLOCK_ARGUMENTS) {
          const value = get(argument);
          if (value !== undefined) {
            if (!isLiteral(value)) {
              unresolved.add(argument);
            }
            settings.push([key, toJson(value)]);
          }
        }
        target.attributes.set('publicAccessBlock', Object.fromEntries(settings));
        break;
      }
      default: {
        const sse = sseFrom(block, unresolved);
        if (sse !== undefined) {
          target.attributes.set('serverSideEncryption', sse);
        }
      }
    }
    noteUnresolved({ ...target, address: `${type}.${label}`, block }, unresolved, this.diagnostics);
  }
}
function parseTerraform(text) {
  const document = parseHcl(text);
  const diagnostics = [...document.diagnostics];
  const collector = new Collector(diagnostics);
  const companions = [];
  for (const block of document.blocks) {
    const [type, label] = block.labels;
    if (block.type === 'data' && type === 'aws_iam_policy_document') {
      diagnostics.push(
        info(
          'PG-PARSE-UNSUPPORTED-BLOCK',
          'data "aws_iam_policy_document" blocks are not analyzed yet. Write the policy with jsonencode(...) or a JSON heredoc to have it judged.',
          block.line,
        ),
      );
    } else if (block.type === 'resource' && type !== undefined && label !== undefined) {
      if (S3_COMPANIONS.has(type)) {
        companions.push({ type, label, block });
      } else {
        collector.addResource(type, label, block);
      }
    }
  }
  for (const companion of companions) {
    collector.addCompanion(companion.type, companion.label, companion.block);
  }
  if (collector.drafts.length === 0) {
    diagnostics.push(
      info(
        'PG-PARSE-NO-RESOURCES',
        'No resource of a type PhantomGuard checks was found: aws_iam_policy, aws_iam_role, aws_security_group, aws_s3_bucket, aws_ebs_volume, aws_db_instance or aws_ecs_task_definition.',
        1,
      ),
    );
  }
  const resources = collector.drafts.map((draft) => ({
    id: draft.address,
    kind: draft.kind,
    name: draft.label,
    provider: 'aws',
    origin: {
      mode: 'custom-config',
      format: 'terraform',
      startLine: draft.block.line,
      endLine: draft.block.endLine,
    },
    attributes: Object.fromEntries(draft.attributes),
  }));
  return { format: 'terraform', resources, diagnostics };
}
export const terraformParser = {
  format: 'terraform',
  label: 'Terraform',
  detect: terraformConfidence,
  parse: parseTerraform,
};
