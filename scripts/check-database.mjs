import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CosmosClient } from "@azure/cosmos";

const { COSMOS_ENDPOINT, COSMOS_KEY } = process.env;
assert(COSMOS_ENDPOINT && COSMOS_KEY, "Configure Cosmos DB in .env.local first.");
const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
const container = client
  .database(process.env.COSMOS_DATABASE || "cinevault")
  .container(process.env.COSMOS_CONTAINER || "movies");
const id = `connection-check-${randomUUID()}`;
const partitionKey = "connection-check";
try {
  await container.items.create({ id, libraryId: partitionKey, check: true });
  const { resource } = await container.item(id, partitionKey).read();
  assert.equal(resource?.check, true);
  console.log("Cosmos DB write/read confirmed.");
} finally {
  try {
    await container.item(id, partitionKey).delete();
    console.log("Temporary verification document removed.");
  } catch (error) {
    if (error.code !== 404) throw error;
  }
  client.dispose();
}
