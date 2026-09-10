"use strict";

// ─── État global ────────────────────────────────────────────────────────────

let articles = [];          // liste brute de /api/articles
let selectedStems = new Set();
let currentJobId = null;
let jobPollTimer = null;

// ─── Utilitaires ────────────────────────────────────────────────────────────

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortPred(pred) {
  return pred && pred.includes(":") ? pred.split(":").pop() : pred;
}

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erreur HTTP ${res.status}`);
  }
  return data;
}

function fmtVal(v) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

// ─── Onglets ────────────────────────────────────────────────────────────────

let evidenceLoaded = false;
let compareSummaryLoaded = false;
let relExperimentsLoaded = false;

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "evidence" && !evidenceLoaded) {
        evidenceLoaded = true;
        loadEvidenceAudit();
      }
      if (btn.dataset.tab === "compare" && !compareSummaryLoaded) {
        compareSummaryLoaded = true;
        loadCompareSummary();
      }
      if (btn.dataset.tab === "relvariants" && !relExperimentsLoaded) {
        relExperimentsLoaded = true;
        loadRelationsExperiments();
      }
    });
  });
}

// ─── Chargement initial ─────────────────────────────────────────────────────

async function loadModels() {
  const data = await fetchJSON("/api/models");
  const optionsHtml = data.models.map((m) =>
    `<option value="${escapeHtml(m)}" ${m === data.default_model ? "selected" : ""}>${escapeHtml(m)}${m === data.default_model ? " (défaut)" : ""}</option>`
  ).join("");
  document.getElementById("opt-model").innerHTML = optionsHtml;
  document.getElementById("rv-model").innerHTML = optionsHtml;
}

async function loadArticles() {
  articles = await fetchJSON("/api/articles");
  renderArticlesTable();
  populateResultsStemSelect();
  populateCompareStemSelect();
}

// ─── Onglet Articles & Extraction ──────────────────────────────────────────

function renderArticlesTable() {
  const filter = document.getElementById("article-search").value.trim().toLowerCase();
  const tbody = document.getElementById("articles-tbody");
  const filtered = articles.filter((a) => {
    if (!filter) return true;
    return a.stem.toLowerCase().includes(filter) ||
           (a.title || "").toLowerCase().includes(filter);
  });

  tbody.innerHTML = filtered.map((a) => `
    <tr>
      <td><input type="checkbox" class="article-check" data-stem="${escapeHtml(a.stem)}" ${selectedStems.has(a.stem) ? "checked" : ""}></td>
      <td>${escapeHtml(a.stem)}</td>
      <td class="title-cell">${escapeHtml(a.title || "—")}</td>
      <td><span class="badge ${escapeHtml(a.corpus)}">${escapeHtml(a.corpus)}</span></td>
      <td>${a.latest_date ? escapeHtml(a.latest_date) + ` (${a.extractions.length})` : "—"}</td>
    </tr>
  `).join("");

  document.getElementById("article-count").textContent = `${filtered.length} / ${articles.length} article(s)`;

  tbody.querySelectorAll(".article-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedStems.add(cb.dataset.stem);
      else selectedStems.delete(cb.dataset.stem);
      updateLaunchButton();
    });
  });

  const selectAll = document.getElementById("select-all-visible");
  selectAll.checked = filtered.length > 0 && filtered.every((a) => selectedStems.has(a.stem));

  document.querySelectorAll(".select-corpus").forEach((cb) => {
    const inCorpus = articles.filter((a) => a.corpus === cb.dataset.corpus);
    cb.checked = inCorpus.length > 0 && inCorpus.every((a) => selectedStems.has(a.stem));
  });
}

function updateLaunchButton() {
  const btn = document.getElementById("btn-launch");
  btn.textContent = `Lancer l'extraction (${selectedStems.size} sélectionné${selectedStems.size > 1 ? "s" : ""})`;
  btn.disabled = selectedStems.size === 0 || currentJobId !== null;
}

