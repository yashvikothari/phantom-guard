import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { detectFormat, parseConfig, scanText } from '../../src/index.js';
import type { ConfigFormat } from '../../src/index.js';
import { anyText, parserInput } from '../arbitraries/text.js';
import { FC_PARAMS } from '../support/fc.js';

const FORMATS: readonly (ConfigFormat | undefined)[] = [
  undefined,
  'iam-policy',
  'dockerfile',
  'terraform',
];

describe('parsers', () => {
  // Feature: phantom-guard, Property 1: Parsers are total and deterministic
  // Validates: Requirements 2.2, 2.4
  it('never throw, and return deeply equal results for equal input, for any string and any declared format', () => {
    fc.assert(
      fc.property(parserInput, fc.constantFrom(...FORMATS), (text, format) => {
        const options = format === undefined ? {} : { format };
        const first = parseConfig(text, options);
        expect(parseConfig(text, options)).toEqual(first);
        expect(Array.isArray(first.resources)).toBe(true);
        expect(Array.isArray(first.diagnostics)).toBe(true);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 1: Parsers are total and deterministic
  // Validates: Requirements 1.3, 1.4, 2.1
  it('explain every failure with a diagnostic that has a code, a level and a message', () => {
    fc.assert(
      fc.property(parserInput, (text) => {
        const result = parseConfig(text);
        if (result.resources.length === 0) {
          expect(result.diagnostics.length).toBeGreaterThan(0);
        }
        for (const diagnostic of result.diagnostics) {
          expect(diagnostic.code).toMatch(/^PG-[A-Z]+(-[A-Z]+)+$/);
          expect(['error', 'warning', 'info']).toContain(diagnostic.level);
          expect(diagnostic.message.length).toBeGreaterThan(0);
          if (diagnostic.line !== undefined) {
            expect(diagnostic.line).toBeGreaterThanOrEqual(1);
          }
          if (diagnostic.column !== undefined) {
            expect(diagnostic.column).toBeGreaterThanOrEqual(1);
          }
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 1: Parsers are total and deterministic
  // Validates: Requirements 1.1, 1.2
  it('detect a format that, when declared, gives the same result as detection', () => {
    fc.assert(
      fc.property(parserInput, (text) => {
        const detected = detectFormat(text);
        if (detected === undefined) {
          return;
        }
        expect(parseConfig(text, { format: detected })).toEqual(parseConfig(text));
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 1: Parsers are total and deterministic
  // Validates: Requirements 1.5
  it('refuse input over the byte limit, counting UTF-8 bytes, and parse input at the limit', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.integer({ min: 1, max: 60 }),
        (text, limit) => {
          const bytes = [...text].reduce((total, char) => {
            const code = char.codePointAt(0) ?? 0;
            return total + (code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4);
          }, 0);
          const codes = parseConfig(text, { maxBytes: limit }).diagnostics.map((d) => d.code);
          expect(codes.includes('PG-LIMIT-INPUT-SIZE')).toBe(bytes > limit);
        },
      ),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 9.2, 9.6
  it('scanText is deterministic, orders findings by severity, and keeps summary arithmetic consistent', () => {
    const weight = { CRITICAL: 40, HIGH: 20, MEDIUM: 8, LOW: 2, INFO: 0 } as const;
    const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 } as const;
    fc.assert(
      fc.property(anyText, (text) => {
        const report = scanText(text);
        expect(scanText(text)).toEqual(report);

        // Property 10: Summary arithmetic is consistent. Validates: Requirements 9.3, 9.4
        const counted = Object.values(report.summary.bySeverity).reduce((a, b) => a + b, 0);
        expect(counted).toBe(report.findings.length);
        expect(report.summary.total).toBe(report.findings.length);
        expect(report.summary.riskScore).toBe(
          Math.min(
            100,
            report.findings.reduce((sum, f) => sum + weight[f.severity], 0),
          ),
        );
        for (let i = 1; i < report.findings.length; i += 1) {
          const previous = report.findings[i - 1];
          const current = report.findings[i];
          if (previous !== undefined && current !== undefined) {
            expect(rank[previous.severity]).toBeLessThanOrEqual(rank[current.severity]);
          }
        }
      }),
      FC_PARAMS,
    );
  });
});
