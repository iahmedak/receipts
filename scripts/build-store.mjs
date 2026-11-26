import { Database } from "@relate/relate";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedGraph } from "../src/seed-graph.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(
  fs.readFileSync(path.join(root, "data/seed.json"), "utf8"),
);
const storePath = path.join(root, "data/receipts.rl");

if (fs.existsSync(storePath)) fs.rmSync(storePath);

const db = Database.open(storePath);
const conn = db.connect();

seedGraph((cypher, params) => conn.query(cypher, params), seed);

const counts = conn.query(`
  MATCH (n)
  WITH count(n) AS nodes
  MATCH ()-[r]->()
  RETURN nodes, count(r) AS relationships
`).rows[0];

console.log(`Built ${storePath}`);
console.log(`  ${counts.nodes} nodes, ${counts.relationships} relationships`);
console.log("  labels: Person, Topic, Source, Evidence, Decision, Note");
console.log("  edges:  SUPERSEDES, ABOUT, BASED_ON, FROM, APPROVED, OWNS,");
console.log("          RECORDS, MENTIONS, CONTRADICTS");

if (typeof db.close === "function") db.close();
