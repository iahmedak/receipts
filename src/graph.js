import { layoutGraph } from "./layout.js";
import { adjacency, nodeLabel } from "./graph-data.js";

const STYLE = {
  Decision: { fill: "#1f5b45", text: "#f7f3e8", stroke: "#153f30" },
  Topic: { fill: "#c99a3f", text: "#241b05", stroke: "#a2761f" },
  Person: { fill: "#3c5a78", text: "#f2f5f8", stroke: "#2b435c" },
  Evidence: { fill: "#dde5ea", text: "#1d2a33", stroke: "#a3b5c1" },
  Note: { fill: "#efe6d4", text: "#3a3223", stroke: "#c9b995" },
  Source: { fill: "#e7e1d5", text: "#5a5345", stroke: "#c6bda9" },
};

const escapeXml = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );

function truncate(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function labelFor(node) {
  const p = node.properties ?? {};
  const label = nodeLabel(node);
  if (label === "Decision") return p.statement ?? p.id;
  if (label === "Topic") return p.short ?? p.name ?? p.id;
  if (label === "Person") return p.name ?? p.id;
  if (label === "Evidence") return p.title ?? p.id;
  if (label === "Note") return p.title ?? p.id;
  if (label === "Source") return p.title ?? p.id;
  return p.name ?? p.title ?? p.id ?? label;
}

function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if ((current + " " + word).length <= max) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function linesFor(node) {
  const label = nodeLabel(node);
  const text = labelFor(node);
  if (label === "Decision") {
    const lines = wrap(text, 14);
    if (lines.length <= 3) return lines;
    return [...lines.slice(0, 2), truncate(lines.slice(2).join(" "), 14)];
  }
  if (label === "Topic") {
    return wrap(text, 12)
      .slice(0, 2)
      .map((line) => truncate(line, 12));
  }
  if (label === "Person") {
    return wrap(text, 9)
      .slice(0, 2)
      .map((line) => truncate(line, 9));
  }
  return [truncate(text, 16)];
}

export function renderGraph(host, data, options = {}) {
  const width = Math.max(host.clientWidth || 560, 320);
  const height = Math.max(host.clientHeight || 560, 320);
  const { nodes, rels } = data;
  const CORE = ["Decision", "Topic", "Person"];
  const showLabels =
    options.labels === "none"
      ? () => false
      : options.labels === "decision"
        ? (node) => nodeLabel(node) === "Decision"
        : options.labels === "topic"
          ? (node) => nodeLabel(node) === "Topic"
          : options.labels === "core" || options.labels === "key"
          ? (node) => CORE.includes(nodeLabel(node))
          : () => true;
  const positions = layoutGraph(nodes, rels, {
    width,
    height,
    compact: Boolean(options.compact),
    focusKey: options.focusKey ?? null,
  });
  const neighbors = adjacency(rels);

  const edgeMarkup = rels
    .map((rel, index) => {
      const a = positions.get(rel.from);
      const b = positions.get(rel.to);
      if (!a || !b) return "";
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const x1 = a.x + (dx / d) * (a.r + 2);
      const y1 = a.y + (dy / d) * (a.r + 2);
      const x2 = b.x - (dx / d) * (b.r + 7);
      const y2 = b.y - (dy / d) * (b.r + 7);
      return `<line class="gedge" data-key="${escapeXml(rel.key)}" data-from="${escapeXml(rel.from)}" data-to="${escapeXml(rel.to)}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" style="animation-delay:${Math.min(index * 6, 240)}ms" />`;
    })
    .join("");

  const nodeMarkup = nodes
    .map((node, index) => {
      const point = positions.get(node.key);
      if (!point) return "";
      const label = nodeLabel(node);
      const style = STYLE[label] ?? STYLE.Source;
      const p = node.properties ?? {};
      const isPast = label === "Decision" && p.status === "superseded";
      const isProposed = label === "Decision" && p.status === "proposed";
      const fill = isPast ? "#e9e3d6" : isProposed ? "#f1e4c6" : style.fill;
      const textColor = isPast ? "#6a6253" : isProposed ? "#7a5a12" : style.text;
      const stroke = isPast ? "#a89e8c" : isProposed ? "#c99a3f" : style.stroke;
      const classes = ["gnode", `gnode--${label}`];
      if (isPast) classes.push("is-past");
      if (isProposed) classes.push("is-proposed");
      if (label === "Evidence" && p.status === "retracted") classes.push("is-alert");
      if (label === "Note" && options.staleNotes?.has(node.key)) classes.push("is-alert");
      if (options.selectedKey === node.key) classes.push("is-selected");

      const lines = showLabels(node) ? linesFor(node) : [];
      const lineHeight = 10.5;
      const startY = lines.length > 1 ? -((lines.length - 1) * lineHeight) / 2 : 0;
      const text = lines
        .map(
          (line, lineIndex) =>
            `<tspan x="0" y="${(startY + lineIndex * lineHeight).toFixed(1)}">${escapeXml(line)}</tspan>`,
        )
        .join("");

      return `<g class="gnode-pos" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})">
        <g class="${classes.join(" ")}" data-key="${escapeXml(node.key)}" data-label="${escapeXml(label)}" tabindex="0" role="button" aria-label="${escapeXml(labelFor(node))}" style="animation-delay:${Math.min(index * 12, 300)}ms">
          <circle r="${point.r}" fill="${fill}" stroke="${stroke}" />
          ${lines.length ? `<text text-anchor="middle" dominant-baseline="middle" fill="${textColor}" font-size="${label === "Decision" || label === "Topic" ? 8.6 : 8.2}" font-weight="${label === "Decision" || label === "Topic" ? 600 : 500}">${text}</text>` : ""}
        </g>
      </g>`;
    })
    .join("");

  host.innerHTML = `<svg class="graph-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Graph of decisions, evidence, sources, people and notes">
    <defs>
      <marker id="g-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
      </marker>
    </defs>
    <g class="edges">${edgeMarkup}</g>
    <g class="nodes">${nodeMarkup}</g>
  </svg>`;

  const svg = host.querySelector("svg");
  const nodeEls = [...svg.querySelectorAll(".gnode")];
  const edgeEls = [...svg.querySelectorAll(".gedge")];

  const clear = () => {
    svg.classList.remove("has-hover");
    for (const el of nodeEls) el.classList.remove("is-dim", "is-hot");
    for (const el of edgeEls) el.classList.remove("is-hot", "is-dim");
  };

  const highlight = (key) => {
    const near = neighbors.get(key) ?? new Set();
    svg.classList.add("has-hover");
    for (const el of nodeEls) {
      const own = el.dataset.key;
      el.classList.toggle("is-hot", own === key || near.has(own));
      el.classList.toggle("is-dim", own !== key && !near.has(own));
    }
    for (const el of edgeEls) {
      const hot = el.dataset.from === key || el.dataset.to === key;
      el.classList.toggle("is-hot", hot);
      el.classList.toggle("is-dim", !hot);
    }
  };

  for (const el of nodeEls) {
    const node = nodes.find((n) => n.key === el.dataset.key);
    el.addEventListener("mouseenter", () => {
      highlight(node.key);
      options.onHover?.(node);
    });
    el.addEventListener("mouseleave", () => {
      clear();
      options.onHover?.(null);
    });
    el.addEventListener("focus", () => {
      highlight(node.key);
      options.onHover?.(node);
    });
    el.addEventListener("blur", () => {
      clear();
      options.onHover?.(null);
    });
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onSelect?.(node);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        options.onSelect?.(node);
      }
    });
  }

  svg.addEventListener("click", () => options.onSelect?.(null));
}

export function renderGraphSkeleton(host, message = "Loading graph…") {
  host.innerHTML = `<div class="graph-empty"><span class="pulse-dot"></span>${escapeXml(message)}</div>`;
}
