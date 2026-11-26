import "./styles.css";
import { createDb } from "./db.js";
import * as Q from "./queries.js";
import { collectGraph, nodeLabel, nodeName } from "./graph-data.js";
import { renderGraph, renderGraphSkeleton } from "./graph.js";

const $ = (selector, root = document) => root.querySelector(selector);
const DAY = 86400000;

const state = {
  run: null,
  view: "ask",
  slug: null,
  asOf: null,
  receipt: null,
  graphData: null,
  graphMode: "corpus",
  graphCaption: "Click a node to inspect it.",
  selectedKey: null,
  staleKeys: new Set(),
  stats: { nodes: 0, rels: 0, decisions: 0, findings: 0 },
};

const els = {
  workspace: $("#workspace"),
  graph: $("#graph"),
  graphKicker: $("#graph-kicker"),
  graphTitle: $("#graph-title"),
  graphMeta: $("#graph-meta"),
  graphCaption: $("#graph-caption"),
  graphDetail: $("#graph-detail"),
  corpusStats: $("#corpus-stats"),
  auditCount: $("#audit-count"),
  boot: $("#boot"),
  bootMessage: $("#boot-message"),
};

// ---------------------------------------------------------------- utilities

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

const fmtDate = (iso) => {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const fmtMonth = (iso) => {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const toDay = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const fromDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);
const addDays = (iso, days) => fromDay(toDay(iso) + days);

const q = (cypher, params) => state.run(cypher, params);
const one = (cypher, params) => q(cypher, params)[0] ?? null;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function confidenceMarkup(value) {
  const pct = Math.round((Number(value) || 0) * 100);
  return `<span class="confidence"><span class="confidence-bar"><span style="width:${pct}%"></span></span><span class="confidence-value">${pct}%</span></span>`;
}

function strengthMarkup(value) {
  const filled = Math.round((Number(value) || 0) * 5);
  return `<span class="strength" aria-label="Strength ${Math.round((Number(value) || 0) * 100)} percent">
    ${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= filled ? "is-on" : ""}"></i>`).join("")}
  </span>`;
}

function tag(label, tone = "") {
  return `<span class="tag ${tone ? `tag--${tone}` : ""}">${escapeHtml(label)}</span>`;
}

// -------------------------------------------------------------------- boot

async function boot() {
  try {
    const { run } = await createDb({
      onProgress: (message) => {
        if (els.bootMessage) els.bootMessage.textContent = message;
      },
    });
    state.run = run;

    const counts = one(Q.COUNTS);
    const relCounts = one(Q.REL_COUNTS);
    const decisions = one("MATCH (d:Decision) RETURN count(d) AS n").n;
    const retracted = q(Q.AUDIT_RETRACTED).length;
    const missing = q(Q.MISSING_EVIDENCE).length;
    const stale = q(Q.STALE_NOTES).length;

    state.stats = {
      nodes: counts.nodes,
      rels: relCounts.relationships,
      decisions,
      findings: retracted + missing + stale,
    };

    els.corpusStats.textContent = `${state.stats.nodes} nodes · ${state.stats.rels} edges · ${state.stats.decisions} decisions`;
    els.auditCount.textContent = String(state.stats.findings);

    bindShell();
    renderHome();
    els.boot.classList.add("is-done");
    window.setTimeout(() => els.boot.remove(), 500);
  } catch (error) {
    console.error(error);
    if (els.bootMessage) {
      els.bootMessage.textContent = `Could not open the graph: ${error.message}`;
    }
  }
}

// -------------------------------------------------------------------- home

function renderHome() {
  state.view = "ask";
  state.slug = null;
  state.asOf = null;
  state.receipt = null;
  state.selectedKey = null;
  setActiveTab("ask");

  els.workspace.innerHTML = `
    <section class="hero">
      <p class="kicker">Context, connected</p>
      <h1>Every answer<br />has a receipt.</h1>
      <p class="lede">Ask what your company decided. Get today's answer, the evidence under it, who approved it — and what it replaced.</p>

      <form class="ask-form" id="ask-form" role="search">
        <label class="sr-only" for="ask-input">Ask a question about a decision</label>
        <input id="ask-input" name="q" autocomplete="off" spellcheck="false"
          placeholder="What authentication provider do we use?" />
        <button type="submit" aria-label="Ask">→</button>
      </form>

      <div class="suggestions">
        <p class="suggestions-label">Start with a real question</p>
        ${Q.SUGGESTED_QUESTIONS.map(
          (item, index) => `
          <button class="suggestion" data-slug="${item.slug}">
            <span class="suggestion-index">${String(index + 1).padStart(2, "0")}</span>
            <span class="suggestion-text">${escapeHtml(item.label)}</span>
            <span class="suggestion-arrow">↗</span>
          </button>`,
        ).join("")}
      </div>

      <div class="hero-stats">
        <span><strong>${state.stats.nodes}</strong> nodes</span>
        <span><strong>${state.stats.rels}</strong> relationships</span>
        <span><strong>${state.stats.decisions}</strong> decisions</span>
        <span class="hero-stats-warn"><strong>${state.stats.findings}</strong> audit findings</span>
      </div>
    </section>`;

  $("#ask-form").addEventListener("submit", (event) => {
    event.preventDefault();
    handleAsk($("#ask-input").value);
  });
  for (const button of els.workspace.querySelectorAll(".suggestion")) {
    button.addEventListener("click", () => openReceipt(button.dataset.slug));
  }

  loadMapGraph();
  els.graphDetail.innerHTML = `<p class="graph-hint">Every node is a real record. Hover to trace its neighbors; click to inspect.</p>`;
}

function handleAsk(text) {
  const query = text.trim();
  if (!query) return;

  const topics = q(Q.SEARCH_TOPICS, { q: query });
  if (topics.length) {
    openReceipt(topics[0].slug);
    return;
  }

  const notes = q(Q.SEARCH_NOTES, { q: query });
  if (notes.length) {
    renderNoteResults(query, notes);
    return;
  }

  renderNoResults(query);
}

function renderNoteResults(query, notes) {
  state.view = "ask";
  state.slug = null;
  state.asOf = null;
  setActiveTab("ask");

  els.workspace.innerHTML = `
    <section class="results">
      <button class="back" data-home>← All questions</button>
      <p class="kicker">Search results</p>
      <h1 class="results-title">“${escapeHtml(query)}”</h1>
      <p class="lede">No decision matched, but ${plural(notes.length, "note")} did. A note is not a receipt — check what it records.</p>
      <div class="note-list">
        ${notes
          .map(
            (note) => `
          <button class="note-row ${note.freshness === "stale" ? "is-stale" : ""}" ${note.topic_slug ? `data-slug="${note.topic_slug}"` : "disabled"}>
            <span class="note-row-top">
              <span class="note-row-date">${fmtDate(note.note_date)}</span>
              ${note.freshness === "stale" ? tag("STALE", "alert") : note.freshness === "proposed" ? tag("PROPOSED", "past") : note.freshness === "current" ? tag("CURRENT", "ok") : tag("UNLINKED")}
            </span>
            <strong>${escapeHtml(note.note_title)}</strong>
            <span class="note-row-detail">${
              note.freshness === "stale"
                ? `Says “${escapeHtml(note.recorded_statement)}” · now “${escapeHtml(note.current_statement)}”`
                : note.freshness === "current"
                  ? escapeHtml(note.current_statement)
                  : note.freshness === "proposed"
                    ? `Proposed, not yet in force: “${escapeHtml(note.recorded_statement)}”`
                    : "Not linked to a decision"
            }</span>
          </button>`,
          )
          .join("")}
      </div>
    </section>`;

  bindHomeLinks();
  loadMapGraph();
}

function renderNoResults(query) {
  state.view = "ask";
  state.slug = null;
  setActiveTab("ask");

  els.workspace.innerHTML = `
    <section class="results">
      <button class="back" data-home>← All questions</button>
      <p class="kicker">No receipt</p>
      <h1 class="results-title">Nothing on record for “${escapeHtml(query)}”.</h1>
      <p class="lede">The corpus holds 12 decision topics. Try one of these.</p>
      <div class="suggestions">
        ${Q.SUGGESTED_QUESTIONS.map(
          (item) => `<button class="suggestion" data-slug="${item.slug}"><span class="suggestion-index">→</span><span class="suggestion-text">${escapeHtml(item.label)}</span><span class="suggestion-arrow">↗</span></button>`,
        ).join("")}
      </div>
    </section>`;

  bindHomeLinks();
}

// ----------------------------------------------------------------- receipt

function openReceipt(slug, asOf = null) {
  const current = one(Q.TOPIC_CURRENT, { slug });
  if (!current) {
    renderNoResults(slug);
    return;
  }

  const history = q(Q.TOPIC_HISTORY, { slug });
  const proposed = q(Q.TOPIC_PROPOSED, { slug });
  const notes = q(Q.TOPIC_NOTES, { slug });

  const starts = [
    ...history.map((item) => item.valid_from),
    current.valid_from,
  ]
    .filter(Boolean)
    .sort();
  const minDate = addDays(starts[0] ?? "2025-01-01", -45);
  const maxDate = todayISO();

  state.view = "ask";
  state.slug = slug;
  state.asOf = asOf;
  state.selectedKey = null;
  state.receipt = { current, history, proposed, notes, minDate, maxDate };
  setActiveTab("ask");

  const active = asOf
    ? one(Q.TIME_TRAVEL, { slug, asOf }) ?? null
    : current;
  const evidence = active
    ? q(Q.DECISION_EVIDENCE, { id: active.decision_id })
    : [];

  els.workspace.innerHTML = `
    <article class="receipt">
      <div class="receipt-top">
        <button class="back" data-home>← All questions</button>
        <span class="receipt-id">Receipt / ${escapeHtml(slug)}</span>
      </div>
      <div id="answer-slot">${answerMarkup(active, evidence, current, asOf)}</div>
      ${timeControlMarkup(state.receipt, asOf)}
      <div id="receipt-rest">${restMarkup(active, evidence, state.receipt, asOf)}</div>
    </article>`;

  bindReceipt();
  loadNeighborhood(active?.decision_id ?? current.decision_id, asOf);
}

function answerMarkup(active, evidence, current, asOf) {
  if (!active) {
    return `<section class="answer answer--empty">
      <p class="kicker">No decision on record</p>
      <h1 class="answer-statement">Nothing had been decided yet.</h1>
      <p class="lede">This topic has no decision in force on ${fmtDate(asOf)}.</p>
    </section>`;
  }

  const isPast = Boolean(asOf) && active.decision_id !== current.decision_id;
  const retracted = evidence.filter((item) => item.status === "retracted");
  const unsupported = evidence.length === 0;
  const approved = active.approved_by
    ? `${escapeHtml(active.approved_by)}${active.approved_role ? `, ${escapeHtml(active.approved_role)}` : ""}`
    : "Not recorded";

  return `<section class="answer ${isPast ? "answer--past" : ""}">
    <div class="answer-top">
      <p class="kicker">${isPast ? `In force on ${fmtDate(asOf)}` : `Current decision · ${escapeHtml(active.topic_name)}`}</p>
      ${isPast ? tag("VIEWING HISTORY", "past") : unsupported ? tag("NO EVIDENCE", "alert") : retracted.length ? tag("EVIDENCE WITHDRAWN", "alert") : tag("VERIFIED", "ok")}
    </div>
    <h1 class="answer-statement">${escapeHtml(active.statement)}</h1>
    <p class="answer-description">${escapeHtml(active.topic_description ?? "")}</p>

    ${
      isPast
        ? `<div class="past-banner"><strong>This is the past.</strong> Today's answer is “${escapeHtml(current.statement)}”. <button class="link" data-today>Back to today</button></div>`
        : ""
    }

    ${
      retracted.length
        ? `<div class="answer-alert">
            <span class="alert-mark">!</span>
            <div><strong>This decision still rests on withdrawn evidence.</strong>
            ${retracted.map((item) => `“${escapeHtml(item.title)}” was retracted on ${fmtDate(item.retracted_at)}.`).join(" ")}
            <button class="link" data-audit>See the audit →</button></div>
          </div>`
        : ""
    }

    ${
      unsupported
        ? `<div class="answer-alert">
            <span class="alert-mark">!</span>
            <div><strong>No evidence is linked to this decision.</strong> It is current, approved and completely unsupported.</div>
          </div>`
        : ""
    }

    <dl class="answer-meta">
      <div><dt>Approved by</dt><dd>${approved}</dd></div>
      <div><dt>In force since</dt><dd>${fmtDate(active.valid_from)}</dd></div>
      <div><dt>Confidence</dt><dd>${confidenceMarkup(active.confidence)}</dd></div>
      <div><dt>Owner</dt><dd>${escapeHtml(active.owner ?? "—")}</dd></div>
    </dl>
  </section>`;
}

function timeControlMarkup(receipt, asOf) {
  const { minDate, maxDate } = receipt;
  const min = toDay(minDate);
  const max = toDay(maxDate);
  const value = asOf ? toDay(asOf) : max;
  const ticks = [...receipt.history.map((item) => item.valid_from), receipt.current.valid_from]
    .filter(Boolean)
    .sort()
    .map((date) => {
      const pct = ((toDay(date) - min) / Math.max(max - min, 1)) * 100;
      return `<span class="time-tick" style="left:${Math.min(96, Math.max(4, pct)).toFixed(1)}%">${fmtMonth(date)}</span>`;
    })
    .join("");

  return `<div class="time-control">
    <div class="time-head">
      <span class="time-label">Time travel</span>
      <span class="time-value" id="time-value">${asOf ? fmtDate(asOf) : "Today"}</span>
    </div>
    <input type="range" id="time-slider" min="${min}" max="${max}" value="${value}" step="1" aria-label="View the decision history as of a date" />
    <div class="time-ticks">${ticks}</div>
    <div class="time-foot">
      <span>Scrub to see what was true then.</span>
      <button class="link" id="time-reset" ${asOf ? "" : "hidden"}>Back to today</button>
    </div>
  </div>`;
}

function restMarkup(active, evidence, receipt, asOf) {
  const { current, history, proposed, notes } = receipt;
  const staleNotes = notes.filter((note) => note.freshness === "stale");
  const activeId = active?.decision_id ?? current.decision_id;

  return `
    ${evidenceMarkup(evidence)}
    ${timelineMarkup(current, history, activeId)}
    ${!asOf ? notesMarkup(notes, staleNotes) : ""}
    ${!asOf ? proposedMarkup(proposed) : ""}
  `;
}

function evidenceMarkup(evidence) {
  return `<section class="section">
    <header class="section-head">
      <h2>Why this answer</h2>
      <span class="section-count">${plural(evidence.length, "receipt")}</span>
    </header>
    ${
      evidence.length
        ? `<div class="evidence-grid">${evidence.map(evidenceCard).join("")}</div>`
        : `<div class="empty-state"><strong>No receipts attached.</strong><span>This decision has no evidence node in the graph.</span></div>`
    }
  </section>`;
}

function evidenceCard(item) {
  const retracted = item.status === "retracted";
  return `<article class="evidence ${retracted ? "is-retracted" : ""}">
    <div class="evidence-top">
      <span class="kind">${escapeHtml(item.kind ?? "evidence")}</span>
      <span class="date">${fmtDate(item.published_at)}</span>
    </div>
    <h3>${escapeHtml(item.title)}</h3>
    <p class="evidence-source">${escapeHtml(item.source ?? "Unknown source")}</p>
    <div class="evidence-foot">
      ${strengthMarkup(item.strength)}
      ${retracted ? tag("RETRACTED", "alert") : tag("ACTIVE", "ok")}
    </div>
    ${
      retracted
        ? `<p class="evidence-reason"><strong>Withdrawn ${fmtDate(item.retracted_at)}.</strong> ${escapeHtml(item.reason ?? "")}</p>`
        : ""
    }
  </article>`;
}

function timelineMarkup(current, history, activeId) {
  const items = [
    {
      id: current.decision_id,
      statement: current.statement,
      from: current.valid_from,
      to: null,
      confidence: current.confidence,
      status: "current",
    },
    ...history
      .slice()
      .reverse()
      .map((item) => ({
        id: item.decision_id,
        statement: item.statement,
        from: item.valid_from,
        to: item.valid_to,
        confidence: item.confidence,
        status: "superseded",
      })),
  ];

  return `<section class="section">
    <header class="section-head">
      <h2>${items.length > 1 ? "What it replaced" : "Decision history"}</h2>
      <span class="section-count">${plural(items.length, "decision")}</span>
    </header>
    <ol class="timeline">
      ${items
        .map(
          (item) => `<li class="timeline-item ${item.id === activeId ? "is-active" : ""} ${item.status === "superseded" ? "is-past" : ""}">
            <span class="timeline-dot"></span>
            <div class="timeline-body">
              <div class="timeline-date">${fmtDate(item.from)} → ${item.to ? fmtDate(item.to) : "now"}</div>
              <p class="timeline-statement">${escapeHtml(item.statement)}</p>
            </div>
            <div class="timeline-side">
              ${item.status === "current" ? tag("CURRENT", "ok") : tag("SUPERSEDED")}
              ${confidenceMarkup(item.confidence)}
            </div>
          </li>`,
        )
        .join("")}
    </ol>
  </section>`;
}

function notesMarkup(notes, staleNotes) {
  if (!notes.length) return "";
  const disagree = staleNotes.length > 0;
  return `<section class="section">
    <header class="section-head">
      <h2>${disagree ? "Docs that disagree" : "Docs on record"}</h2>
      <span class="section-count">${disagree ? `${staleNotes.length} stale of ${notes.length}` : plural(notes.length, "doc")}</span>
    </header>
    <div class="note-stack">
      ${notes
        .map((note) => {
          const stale = note.freshness === "stale";
          const proposed = note.freshness === "proposed";
          return `<article class="doc ${stale ? "is-stale" : ""}">
            <div class="doc-top">
              <span class="doc-date">${fmtDate(note.note_date)}</span>
              ${stale ? tag("STALE", "alert") : proposed ? tag("PROPOSED", "past") : note.freshness === "current" ? tag("MATCHES TODAY", "ok") : tag("UNLINKED")}
            </div>
            <h3>${escapeHtml(note.note_title)}</h3>
            <p class="doc-body">${escapeHtml(note.note_body)}</p>
            ${
              stale
                ? `<div class="doc-compare">
                    <div><span>This doc says</span><strong>${escapeHtml(note.recorded_statement)}</strong></div>
                    <div><span>Today's truth</span><strong>${escapeHtml(note.current_statement)}</strong></div>
                  </div>`
                : ""
            }
          </article>`;
        })
        .join("")}
    </div>
  </section>`;
}

function proposedMarkup(proposed) {
  if (!proposed.length) return "";
  return `<section class="section">
    <header class="section-head">
      <h2>On the table</h2>
      <span class="section-count">${plural(proposed.length, "proposal")}</span>
    </header>
    ${proposed
      .map(
        (item) => `<article class="proposal">
          <div class="proposal-top">${tag("PROPOSED", "past")}<span class="doc-date">${fmtDate(item.recorded_at)}</span></div>
          <h3>${escapeHtml(item.statement)}</h3>
          <p class="proposal-evidence">${item.evidence?.length ? `Rests on ${item.evidence.map((e) => `“${escapeHtml(e)}”`).join(", ")}` : "No evidence attached."}</p>
          ${confidenceMarkup(item.confidence)}
        </article>`,
      )
      .join("")}
  </section>`;
}

function bindReceipt() {
  const slider = $("#time-slider");
  const reset = $("#time-reset");

  const apply = (asOf) => {
    state.asOf = asOf;
    const { current, history, proposed, notes } = state.receipt;
    const active = asOf
      ? one(Q.TIME_TRAVEL, { slug: state.slug, asOf }) ?? null
      : current;
    const evidence = active
      ? q(Q.DECISION_EVIDENCE, { id: active.decision_id })
      : [];

    $("#answer-slot").innerHTML = answerMarkup(active, evidence, current, asOf);
    $("#receipt-rest").innerHTML = restMarkup(active, evidence, state.receipt, asOf);
    $("#time-value").textContent = asOf ? fmtDate(asOf) : "Today";
    if (reset) reset.hidden = !asOf;
    bindReceiptLinks();
    loadNeighborhood(active?.decision_id ?? current.decision_id, asOf);
  };

  slider?.addEventListener("input", () => {
    const max = Number(slider.max);
    const value = Number(slider.value);
    apply(value === max ? null : fromDay(value));
  });

  reset?.addEventListener("click", () => {
    if (slider) slider.value = slider.max;
    apply(null);
  });

  bindReceiptLinks();
}

function bindReceiptLinks() {
  for (const button of els.workspace.querySelectorAll("[data-today]")) {
    button.addEventListener("click", () => {
      const slider = $("#time-slider");
      if (slider) slider.value = slider.max;
      state.asOf = null;
      openReceipt(state.slug);
    });
  }
  for (const button of els.workspace.querySelectorAll("[data-slug]")) {
    button.addEventListener("click", () => openReceipt(button.dataset.slug));
  }
  for (const button of els.workspace.querySelectorAll("[data-home]")) {
    button.addEventListener("click", renderHome);
  }
  for (const button of els.workspace.querySelectorAll("[data-audit]")) {
    button.addEventListener("click", renderAudit);
  }
}

// ------------------------------------------------------------------- audit

function renderAudit() {
  state.view = "audit";
  state.slug = null;
  state.asOf = null;
  state.receipt = null;
  setActiveTab("audit");

  const retracted = q(Q.AUDIT_RETRACTED);
  const missing = q(Q.MISSING_EVIDENCE);
  const stale = q(Q.STALE_NOTES);
  const total = retracted.length + missing.length + stale.length;

  els.workspace.innerHTML = `
    <section class="audit">
      <p class="kicker">Audit</p>
      <h1 class="audit-title">What search<br />can't tell you.</h1>
      <p class="lede">A keyword index finds documents. It cannot tell you that a current decision rests on a memo that was withdrawn, that another has no evidence at all, or that the runbook everyone still reads describes a vendor you left.</p>

      <div class="audit-summary">
        <div><strong>${retracted.length}</strong><span>decisions resting on retracted evidence</span></div>
        <div><strong>${missing.length}</strong><span>current decisions with no evidence</span></div>
        <div><strong>${stale.length}</strong><span>docs that contradict today's truth</span></div>
        <div class="audit-total"><strong>${total}</strong><span>findings in 89 nodes</span></div>
      </div>

      <section class="finding-group">
        <header class="section-head">
          <h2>Resting on withdrawn evidence</h2>
          <span class="section-count">${retracted.length}</span>
        </header>
        <p class="group-note">The decision is still marked current. The evidence under it is not.</p>
        ${retracted
          .map(
            (item) => `<button class="finding finding--alert" data-slug="${escapeHtml(item.topic_slug)}">
              <span class="finding-kind">${escapeHtml(item.topic)} · current</span>
              <strong>${escapeHtml(item.decision)}</strong>
              <span class="finding-detail">“${escapeHtml(item.evidence)}” was retracted ${fmtDate(item.retracted_at)}. ${escapeHtml(item.reason ?? "")}</span>
              <span class="finding-go">Open receipt →</span>
            </button>`,
          )
          .join("")}
      </section>

      <section class="finding-group">
        <header class="section-head">
          <h2>No evidence at all</h2>
          <span class="section-count">${missing.length}</span>
        </header>
        <p class="group-note">Approved, in force, and unsupported.</p>
        ${missing
          .map(
            (item) => `<button class="finding" data-slug="${escapeHtml(item.topic_slug)}">
              <span class="finding-kind">${escapeHtml(item.topic)} · since ${fmtDate(item.valid_from)}</span>
              <strong>${escapeHtml(item.decision)}</strong>
              <span class="finding-detail">No evidence node is linked to this decision.</span>
              <span class="finding-go">Open receipt →</span>
            </button>`,
          )
          .join("")}
      </section>

      <section class="finding-group">
        <header class="section-head">
          <h2>Docs that contradict today</h2>
          <span class="section-count">${stale.length}</span>
        </header>
        <p class="group-note">The note is still canonical. The decision it records was replaced.</p>
        ${stale
          .map(
            (item) => `<button class="finding" data-slug="${escapeHtml(item.topic_slug)}">
              <span class="finding-kind">${escapeHtml(item.topic)} · replaced ${fmtDate(item.replaced_on)}</span>
              <strong>${escapeHtml(item.note)}</strong>
              <span class="finding-detail"><em>Says</em> “${escapeHtml(item.note_says)}” <em>Now</em> “${escapeHtml(item.current_truth)}”</span>
              <span class="finding-go">Open receipt →</span>
            </button>`,
          )
          .join("")}
      </section>

      <details class="query-details">
        <summary>The three Cypher statements behind this page</summary>
        <pre>${escapeHtml(Q.AUDIT_RETRACTED.trim())}</pre>
        <pre>${escapeHtml(Q.MISSING_EVIDENCE.trim())}</pre>
        <pre>${escapeHtml(Q.STALE_NOTES.trim())}</pre>
      </details>
    </section>`;

  for (const button of els.workspace.querySelectorAll("[data-slug]")) {
    button.addEventListener("click", () => openReceipt(button.dataset.slug));
  }

  loadCorpusGraph();
  els.graphDetail.innerHTML = `<p class="graph-hint">The whole corpus. Red rings mark withdrawn evidence and stale notes.</p>`;
}

// ------------------------------------------------------------------- graph

function staleKeysFor(nodes) {
  const staleIds = new Set(q(Q.STALE_NOTES).map((row) => row.note_id));
  return new Set(
    nodes
      .filter((node) => node.properties?.id && staleIds.has(node.properties.id))
      .map((node) => node.key),
  );
}

function loadMapGraph() {
  const data = collectGraph(q(Q.GRAPH_MAP));
  state.graphData = data;
  state.graphMode = "map";
  state.selectedKey = null;
  state.focusKey = null;
  state.staleKeys = new Set();
  state.graphCaption = "Today's decisions, their topics and owners.";

  els.graphKicker.textContent = "Current decisions";
  els.graphTitle.textContent = "The decision map";
  els.graphMeta.textContent = `${data.nodes.length} shown · ${state.stats.nodes} in corpus`;
  els.graphCaption.textContent = state.graphCaption;
  drawGraph();
}

function loadCorpusGraph() {
  const data = collectGraph(q(Q.GRAPH_ALL));
  state.graphData = data;
  state.graphMode = "corpus";
  state.selectedKey = null;
  state.focusKey = null;
  state.staleKeys = staleKeysFor(data.nodes);
  state.graphCaption = "Whole corpus — hover to trace, click to inspect.";

  els.graphKicker.textContent = "Whole corpus";
  els.graphTitle.textContent = "The decision graph";
  els.graphMeta.textContent = `${data.nodes.length} nodes · ${data.rels.length} edges`;
  els.graphCaption.textContent = state.graphCaption;
  drawGraph();
}

function loadNeighborhood(decisionId, asOf = null) {
  let data = collectGraph(q(Q.GRAPH_NEIGHBORHOOD, { id: decisionId }));
  if (asOf) {
    // A receipt from the past should show the graph as it was then: drop
    // decisions, evidence and notes that did not exist yet.
    const future = new Set(
      data.nodes
        .filter((node) => {
          const p = node.properties ?? {};
          const label = nodeLabel(node);
          if (label === "Decision") return p.valid_from && p.valid_from > asOf;
          if (label === "Evidence") return p.published_at && p.published_at > asOf;
          if (label === "Note") return p.created_at && p.created_at > asOf;
          return false;
        })
        .map((node) => node.key),
    );
    data = {
      nodes: data.nodes.filter((node) => !future.has(node.key)),
      rels: data.rels.filter(
        (rel) => !future.has(rel.from) && !future.has(rel.to),
      ),
    };
  }
  state.graphData = data;
  state.graphMode = "neighborhood";
  state.selectedKey = null;
  state.staleKeys = staleKeysFor(data.nodes);
  state.graphCaption = "Two hops from the decision — hover to trace.";

  const focus = data.nodes.find((node) => node.properties?.id === decisionId);
  state.selectedKey = focus?.key ?? null;
  state.focusKey = focus?.key ?? null;

  els.graphKicker.textContent = "Receipt neighborhood";
  els.graphTitle.textContent = "Connected context";
  els.graphMeta.textContent = `${data.nodes.length} nodes · ${data.rels.length} edges · 2 hops`;
  els.graphCaption.textContent = state.graphCaption;
  drawGraph();
}

function drawGraph() {
  if (!state.graphData) {
    renderGraphSkeleton(els.graph);
    return;
  }
  renderGraph(els.graph, state.graphData, {
    labels:
      state.graphMode === "map"
        ? "topic"
        : state.graphMode === "corpus"
          ? "none"
          : "core",
    compact: state.graphMode === "corpus",
    focusKey: state.focusKey,
    selectedKey: state.selectedKey,
    staleNotes: state.staleKeys,
    onHover: (node) => {
      els.graphCaption.textContent = node
        ? `${nodeLabel(node)} · ${nodeName(node)}`
        : state.graphCaption;
    },
    onSelect: (node) => {
      if (!node) {
        state.selectedKey = null;
        renderNodeDetail(null);
        return;
      }
      state.selectedKey = node.key;
      const label = nodeLabel(node);
      if (label === "Topic" && node.properties?.slug) {
        openReceipt(node.properties.slug);
        return;
      }
      if (label === "Decision" && node.properties?.id) {
        const topic = one(
          "MATCH (d:Decision {id: $id})-[:ABOUT]->(t:Topic) RETURN t.slug AS slug",
          { id: node.properties.id },
        );
        if (topic?.slug) {
          openReceipt(topic.slug);
          return;
        }
      }
      drawGraph();
      renderNodeDetail(node);
    },
  });
  renderNodeDetail(
    state.selectedKey
      ? state.graphData.nodes.find((node) => node.key === state.selectedKey) ?? null
      : null,
  );
}

function renderNodeDetail(node) {
  if (!node) {
    els.graphDetail.innerHTML = `<p class="graph-hint">Click a node to inspect it.</p>`;
    return;
  }
  const label = nodeLabel(node);
  const p = node.properties ?? {};
  const entries = Object.entries(p)
    .filter(([key]) => !["id", "body"].includes(key))
    .slice(0, 3);

  els.graphDetail.innerHTML = `<div class="node-detail">
    <span class="node-kind node-kind--${label.toLowerCase()}">${escapeHtml(label)}</span>
    <h4>${escapeHtml(p.name ?? p.title ?? p.statement ?? p.id ?? node.key)}</h4>
    ${p.body ? `<p class="node-body">${escapeHtml(p.body)}</p>` : ""}
    <dl>${entries
      .map(
        ([key, value]) =>
          `<div><dt>${escapeHtml(key.replaceAll("_", " "))}</dt><dd>${escapeHtml(value)}</dd></div>`,
      )
      .join("")}</dl>
  </div>`;
}

// ------------------------------------------------------------------- shell

function setActiveTab(view) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  }
}

function bindShell() {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      if (tab.dataset.view === "audit") renderAudit();
      else renderHome();
    });
  }

  $("#brand").addEventListener("click", (event) => {
    event.preventDefault();
    renderHome();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (state.graphData) drawGraph();
    }, 180);
  });
}

function bindHomeLinks() {
  for (const button of els.workspace.querySelectorAll("[data-slug]")) {
    button.addEventListener("click", () => openReceipt(button.dataset.slug));
  }
  for (const button of els.workspace.querySelectorAll("[data-home]")) {
    button.addEventListener("click", renderHome);
  }
}

boot();
