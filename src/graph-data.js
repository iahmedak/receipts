// WASM returns entities inline (nodes, relationships, and path arrays). Collect
// them into a deduped graph. Handles both the WASM shape (`start_node`) and the
// native Node client shape (`startId` / `startElementId`).
export function collectGraph(rows) {
  const nodes = new Map();
  const rels = new Map();

  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;

    if (value.kind === "node") {
      const key = value.elementId ?? `n:${value.id}`;
      if (!nodes.has(key)) nodes.set(key, { ...value, key });
      return;
    }

    if (value.kind === "relationship") {
      const key = value.elementId ?? `r:${value.id}`;
      if (!rels.has(key)) {
        rels.set(key, {
          ...value,
          key,
          from:
            value.startElementId ?? `n:${value.start_node ?? value.startId}`,
          to: value.endElementId ?? `n:${value.end_node ?? value.endId}`,
        });
      }
    }
  };

  for (const row of rows) {
    for (const value of Object.values(row)) visit(value);
  }

  return { nodes: [...nodes.values()], rels: [...rels.values()] };
}

export function nodeLabel(node) {
  return node.labels?.[0] ?? "Node";
}

export function nodeName(node) {
  const p = node.properties ?? {};
  return p.name ?? p.title ?? p.statement ?? p.id ?? node.key;
}

export function adjacency(rels) {
  const map = new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const rel of rels) {
    add(rel.from, rel.to);
    add(rel.to, rel.from);
  }
  return map;
}
