/**
 * Recognizes Terraform (HCL) text from the block headers it starts with. Line-by-line
 * prefix checks only: linear time, no regular expression.
 */
const BLOCK_STARTS = [
  'resource "',
  'data "',
  'provider "',
  'module "',
  'variable "',
  'output "',
  'terraform {',
  'locals {',
];
export function terraformConfidence(text) {
  for (const raw of text.split('\n')) {
    const line = raw.trimStart();
    if (BLOCK_STARTS.some((start) => line.startsWith(start))) {
      return 0.9;
    }
  }
  return 0;
}
