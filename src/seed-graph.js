// One graph definition, two runtimes: the Node build script writes it into a
// persistent `.rl` store, and the browser rebuilds the same graph in WASM.
// `run(cypher, params)` is the only surface-specific piece.

export const SCHEMA = [
  "CREATE CONSTRAINT person_id FOR (n:Person) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT topic_id FOR (n:Topic) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT source_id FOR (n:Source) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT evidence_id FOR (n:Evidence) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT decision_id FOR (n:Decision) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT note_id FOR (n:Note) REQUIRE n.id IS UNIQUE",
  "CREATE INDEX topic_slug FOR (t:Topic) ON (t.slug)",
  "CREATE INDEX decision_status FOR (d:Decision) ON (d.status)",
  "CREATE INDEX note_canonical FOR (n:Note) ON (n.canonical)",
];

export function seedGraph(run, seed) {
  for (const statement of SCHEMA) run(statement);

  const insert = (label, rows) => {
    if (!rows.length) return;
    run(`UNWIND $rows AS row CREATE (n:${label}) SET n = row`, { rows });
  };

  const relate = (type, fromLabel, toLabel, rows) => {
    if (!rows.length) return;
    run(
      `UNWIND $rows AS row
       MATCH (a:${fromLabel} {id: row.from})
       MATCH (b:${toLabel} {id: row.to})
       CREATE (a)-[:${type}]->(b)`,
      { rows },
    );
  };

  insert(
    "Person",
    seed.people,
  );
  insert(
    "Topic",
    seed.topics.map(({ owner, ...rest }) => rest),
  );
  insert("Source", seed.sources);
  insert(
    "Evidence",
    seed.evidence.map(({ source, contradicts, ...rest }) => rest),
  );
  insert(
    "Decision",
    seed.decisions.map(
      ({ topic, approved_by, supersedes, evidence, ...rest }) => rest,
    ),
  );
  insert(
    "Note",
    seed.notes.map(({ mentions, records, ...rest }) => rest),
  );

  relate(
    "SUPERSEDES",
    "Decision",
    "Decision",
    seed.decisions
      .filter((d) => d.supersedes)
      .map((d) => ({ from: d.id, to: d.supersedes })),
  );
  relate(
    "ABOUT",
    "Decision",
    "Topic",
    seed.decisions.map((d) => ({ from: d.id, to: d.topic })),
  );
  relate(
    "BASED_ON",
    "Decision",
    "Evidence",
    seed.decisions.flatMap((d) =>
      d.evidence.map((e) => ({ from: d.id, to: e })),
    ),
  );
  relate(
    "FROM",
    "Evidence",
    "Source",
    seed.evidence.map((e) => ({ from: e.id, to: e.source })),
  );
  relate(
    "APPROVED",
    "Person",
    "Decision",
    seed.decisions
      .filter((d) => d.approved_by)
      .map((d) => ({ from: d.approved_by, to: d.id })),
  );
  relate(
    "OWNS",
    "Person",
    "Topic",
    seed.topics.map((t) => ({ from: t.owner, to: t.id })),
  );
  relate(
    "RECORDS",
    "Note",
    "Decision",
    seed.notes
      .filter((n) => n.records)
      .map((n) => ({ from: n.id, to: n.records })),
  );
  relate(
    "MENTIONS",
    "Note",
    "Topic",
    seed.notes.flatMap((n) => n.mentions.map((t) => ({ from: n.id, to: t }))),
  );
  relate(
    "CONTRADICTS",
    "Evidence",
    "Evidence",
    seed.evidence
      .filter((e) => e.contradicts)
      .map((e) => ({ from: e.id, to: e.contradicts })),
  );
}