function initArticlesPanel() {
  document.getElementById("article-search").addEventListener("input", renderArticlesTable);

  document.getElementById("select-all-visible").addEventListener("change", (e) => {
    const filter = document.getElementById("article-search").value.trim().toLowerCase();
    const filtered = articles.filter((a) =>
      !filter || a.stem.toLowerCase().includes(filter) || (a.title || "").toLowerCase().includes(filter)
    );
    filtered.forEach((a) => {
      if (e.target.checked) selectedStems.add(a.stem);
      else selectedStems.delete(a.stem);
    });
    renderArticlesTable();
    updateLaunchButton();
  });

  document.querySelectorAll(".select-corpus").forEach((cb) => {
    cb.addEventListener("change", () => {
      const inCorpus = articles.filter((a) => a.corpus === cb.dataset.corpus);
      inCorpus.forEach((a) => {
        if (cb.checked) selectedStems.add(a.stem);
        else selectedStems.delete(a.stem);
      });
      renderArticlesTable();
      updateLaunchButton();
    });
  });

  document.getElementById("btn-launch").addEventListener("click", launchExtraction);
}

async function launchExtraction() {
  const errorEl = document.getElementById("launch-error");
  errorEl.textContent = "";

  const chunks = Array.from(document.querySelectorAll(".opt-chunk:checked")).map((c) => c.value);
  if (chunks.length === 0) {
    errorEl.textContent = "Sélectionnez au moins un bloc.";
    return;
  }

  const body = {
    stems: Array.from(selectedStems),
    model: document.getElementById("opt-model").value,
    chunks,
    no_factcheck: document.getElementById("opt-no-factcheck").checked,
    debug: document.getElementById("opt-debug").checked,
    no_split: document.getElementById("opt-no-split").checked,
    no_metadata: document.getElementById("opt-no-metadata").checked,
  };

  try {
    const res = await fetchJSON("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    currentJobId = res.job_id;
    updateLaunchButton();
    startJobPolling();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

function startJobPolling() {
  if (jobPollTimer) clearInterval(jobPollTimer);
  pollJobOnce();
  jobPollTimer = setInterval(pollJobOnce, 1500);
}

async function pollJobOnce() {
  if (!currentJobId) return;
  let job;
  try {
    job = await fetchJSON(`/api/jobs/${currentJobId}`);
  } catch (e) {
    return;
  }
  const isRv = job.kind === "relations_variant";
  document.getElementById("job-panel").classList.toggle("hidden", isRv);
  document.getElementById("rv-job-panel").classList.toggle("hidden", !isRv);
  renderJobPanel(job, isRv ? "rv-" : "");
  if (job.status === "done" || job.status === "error") {
    clearInterval(jobPollTimer);
    jobPollTimer = null;
    currentJobId = null;
    updateLaunchButton();
    updateRvLaunchButton();
    loadArticles(); // rafraîchit les dernières dates d'extraction
    if (isRv) loadRelationsExperiments();
  }
}

// prefix : "" pour le job-panel de l'onglet Extraction, "rv-" pour celui de
// l'onglet Tableaux (relations) — même job, même contrat de rendu, deux jeux
// d'éléments DOM distincts (un seul job actif à la fois, cf. jobs.py : une
// seule queue/thread partagée entre les deux types de job).
function renderJobPanel(job, prefix = "") {
  const total = job.order.length;
  const done = job.order.filter((s) => ["done", "error"].includes(job.articles[s].status)).length;
  document.getElementById(`${prefix}job-progress-fill`).style.width = `${total ? (done / total) * 100 : 0}%`;
  document.getElementById(`${prefix}job-progress-text`).textContent =
    `${done}/${total} — ${job.status}${job.current ? " — en cours : " + job.current : ""}`;

  document.getElementById(`${prefix}job-articles`).innerHTML = job.order.map((stem) => {
    const a = job.articles[stem];
    const label = a.status === "done"
      ? `${escapeHtml(stem)} (${a.n_relations} rel., ${a.n_rejected} rejetés)`
      : a.status === "error"
        ? `${escapeHtml(stem)} — ${escapeHtml(a.error || "erreur")}`
        : escapeHtml(stem);
    return `<span class="job-article-chip ${a.status}">${label}</span>`;
  }).join("");

  const logEl = document.getElementById(`${prefix}job-log`);
  logEl.textContent = job.log.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

// ─── Onglet Résultats ───────────────────────────────────────────────────────

function populateResultsStemSelect() {
  const sel = document.getElementById("res-stem");
  const withResults = articles.filter((a) => a.extractions.length > 0);
  const prev = sel.value;
  sel.innerHTML = `<option value="">— choisir —</option>` + withResults.map((a) =>
    `<option value="${escapeHtml(a.stem)}">${escapeHtml(a.stem)}</option>`
  ).join("");
  if (withResults.some((a) => a.stem === prev)) sel.value = prev;
}

async function onResultsStemChange() {
  const stem = document.getElementById("res-stem").value;
  const dateSel = document.getElementById("res-date");
  if (!stem) {
    dateSel.innerHTML = "";
    document.getElementById("res-content").innerHTML = `<p class="muted">Sélectionnez un article extrait pour voir le résultat.</p>`;
    return;
  }
  const data = await fetchJSON(`/api/results/${encodeURIComponent(stem)}`);
  dateSel.innerHTML = data.dates.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
  dateSel.value = data.dates[data.dates.length - 1];
  await onResultsDateChange();
}

async function onResultsDateChange() {
  const stem = document.getElementById("res-stem").value;
  const date = document.getElementById("res-date").value;
  if (!stem || !date) return;
  const data = await fetchJSON(`/api/results/${encodeURIComponent(stem)}/${encodeURIComponent(date)}`);
  renderResult(data);
}

function renderResult(data) {
  const raw = document.getElementById("res-raw-toggle").checked;
  const el = document.getElementById("res-content");
  if (raw) {
    el.innerHTML = `<pre class="raw-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
    return;
  }
  el.innerHTML = renderResultStructured(data);
}

function kvTable(triplets) {
  if (!triplets || triplets.length === 0) return `<p class="muted">Aucune donnée.</p>`;
  const rows = triplets.map((t) =>
    `<tr><td>${escapeHtml(shortPred(t.predicate))}${t._source ? ` <span class="muted">(${escapeHtml(t._source)})</span>` : ""}</td><td>${escapeHtml(fmtVal(t.object))}</td></tr>`
  ).join("");
  return `<table class="kv-table">${rows}</table>`;
}

function renderResultStructured(data) {
  let html = "";

  // Sport : regroupé en cartes (nouvelle carte à chaque sportName)
  html += `<div class="block-title">Sport</div>`;
  if (!data.Sport || data.Sport.length === 0) {
    html += `<p class="muted">Aucune donnée.</p>`;
  } else {
    const groups = [];
    for (const t of data.Sport) {
      if (shortPred(t.predicate) === "sportName" || groups.length === 0) groups.push([]);
      groups[groups.length - 1].push(t);
    }
    html += groups.map((g) => `<div class="sport-card">${kvTable(g)}</div>`).join("");
  }

  // Relations
  html += `<div class="block-title">Relations (${(data.Relations || []).length})</div>`;
  if (!data.Relations || data.Relations.length === 0) {
    html += `<p class="muted">Aucune donnée.</p>`;
  } else {
    html += data.Relations.map((r) => {
      const v1 = (r.V1 && r.V1.triplets) || [];
      const v2 = (r.V2 && r.V2.triplets) || [];
      const v1name = fmtVal((v1.find((t) => shortPred(t.predicate) === "V1") || {}).object);
      const v2name = fmtVal((v2.find((t) => shortPred(t.predicate) === "V2") || {}).object);
      const evidence = r._evidence
        ? `<p class="muted">Preuve${r._evidence_verified === false ? " (non vérifiée)" : ""} : "${escapeHtml(r._evidence)}"</p>`
        : "";
      return `<div class="rel-card">
        <div class="rel-pair">${escapeHtml(v1name)} ↔ ${escapeHtml(v2name)}</div>
        <div class="rel-cols">
          <div><b>V1</b>${kvTable(v1)}</div>
          <div><b>V2</b>${kvTable(v2)}</div>
        </div>
        <b>Stats</b>${kvTable(r.stats)}
        ${evidence}
      </div>`;
    }).join("");
  }

  // Analysis / Population / Bibliographic
  for (const [key, label] of [["Analysis", "Analysis"], ["Population", "Population"], ["Bibliographic", "Bibliographic"]]) {
    html += `<div class="block-title">${label}</div>${kvTable(data[key])}`;
  }

  // Rejetés
  const rejected = data._rejected || [];
  html += `<div class="block-title">Rejetés (${rejected.length})</div>`;
  if (rejected.length === 0) {
    html += `<p class="muted">Aucun.</p>`;
  } else {
    html += `<div class="rejected-list">` + rejected.map((r) =>
      `<div class="rejected-item">${escapeHtml(shortPred(r.predicate))} = ${escapeHtml(fmtVal(r.object))}
        <div class="reason">${escapeHtml(r._rejected_reason || "")}</div></div>`
    ).join("") + `</div>`;
  }

  return html;
}

function initResultsPanel() {
  document.getElementById("res-stem").addEventListener("change", onResultsStemChange);
  document.getElementById("res-date").addEventListener("change", onResultsDateChange);
  document.getElementById("res-raw-toggle").addEventListener("change", onResultsDateChange);
}

// ─── Onglet Comparaison ─────────────────────────────────────────────────────

function populateCompareStemSelect() {
  const sel = document.getElementById("cmp-stem");
  const annotated = articles.filter((a) => a.corpus !== "production" && a.extractions.length > 0);
  const prev = sel.value;
  sel.innerHTML = `<option value="">— choisir —</option>` + annotated.map((a) =>
    `<option value="${escapeHtml(a.stem)}">${escapeHtml(a.stem)}</option>`
  ).join("");
  if (annotated.some((a) => a.stem === prev)) sel.value = prev;
}

async function onCompareStemChange() {
  const stem = document.getElementById("cmp-stem").value;
  const dateSel = document.getElementById("cmp-date");
  if (!stem) {
    dateSel.innerHTML = "";
    document.getElementById("cmp-content").innerHTML = `<p class="muted">Sélectionnez un article du corpus annoté pour comparer au ground truth.</p>`;
    return;
  }
  const data = await fetchJSON(`/api/results/${encodeURIComponent(stem)}`);
  dateSel.innerHTML = data.dates.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
  dateSel.value = data.dates[data.dates.length - 1];
  await onCompareDateChange();
}

async function onCompareDateChange() {
  const stem = document.getElementById("cmp-stem").value;
  const date = document.getElementById("cmp-date").value;
  if (!stem || !date) return;
  const el = document.getElementById("cmp-content");
  try {
    const data = await fetchJSON(`/api/compare/${encodeURIComponent(stem)}?date=${encodeURIComponent(date)}`);
    renderCompare(data);
  } catch (e) {
    el.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
  }
}

function countsSummary(counts) {
  const ok = counts.success || 0;
  const fail = (counts.failure_wrong || 0) + (counts.failure_absent || 0);
  const na = counts.na || 0;
  const extra = (counts.extra || 0) + (counts.hallucination || 0);
  const n = ok + fail;
  const rate = n ? Math.round((ok / n) * 100) : null;
  return { ok, fail, na, extra, rate };
}

function statCard(label, counts) {
  const s = countsSummary(counts || {});
  return `<div class="cmp-stat">${escapeHtml(label)}<b>${s.rate === null ? "—" : s.rate + "%"}</b>${s.ok}/${s.ok + s.fail} ok · ${s.na} na</div>`;
}

function fieldsTable(fields) {
  if (!fields || fields.length === 0) return `<p class="muted">Aucun champ.</p>`;
  const rows = fields.map(([pred, status, rv, gv]) => `
    <tr class="status-${status}">
      <td>${escapeHtml(shortPred(pred))}</td>
      <td class="status-cell"><span class="status-pill">${escapeHtml(status)}</span></td>
      <td>${escapeHtml(fmtVal(rv))}</td>
      <td>${escapeHtml(fmtVal(gv))}</td>
    </tr>`).join("");
  return `<table class="cmp-fields">
    <thead><tr><th>Champ</th><th>Statut</th><th>Obtenu</th><th>Attendu</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderCompare(data) {
  const el = document.getElementById("cmp-content");
  const nMatched = data.n_matched, nGt = data.n_gt_rels, nRes = data.n_res_rels;

  let html = `<div class="cmp-summary">
    ${statCard("Sport", data.sport_counts)}
    <div class="cmp-stat">Relations (appariement)<b>${nGt ? Math.round((nMatched / nGt) * 100) : 0}%</b>${nMatched}/${nGt} appariées · ${nRes} extraites</div>
    ${statCard("Relations (champs)", data.rel_counts)}
    ${statCard("Analysis", data.analysis_counts)}
    ${statCard("Population", data.population_counts)}
    ${statCard("Bibliographic", data.bibliographic_counts)}
  </div>`;

  html += `<div class="block-title">Sport</div>${fieldsTable(data.sport_fields)}`;

  html += `<div class="block-title">Relations</div>`;
  if (!data.relation_reports || data.relation_reports.length === 0) {
    html += `<p class="muted">Aucune.</p>`;
  } else {
    html += data.relation_reports.map((r) => `
      <details class="rel-report" data-kind="${r.kind}">
        <summary>${{ matched: "✓", missing: "✗", extra: "+" }[r.kind]} ${escapeHtml(r.label)}</summary>
        <div class="rel-report-body">${fieldsTable(r.fields)}</div>
      </details>
    `).join("");
  }

  html += `<div class="block-title">Analysis</div>${fieldsTable(data.analysis_fields)}`;
  html += `<div class="block-title">Population</div>${fieldsTable(data.population_fields)}`;
  html += `<div class="block-title">Bibliographic</div>${fieldsTable(data.bibliographic_fields)}`;

  el.innerHTML = html;
}

function initComparePanel() {
  document.getElementById("cmp-stem").addEventListener("change", onCompareStemChange);
  document.getElementById("cmp-date").addEventListener("change", onCompareDateChange);
  document.getElementById("cmp-summary-scope").addEventListener("change", loadCompareSummary);
}

// ─── Score agrégé (tous les articles / articles à tableaux) ───────────────

async function loadCompareSummary() {
  const scope = document.getElementById("cmp-summary-scope").value;
  const el = document.getElementById("cmp-summary-content");
  el.innerHTML = `<p class="muted">Chargement…</p>`;
  try {
    const data = await fetchJSON(`/api/compare-summary?scope=${encodeURIComponent(scope)}`);
    renderCompareSummary(data);
  } catch (e) {
    el.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
  }
}

function renderCompareSummary(data) {
  const a = data.aggregate;
  document.getElementById("cmp-summary-content").innerHTML = `<div class="cmp-summary">
    <div class="cmp-stat">Articles<b>${a.n_articles}</b></div>
    <div class="cmp-stat">Sport<b>${a.sport_rate}%</b></div>
    <div class="cmp-stat">Relations (appariement)<b>${a.rel_match_rate}%</b></div>
    <div class="cmp-stat">Relations (champs)<b>${a.rel_fields_rate}%</b></div>
    <div class="cmp-stat">Analysis<b>${a.analysis_rate}%</b></div>
  </div>`;
}

// ─── Onglet Audit preuves ───────────────────────────────────────────────────

async function loadEvidenceAudit() {
  const summaryEl = document.getElementById("evidence-summary");
  summaryEl.innerHTML = `<p class="muted">Calcul en cours (lecture de tous les résultats)…</p>`;
  try {
    const data = await fetchJSON("/api/evidence-audit");
    renderEvidenceAudit(data);
  } catch (e) {
    summaryEl.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
  }
}

function renderEvidenceAudit(data) {
  const c = data.counts || {};
  const verified = c.verified || 0, unverified = c.unverified || 0, noEvidence = c.no_evidence || 0;
  const total = verified + unverified;
  const rate = total ? Math.round((verified / total) * 100) : null;

  document.getElementById("evidence-summary").innerHTML = `
    <div class="cmp-summary">
      <div class="cmp-stat">Articles audités<b>${data.n_articles}</b></div>
      <div class="cmp-stat">Citations vérifiées<b>${rate === null ? "—" : rate + "%"}</b>${verified}/${total}</div>
      <div class="cmp-stat">Citations NON vérifiées<b>${total ? 100 - rate : 0}%</b>${unverified}/${total}</div>
      <div class="cmp-stat">Sans citation<b>${noEvidence}</b>rien à vérifier</div>
    </div>`;

  const flaggedByStem = {};
  (data.flagged || []).forEach((f) => {
    (flaggedByStem[f.stem] = flaggedByStem[f.stem] || []).push(f);
  });

  const worst = (data.per_article || [])
    .filter((a) => a.unverified > 0)
    .sort((a, b) => b.unverified - a.unverified);

  const rows = worst.map((a) => {
    const items = (flaggedByStem[a.stem] || []).map((f) => `
      <div class="rejected-item">
        <b>${escapeHtml(f.pair)}</b>
        <div class="reason">"${escapeHtml(f.evidence)}"</div>
      </div>`).join("");
    return `<details class="rel-report" data-kind="missing">
      <summary>${escapeHtml(a.stem)} — vérifiées=${a.verified} · NON vérifiées=${a.unverified} · sans citation=${a.no_evidence}</summary>
      <div class="rel-report-body">${items}</div>
    </details>`;
  }).join("");

  document.getElementById("evidence-articles").innerHTML = `
    <h2>Articles avec citations non vérifiées (${worst.length})</h2>
    ${rows || `<p class="muted">Aucune — toutes les citations fournies se retrouvent dans le texte source.</p>`}`;
}

// ─── Onglet Tableaux (relations) ────────────────────────────────────────────

function updateRvLaunchButton() {
  document.getElementById("rv-btn-launch").disabled = currentJobId !== null;
}

async function launchRelationsVariant() {
  const errorEl = document.getElementById("rv-launch-error");
  errorEl.textContent = "";

  const tag = document.getElementById("rv-tag").value.trim();
  if (!tag) {
    errorEl.textContent = "Le tag est requis.";
    return;
  }
  const variant = document.querySelector('input[name="rv-variant"]:checked').value;
  const scope = document.querySelector('input[name="rv-scope"]:checked').value;
  const model = document.getElementById("rv-model").value;

  try {
    const res = await fetchJSON("/api/relations-experiments/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, variant, scope, model }),
    });
    currentJobId = res.job_id;
    updateLaunchButton();
    updateRvLaunchButton();
    startJobPolling();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

async function loadRelationsExperiments() {
  const tags = await fetchJSON("/api/relations-experiments");
  const optionsHtml = `<option value="">— choisir —</option>` + tags.map((t) =>
    `<option value="${escapeHtml(t.tag)}">${escapeHtml(t.tag)} (${escapeHtml(t.variant)}, ${t.n_articles} art., f1=${t.aggregate.f1}%)</option>`
  ).join("");
  const selA = document.getElementById("rv-diff-a");
  const selB = document.getElementById("rv-diff-b");
  const prevA = selA.value, prevB = selB.value;
  selA.innerHTML = optionsHtml;
  selB.innerHTML = optionsHtml;
  if (tags.some((t) => t.tag === prevA)) selA.value = prevA;
  if (tags.some((t) => t.tag === prevB)) selB.value = prevB;
}

function signPt(v) {
  return (v >= 0 ? `+${v}` : String(v)) + "pt";
}

async function runDiff() {
  const a = document.getElementById("rv-diff-a").value;
  const b = document.getElementById("rv-diff-b").value;
  const el = document.getElementById("rv-diff-content");
  if (!a || !b) {
    el.innerHTML = `<p class="muted">Choisissez deux tags.</p>`;
    return;
  }
  try {
    const data = await fetchJSON(`/api/relations-experiments/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
    renderDiff(data);
  } catch (e) {
    el.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
  }
}

function renderDiff(data) {
  const el = document.getElementById("rv-diff-content");
  const ad = data.aggregate_delta;
  let html = `<div class="cmp-summary">
    <div class="cmp-stat">Precision<b>${signPt(ad.precision)}</b></div>
    <div class="cmp-stat">Recall<b>${signPt(ad.recall)}</b></div>
    <div class="cmp-stat">F1<b>${signPt(ad.f1)}</b></div>
    <div class="cmp-stat">Articles communs<b>${data.n_common}</b></div>
  </div>`;
  if (data.stems_only_in_a.length) {
    html += `<p class="muted">Absents de ${escapeHtml(data.tag_b)} : ${data.stems_only_in_a.map(escapeHtml).join(", ")}</p>`;
  }
  if (data.stems_only_in_b.length) {
    html += `<p class="muted">Absents de ${escapeHtml(data.tag_a)} : ${data.stems_only_in_b.map(escapeHtml).join(", ")}</p>`;
  }

  const rows = data.per_article.map((r) => `
    <tr>
      <td>${escapeHtml(r.stem)}</td>
      <td class="${r.f1_delta > 0 ? "delta-pos" : r.f1_delta < 0 ? "delta-neg" : ""}">${signPt(r.f1_delta)}</td>
      <td>${r.n_matched_a} → ${r.n_matched_b} / ${r.n_gt_rels}</td>
    </tr>`).join("");
  html += `<table class="cmp-fields">
    <thead><tr><th>Article</th><th>Delta F1</th><th>Relations matchées (a → b / GT)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  el.innerHTML = html;
}

function initRelationsVariantsPanel() {
  document.getElementById("rv-btn-launch").addEventListener("click", launchRelationsVariant);
  document.getElementById("rv-btn-diff").addEventListener("click", runDiff);
}

// ─── Init ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initArticlesPanel();
  initResultsPanel();
  initComparePanel();
  initRelationsVariantsPanel();
  loadModels();
  loadArticles();
  updateLaunchButton();
  updateRvLaunchButton();
});
