// The Cypher behind Receipts. Every statement is single-statement so it runs
// unchanged on the CLI, the Node client, and the browser WASM build.

export const SEARCH_TOPICS = `
MATCH (t:Topic)
OPTIONAL MATCH (t)<-[:ABOUT]-(d:Decision)
WHERE d.status = 'current'
WITH t, d
WHERE toLower(t.name) CONTAINS toLower($q)
   OR toLower(t.slug) CONTAINS toLower($q)
   OR toLower(t.description) CONTAINS toLower($q)
   OR toLower(coalesce(d.statement, '')) CONTAINS toLower($q)
RETURN t.slug AS slug,
       t.name AS name,
       t.description AS description,
       d.id AS decision_id,
       d.statement AS statement,
       d.valid_from AS valid_from
ORDER BY name
LIMIT 6
`;

export const SEARCH_NOTES = `
MATCH (n:Note)
WHERE toLower(n.title) CONTAINS toLower($q)
   OR toLower(n.body) CONTAINS toLower($q)
OPTIONAL MATCH (n)-[:RECORDS]->(old:Decision)
OPTIONAL MATCH (old)-[:ABOUT]->(t:Topic)
OPTIONAL MATCH (cur:Decision)-[:ABOUT]->(t)
WHERE cur.status = 'current'
RETURN n.id AS note_id,
       n.title AS note_title,
       n.created_at AS note_date,
       coalesce(n.canonical, false) AS canonical,
       t.slug AS topic_slug,
       t.name AS topic_name,
       old.id AS recorded_id,
       old.statement AS recorded_statement,
       cur.id AS current_id,
       cur.statement AS current_statement,
       CASE
         WHEN old IS NULL THEN 'unlinked'
         WHEN old.id = cur.id THEN 'current'
         WHEN old.status = 'proposed' THEN 'proposed'
         ELSE 'stale'
       END AS freshness
ORDER BY freshness DESC, note_date DESC
LIMIT 8
`;

export const TOPIC_CURRENT = `
MATCH (t:Topic {slug: $slug})<-[:ABOUT]-(d:Decision)
WHERE d.status = 'current'
OPTIONAL MATCH (p:Person)-[:APPROVED]->(d)
OPTIONAL MATCH (owner:Person)-[:OWNS]->(t)
RETURN t.id AS topic_id,
       t.name AS topic_name,
       t.description AS topic_description,
       t.slug AS topic_slug,
       d.id AS decision_id,
       d.statement AS statement,
       d.valid_from AS valid_from,
       d.confidence AS confidence,
       p.name AS approved_by,
       p.role AS approved_role,
       owner.name AS owner
ORDER BY d.valid_from DESC
LIMIT 1
`;

export const TIME_TRAVEL = `
MATCH (t:Topic {slug: $slug})<-[:ABOUT]-(d:Decision)
WHERE d.valid_from IS NOT NULL
  AND d.valid_from <= $asOf
  AND (d.valid_to IS NULL OR d.valid_to > $asOf)
OPTIONAL MATCH (p:Person)-[:APPROVED]->(d)
OPTIONAL MATCH (owner:Person)-[:OWNS]->(t)
RETURN t.id AS topic_id,
       t.name AS topic_name,
       t.description AS topic_description,
       t.slug AS topic_slug,
       d.id AS decision_id,
       d.statement AS statement,
       d.valid_from AS valid_from,
       d.valid_to AS valid_to,
       d.confidence AS confidence,
       p.name AS approved_by,
       p.role AS approved_role,
       owner.name AS owner
ORDER BY d.valid_from DESC
LIMIT 1
`;

export const TOPIC_HISTORY = `
MATCH (t:Topic {slug: $slug})<-[:ABOUT]-(d:Decision)
WHERE d.status = 'current'
MATCH p = (d)-[:SUPERSEDES*1..5]->(old:Decision)
RETURN old.id AS decision_id,
       old.statement AS statement,
       old.valid_from AS valid_from,
       old.valid_to AS valid_to,
       old.confidence AS confidence,
       length(p) AS hops
ORDER BY old.valid_from ASC
`;

export const DECISION_EVIDENCE = `
MATCH (d:Decision {id: $id})-[:BASED_ON]->(e:Evidence)
OPTIONAL MATCH (e)-[:FROM]->(s:Source)
RETURN e.id AS evidence_id,
       e.title AS title,
       e.kind AS kind,
       e.published_at AS published_at,
       e.strength AS strength,
       e.status AS status,
       e.retracted_at AS retracted_at,
       e.reason AS reason,
       s.title AS source
ORDER BY e.published_at DESC
`;

export const TOPIC_NOTES = `
MATCH (t:Topic {slug: $slug})<-[:MENTIONS]-(n:Note)
OPTIONAL MATCH (n)-[:RECORDS]->(old:Decision)
OPTIONAL MATCH (cur:Decision)-[:ABOUT]->(t)
WHERE cur.status = 'current'
RETURN n.id AS note_id,
       n.title AS note_title,
       n.body AS note_body,
       n.created_at AS note_date,
       coalesce(n.canonical, false) AS canonical,
       old.id AS recorded_id,
       old.statement AS recorded_statement,
       cur.id AS current_id,
       cur.statement AS current_statement,
       CASE
         WHEN old IS NULL THEN 'unlinked'
         WHEN old.id = cur.id THEN 'current'
         WHEN old.status = 'proposed' THEN 'proposed'
         ELSE 'stale'
       END AS freshness
ORDER BY freshness DESC, note_date DESC
`;

