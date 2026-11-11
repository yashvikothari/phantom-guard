import type { ConfigFormat } from '../contracts/haunted-resource.js';
import { utf8ByteLength } from '../util/text.js';
import { dockerfileParser } from './dockerfile.js';
import { iamPolicyParser } from './iam-policy.js';
import { terraformParser } from './terraform.js';
import { MAX_INPUT_BYTES } from './types.js';
import type { ConfigParser, ParseOptions, ParseResult } from './types.js';

/** Every registered parser. Add a format by implementing ConfigParser and listing it here. */
export const PARSERS: readonly ConfigParser[] = [
  iamPolicyParser,
  dockerfileParser,
  terraformParser,
];

const FORMAT_LABELS: Readonly<Record<ConfigFormat, string>> = {
  terraform: 'Terraform',
  dockerfile: 'Dockerfile',
  'iam-policy': 'IAM policy (JSON)',
};

/** Formats that can be parsed today. */
export function supportedFormats(): readonly ConfigFormat[] {
  return PARSERS.map((parser) => parser.format);
}

/** Guess the format from content alone. Returns undefined when nothing matches. */
export function detectFormat(text: string): ConfigFormat | undefined {
  let best: ConfigFormat | undefined;
  let bestScore = 0;
  for (const parser of PARSERS) {
    const score = parser.detect(text);
    if (score > bestScore) {
      best = parser.format;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Parse configuration text into HauntedResources. Never throws.
 * Order of checks: size limit, format (declared or detected), parser lookup, parse.
 */
export function parseConfig(text: string, options: ParseOptions = {}): ParseResult {
  const maxBytes = options.maxBytes ?? MAX_INPUT_BYTES;
  if (utf8ByteLength(text) > maxBytes) {
    return {
      resources: [],
      diagnostics: [
        {
          code: 'PG-LIMIT-INPUT-SIZE',
          level: 'error',
          message: `The input is larger than the ${String(maxBytes)}-byte limit and was not parsed.`,
        },
      ],
    };
  }

  const format = options.format ?? detectFormat(text);
  if (format === undefined) {
    return {
      resources: [],
      diagnostics: [
        {
          code: 'PG-PARSE-UNKNOWN-FORMAT',
          level: 'error',
          message: `The format could not be detected. Supported formats: ${supportedFormats()
            .map((supported) => FORMAT_LABELS[supported])
            .join(', ')}.`,
        },
      ],
    };
  }

  const parser = PARSERS.find((candidate) => candidate.format === format);
  if (parser === undefined) {
    return {
      format,
      resources: [],
      diagnostics: [
        {
          code: 'PG-PARSE-UNSUPPORTED',
          level: 'error',
          message: `${FORMAT_LABELS[format]} was recognized, but no parser for it is available yet.`,
        },
      ],
    };
  }

  try {
    return parser.parse(text);
  } catch {
    // Defense in depth: a parser must not throw, but one bug must not take the scan down.
    return {
      format,
      resources: [],
      diagnostics: [
        {
          code: 'PG-PARSE-INTERNAL',
          level: 'error',
          message: `The ${parser.label} parser failed unexpectedly. The input was not analyzed.`,
        },
      ],
    };
  }
}

export { MAX_INPUT_BYTES, MAX_JSON_DEPTH } from './types.js';
export type { ConfigParser, ParseOptions, ParseResult } from './types.js';
