# Devpost submission copy — Receipts

**Contest:** Relate by Neo4j Hackathon — "Context, connected"
**URL to submit:** https://relate.devpost.com
**Team:** Individual — Ahmed Irfan

## Title

Receipts — every answer has a receipt

## Tagline

Decision memory with provenance, supersession and time travel, built on a single Relate graph.

## Short description

Most tools can find the document that says "use Auth0". They cannot tell you that the decision was superseded by Okta, that the runbook everyone still reads is now wrong, that a current decision rests on a memo that was retracted, or that another was approved with no evidence at all. Receipts answers "what did we decide, is it still true, why, and who signed it?" by traversing one connected Relate graph. A zero-setup browser demo runs entirely on Relate WebAssembly; the same 89-node graph is committed as a single-file `.rl` store for inspection.

## What connects to what

- `(Decision)-[:ABOUT]->(Topic)` — which question a decision answers
- `(Decision)-[:SUPERSEDES]->(Decision)` — chains of what was true before
- `(Decision)-[:BASED_ON]->(Evidence)` — the receipts under an answer
- `(Evidence)-[:FROM]->(Source)` — provenance
- `(Evidence)-[:CONTRADICTS]->(Evidence)` — conflicting material
- `(Person)-[:APPROVED]->(Decision)` — who signed it
- `(Person)-[:OWNS]->(Topic)` — who is accountable
- `(Note)-[:RECORDS]->(Decision)` — what a document claims
- `(Note)-[:MENTIONS]->(Topic)` — what a document talks about

Supersession chains, time travel, withdrawn-evidence detection and stale-document detection are all graph traversals (variable-length paths and `EXISTS` subqueries), not row filters.

## Links

- Code: https://github.com/iahmedak/receipts
- Live demo: https://iahmedak.github.io/receipts/
- 1:55 narrated demo video: https://github.com/iahmedak/receipts/blob/main/docs/demo.mp4
- Persistent store: https://github.com/iahmedak/receipts/blob/main/data/receipts.rl

## How Relate is used

- **Mode:** single file (`data/receipts.rl`) for the CLI/Node path, in-memory WebAssembly for the browser.
- **Why:** judges can inspect and query the committed store; the browser needs no server or signup.
- **Capabilities:** Cypher with `OPTIONAL MATCH`, `CASE`, `EXISTS {}`, `UNWIND`, variable-length paths, constraints/indexes, JSON parameters and JSON envelopes; native Node library, CLI and WASM build all run the same 20 queries.

## Tools used

- Third-party: Relate 1.3.0, Vite 8, vanilla JS/CSS/SVG, GitHub Actions, GitHub CLI.
- AI: built with the OpenCode coding agent (DeepSeek V4.1 Flash Free); Relate's agent skill was used as API reference. No AI runs at runtime — every answer is a Cypher query.

## Notes for submission form

- Explain that the work is new, started after Nov 11, 2026.
- Eligibility: individual, not a Neo4j employee.
- Video is a narrated presentation built from actual app screenshots (a screen-share equivalent).
