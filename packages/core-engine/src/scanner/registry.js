const RULE_ID = /^PG-(IAM|NET|STO|CTR)-[0-9]{3}$/;
/**
 * Validate and index a list of rules.
 * Throws an Error for a malformed id, an id whose category does not match its
 * `category`, or a duplicate id. These are programmer errors, not input errors.
 */
export function createRuleRegistry(rules) {
  const byId = new Map();
  for (const rule of rules) {
    const match = RULE_ID.exec(rule.id);
    if (match === null) {
      throw new Error(
        `Invalid detection rule id "${rule.id}": expected PG-<IAM|NET|STO|CTR>-<NNN>`,
      );
    }
    if (match[1] !== rule.category) {
      throw new Error(`Detection rule ${rule.id} declares category ${rule.category}`);
    }
    if (byId.has(rule.id)) {
      throw new Error(`Duplicate detection rule id: ${rule.id}`);
    }
    byId.set(rule.id, rule);
  }
  return { rules: [...byId.values()], get: (id) => byId.get(id) };
}
