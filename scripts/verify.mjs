// Runs the demo's queries against the persistent store and prints the answers.
// This is the "no browser" proof that the graph does the work.
import { Database } from "@relate/relate";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Q from "../src/queries.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = Database.open(path.join(root, "data/receipts.rl"));
const conn = db.connect();
const run = (cypher, params) => conn.query(cypher, params).rows;

const rule = (title) => console.log(`\n${title}\n${"─".repeat(title.length)}`);

rule("Corpus");
const counts = conn.query(`
  MATCH (n)
  WITH count(n) AS nodes
  MATCH ()-[r]->()
  RETURN nodes, count(r) AS relationships
`).rows[0];
console.log(`${counts.nodes} nodes · ${counts.relationships} relationships`);

rule("Ask: “authentication”");
console.log(run(Q.SEARCH_TOPICS, { q: "authentication" }));

rule("Receipt: auth-provider");
const auth = run(Q.TOPIC_CURRENT, { slug: "auth-provider" })[0];
console.log(auth.statement, `— approved by ${auth.approved_by}, ${auth.valid_from}`);
console.log("Evidence:", run(Q.DECISION_EVIDENCE, { id: auth.decision_id }).map((e) => e.title));

rule("Time travel: 1 Sep 2025");
console.log(run(Q.TIME_TRAVEL, { slug: "auth-provider", asOf: "2025-09-01" }));

rule("Time travel: 1 May 2026");
console.log(run(Q.TIME_TRAVEL, { slug: "auth-provider", asOf: "2026-05-01" }));

rule("Audit: current decisions resting on retracted evidence");
console.log(run(Q.AUDIT_RETRACTED));

rule("Audit: current decisions with no evidence");
console.log(run(Q.MISSING_EVIDENCE));

rule("Audit: docs that contradict today");
console.log(run(Q.STALE_NOTES).map((n) => `${n.note} → “${n.note_says}” (now “${n.current_truth}”)`));

rule("Supersession chains");
for (const chain of run(Q.SUPERSESSION_CHAINS)) {
  console.log(chain.chain.join("  ←  "));
}

if (typeof db.close === "function") db.close();
