// Small deterministic force layout. No physics library, no random seed drift:
// the same graph always lands in the same place, which keeps screenshots and
// the demo video stable.

const TYPE = {
  Decision: { r: 36, ring: 0.14, rest: 118 },
  Topic: { r: 28, ring: 0.32, rest: 108 },
  Person: { r: 24, ring: 0.44, rest: 96 },
  Evidence: { r: 13, ring: 0.56, rest: 82 },
  Note: { r: 11, ring: 0.64, rest: 86 },
  Source: { r: 8, ring: 0.74, rest: 66 },
};

const COMPACT = 0.5;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function layoutGraph(
  nodes,
  rels,
  {
    width,
    height,
    iterations = 420,
    focusKey = null,
    compact = false,
    labelPad = 0,
    bands = false,
  } = {},
) {
  const rand = mulberry32(0x5eed2026);
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const radiusScale = compact ? COMPACT : 1;

  const groups = new Map();
  for (const node of nodes) {
    const label = node.labels?.[0] ?? "Node";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(node);
  }

  const positions = new Map();
  for (const [label, list] of groups) {
    const config = TYPE[label] ?? { r: 10, ring: 0.62 };
    const radius = config.ring * minDim;
    const offset = hashString(label) * Math.PI * 2;
    list.forEach((node, index) => {
      const angle = (index / list.length) * Math.PI * 2 + offset;
      const emphasis =
        label === "Decision" && node.properties?.status === "current" ? 4 : 0;
      positions.set(node.key, {
        key: node.key,
        node,
        r: (config.r + emphasis) * radiusScale,
        x: cx + Math.cos(angle) * radius + (rand() - 0.5) * 10,
        y: cy + Math.sin(angle) * radius + (rand() - 0.5) * 10,
      });
    });
  }

  const points = [...positions.values()];
  const k = minDim * 0.58;
  const focus = focusKey ? positions.get(focusKey) : null;

  for (let step = 0; step < iterations; step += 1) {
    const alpha = 1 - step / iterations;

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = rand() - 0.5;
          dy = rand() - 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2) || 1;
        const minGap = a.r + b.r + (compact ? 7 : 16);
        const repel = (k * k * (compact ? 0.07 : 0.055)) / Math.max(d2, 120);
        const collide = d < minGap ? (minGap - d) * 0.8 : 0;
        const force = (repel + collide) * alpha;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * force;
        a.y -= uy * force;
        b.x += ux * force;
        b.y += uy * force;
      }
    }

    for (const rel of rels) {
      const a = positions.get(rel.from);
      const b = positions.get(rel.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const la = a.node.labels?.[0] ?? "Node";
      const lb = b.node.labels?.[0] ?? "Node";
      const rest = (TYPE[la]?.rest ?? 84) + (TYPE[lb]?.rest ?? 84);
      const force = (d - rest * 0.72) * (compact ? 0.008 : 0.011) * alpha;
      const ux = dx / d;
      const uy = dy / d;
      a.x += ux * force;
      a.y += uy * force;
      b.x -= ux * force;
      b.y -= uy * force;
    }

    for (const point of points) {
      point.x += (cx - point.x) * (compact ? 0.012 : 0.008) * alpha;
      point.y += (cy - point.y) * (compact ? 0.012 : 0.008) * alpha;
    }

    if (focus) {
      focus.x += (cx - focus.x) * 0.05 * alpha;
      focus.y += (cy - focus.y) * 0.05 * alpha;
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x - point.r - labelPad);
    minY = Math.min(minY, point.y - point.r - 4);
    maxX = Math.max(maxX, point.x + point.r + labelPad);
    maxY = Math.max(maxY, point.y + point.r + 4);
  }

  const pad = 26;
  const boxWidth = Math.max(maxX - minX, 1);
  const boxHeight = Math.max(maxY - minY, 1);
  const scale = Math.min(
    1.4,
    (width - pad * 2) / boxWidth,
    (height - pad * 2) / boxHeight,
  );

  const out = new Map();
  for (const point of points) {
    out.set(point.key, {
      ...point,
      x: (point.x - (minX + maxX) / 2) * scale + cx,
      y: (point.y - (minY + maxY) / 2) * scale + cy,
      r: point.r * Math.min(scale, 1.15),
    });
  }

  return out;
}
