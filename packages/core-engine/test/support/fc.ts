const requestedRuns = Number(process.env['FC_NUM_RUNS']);

/** At least 200 runs per property (Requirement 22.4). Raise it with FC_NUM_RUNS. */
export const NUM_RUNS =
  Number.isInteger(requestedRuns) && requestedRuns >= 200 ? requestedRuns : 200;

const seedText = process.env['FC_SEED'];
const requestedSeed = seedText === undefined || seedText === '' ? Number.NaN : Number(seedText);

/**
 * Parameters for every `fc.assert`. On failure fast-check prints the seed and the
 * shrunk counterexample (Requirement 22.3); replay it with `FC_SEED=<seed> npm test`.
 */
export const FC_PARAMS: { numRuns: number; seed?: number } = {
  numRuns: NUM_RUNS,
  ...(Number.isInteger(requestedSeed) ? { seed: requestedSeed } : {}),
};
