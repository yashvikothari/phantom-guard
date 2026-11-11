/** The AWS documentation example account id. Every dataset uses it; none uses a real account. */
export const EXAMPLE_ACCOUNT_ID = '123456789012';
export const EXAMPLE_REGION = 'us-east-1';
/** Build a dataset resource with a stable id of the form `<kind>.<name>`. */
export function datasetResource(datasetId, kind, name, attributes) {
  return {
    id: `${kind}.${name}`,
    kind,
    name,
    provider: kind === 'container_image' ? 'docker' : 'aws',
    region: EXAMPLE_REGION,
    origin: { mode: 'haunted-cloud', datasetId },
    attributes,
  };
}