export const DECISION_NOTES = `
MATCH (n:Note)-[:RECORDS]->(d:Decision {id: $id})
RETURN n.id AS note_id,
       n.title AS note_title,
       n.body AS note_body,
       n.created_at AS note_date,
       coalesce(n.canonical, false) AS canonical
ORDER BY note_date DESC
`;

export const TOPIC_PROPOSED = `
MATCH (t:Topic {slug: $slug})<-[:ABOUT]-(d:Decision)
WHERE d.status = 'proposed'
OPTIONAL MATCH (d)-[:BASED_ON]->(e:Evidence)
RETURN d.id AS decision_id,
       d.statement AS statement,
       d.recorded_at AS recorded_at,
       d.confidence AS confidence,
       collect(e.title) AS evidence
`;

export const AUDIT_RETRACTED = `
MATCH (d:Decision)-[:BASED_ON]->(e:Evidence)
WHERE d.status = 'current' AND e.status = 'retracted'
OPTIONAL MATCH (e)-[:FROM]->(s:Source)
OPTIONAL MATCH (d)-[:ABOUT]->(t:Topic)
RETURN d.id AS decision_id,
       d.statement AS decision,
       e.id AS evidence_id,
       e.title AS evidence,
       e.retracted_at AS retracted_at,
       e.reason AS reason,
       s.title AS source,
       t.slug AS topic_slug,
       t.name AS topic
ORDER BY e.retracted_at DESC
`;

export const MISSING_EVIDENCE = `
MATCH (d:Decision)
WHERE d.status = 'current'
  AND NOT EXISTS { (d)-[:BASED_ON]->(:Evidence) }
OPTIONAL MATCH (d)-[:ABOUT]->(t:Topic)
RETURN d.id AS decision_id,
       d.statement AS decision,
       d.valid_from AS valid_from,
       t.slug AS topic_slug,
       t.name AS topic
ORDER BY d.valid_from DESC
`;

export const STALE_NOTES = `
MATCH (n:Note)-[:RECORDS]->(old:Decision)
MATCH (current:Decision)-[:SUPERSEDES*1..5]->(old)
WHERE current.status = 'current'
OPTIONAL MATCH (n)-[:MENTIONS]->(t:Topic)
RETURN n.id AS note_id,
       n.title AS note,
       old.statement AS note_says,
       current.statement AS current_truth,
       t.slug AS topic_slug,
       t.name AS topic,
       old.valid_to AS replaced_on
ORDER BY replaced_on DESC
`;

export const SUPERSESSION_CHAINS = `
MATCH p = (current:Decision)-[:SUPERSEDES*1..5]->(old:Decision)
WHERE current.status = 'current'
RETURN current.id AS current_id,
       current.statement AS current_statement,
       [d IN nodes(p) | d.statement] AS chain,
       length(p) AS hops
ORDER BY hops DESC, current_statement
`;

export const GRAPH_NEIGHBORHOOD = `
MATCH p = (d:Decision {id: $id})-[:SUPERSEDES|ABOUT|BASED_ON|APPROVED|RECORDS|MENTIONS|FROM*1..2]-(n)
RETURN p
LIMIT 60
`;

export const GRAPH_MAP = `
MATCH (t:Topic)<-[about:ABOUT]-(d:Decision)
WHERE d.status = 'current'
OPTIONAL MATCH (owner:Person)-[owns:OWNS]->(t)
RETURN t, about, d, owns, owner
`;

export const GRAPH_ALL = `
MATCH (n)
OPTIONAL MATCH (n)-[r]->(m)
RETURN n, r, m
LIMIT 400
`;

export const TOPIC_LIST = `
MATCH (t:Topic)
OPTIONAL MATCH (t)<-[:ABOUT]-(d:Decision)
WHERE d.status = 'current'
RETURN t.id AS id,
       t.slug AS slug,
       t.name AS name,
       t.description AS description,
       d.statement AS current_statement,
       d.valid_from AS current_since
ORDER BY t.name
`;

export const COUNTS = `MATCH (n) RETURN count(n) AS nodes`;

export const REL_COUNTS = `
MATCH ()-[r]->() RETURN count(r) AS relationships
`;

export const LABEL_COUNTS = `
MATCH (n)
UNWIND labels(n) AS label
RETURN label, count(*) AS n
ORDER BY n DESC, label
`;

export const SUGGESTED_QUESTIONS = [
  {
    q: "authentication",
    label: "What authentication provider do we use?",
    slug: "auth-provider",
  },
  {
    q: "retention",
    label: "How long do we keep customer logs?",
    slug: "data-retention",
  },
  {
    q: "deployment",
    label: "Where does production run?",
    slug: "deployment-platform",
  },
  {
    q: "vector",
    label: "How is vector search implemented?",
    slug: "vector-search",
  },
  {
    q: "pricing",
    label: "How do we charge customers?",
    slug: "pricing-model",
  },
];
