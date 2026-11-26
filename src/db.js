import init, { RelateDb } from "@relate/relate-wasm";
import wasmUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import seed from "../data/seed.json";
import { seedGraph } from "./seed-graph.js";

// The browser rebuilds the exact graph the CLI writes into `data/receipts.rl`.
// WASM has no `.rl` loader, so the shared seed module is the single definition.
export async function createDb({ onProgress } = {}) {
  onProgress?.("Loading the Relate engine");
  await init({ module_or_path: wasmUrl });

  const db = new RelateDb();

  const execute = (cypher, params) => {
    const raw = db.execute(
      cypher,
      params === undefined ? null : JSON.stringify(params),
    );
    const envelope = JSON.parse(raw);
    if (envelope.error) {
      const error = new Error(envelope.error);
      error.cypher = cypher;
      throw error;
    }
    return envelope;
  };

  onProgress?.("Building 89 nodes and 135 relationships");
  seedGraph((cypher, params) => {
    execute(cypher, params);
  }, seed);

  return {
    db,
    run(cypher, params) {
      return execute(cypher, params).rows;
    },
    timing(cypher, params) {
      return execute(cypher, params).elapsed_ms;
    },
  };
}
