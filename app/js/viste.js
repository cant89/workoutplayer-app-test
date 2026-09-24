/* WorkoutPlayer · app: viste (T2). Una vista per indirizzo dopo "#":
     (vuoto) / #plans      I tuoi piani: piani del deposito locale, stato (da rivedere, pronto, anteprima), apri, elimina
     #bank                aggiungi un piano del banco (solo prove: dist/banco-catalogo.json, app/catalogo_banco.py)
     #settings            lingua dell'interfaccia, tema, audio (comuni a tutti i piani), stato dell'offline
     #review/<id>      valori incerti accanto al ritaglio o alla riga del documento, conferma o correzione (AC-R1…R4);
                          finché ne manca uno il piano non si apre (D-U7); poi tutti i valori restano correggibili
     #preview/<id>      anteprima (AC-V3-1): avviso di copertura e disclaimer in alto, i primi 2 esercizi giocabili,
                          il resto in elenco con numeri e istruzioni oscurati
     #unlock/<id>        segnaposto dello sblocco (il pagamento è di T3)
   Il player di un piano si apre in index.html?p=<id> (app/js/avvio.js). Tipi di record: "plan" (piano) e "preview" (anteprima);
   un'anteprima porta anche i valori incerti dei suoi 2 esercizi (unverified), segnati "da verificare" nel player. Parole dai file di lingua (lib/lang/). */
(function (App) {
  "use strict";
  const WP = () => globalThis.WorkoutPlayer;
  const D = App.deposito, RV = App.revisione;
  const esc = s => WP().util.esc(s == null ? "" : s);
  const T = (k, p) => App.t(k, p);
  const enc = encodeURIComponent;
  const $app = () => document.getElementById("app");
  const UNIT = { tempo: "app.unit.seconds", recupero: "app.unit.seconds", serie: "app.unit.sets", ripetizioni: "app.unit.reps", giri: "app.unit.rounds", lati: "app.unit.sides" };
  const INTEGER = ["serie", "ripetizioni", "giri", "lati"];
  const state = { openKey: null, error: null, pendingDelete: null, busy: null, catalog: null };

  // nome della lingua di un piano nella lingua dell'interfaccia ("it-IT" → "italiano", "Italian"): solo la lingua, senza il paese
  const langName = tag => { const l = String(tag || "").split("-")[0]; try { return new Intl.DisplayNames([App.lang()], { type: "language" }).of(l) || l; } catch (e) { return l; } };
  function page(title, eyebrow, back, body) {
    return '<div class="wrap app-view">' + (back ? '<button class="back" type="button" data-go="' + esc(back) + '">' + esc(T("app.back")) + "</button>" : "") +
      '<header class="app-head">' + (eyebrow ? '<span class="eyebrow">' + esc(eyebrow) + "</span>" : "") + "<h1>" + esc(title) + "</h1></header>" + body + "</div>";
  }
  const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

  /* ---- I tuoi piani ---- */
  function statusOf(rec) {
    if (rec.kind === "preview") return { text: T("app.status.preview"), attn: false };
    if (RV.playable(rec)) return { text: T("app.status.ready"), attn: false };
    const n = RV.pending(rec);
    return { text: n ? T("app.status.review", { n }) : T("app.status.confirm"), attn: true };
  }
  async function lista() {
    const recs = (await D.all()).sort((a, b) => b.addedAt - a.addedAt);
    const cards = recs.map(rec => {
      const st = statusOf(rec), sessions = rec.kind === "preview" ? rec.coverage.sessions : Object.keys(rec.lib.workouts).length;
      return '<div class="app-card"><button class="choice" type="button" data-open="' + esc(rec.id) + '"><span class="letter">' + esc((rec.title || "?").trim().charAt(0).toUpperCase()) +
        '</span><span><strong class="t">' + esc(rec.title) + '</strong><span class="focus">' + esc(T("app.plans.meta", { n: sessions, lang: langName(rec.lang) })) +
        '</span><span class="meta' + (st.attn ? " app-attn" : "") + '">' + esc(st.text) + '</span></span><span class="go" aria-hidden="true">›</span></button>' +
        '<div class="app-row">' + (rec.kind === "plan" && rec.data ? '<button type="button" class="icon-btn" data-go="#review/' + esc(enc(rec.id)) + '">' + esc(T("app.plans.values")) + "</button>" : "") +
        '<button type="button" class="icon-btn" data-del="' + esc(rec.id) + '">' + esc(T(state.pendingDelete === rec.id ? "app.plans.deleteSure" : "app.plans.delete")) + "</button></div></div>";
    }).join("");
    return page(T("app.plans.title"), "WorkoutPlayer", null,
      (recs.length ? '<div class="choices">' + cards + "</div>" : '<p class="app-lead">' + esc(T("app.plans.empty")) + "</p>") +
      '<div class="app-actions"><button class="btn" type="button" data-go="#bank">' + esc(T("app.plans.add")) + '</button><button class="btn ghost" type="button" data-go="#settings">' + esc(T("app.settings.title")) + "</button></div>");
  }
  async function open(id) {
    const rec = await D.get(id); if (!rec) return route();
    if (rec.kind === "preview") return go("#preview/" + enc(id));
    if (!RV.playable(rec)) return go("#review/" + enc(id));
    location.href = "index.html?p=" + enc(id);
  }
  async function remove(id) {
    if (state.pendingDelete !== id) { state.pendingDelete = id; return route(); }
    const rec = await D.get(id);
    await D.del(id);
    if (rec) D.forgetPlayer(rec.lib.storageKey || "workoutplayer-" + rec.lib.id);
    state.pendingDelete = null; route();
  }

  /* ---- banco (solo prove) ---- */
  async function banco() {
    try {
      if (!state.catalog) state.catalog = (await (await fetch("../dist/banco-catalogo.json", { cache: "no-cache" })).json()).piani;
    } catch (e) {
      return page(T("app.bank.title"), T("app.bank.eyebrow"), "#plans", '<div class="note">' + esc(T(navigator.onLine === false ? "app.bank.offline" : "app.bank.missing")) + "</div>");
    }
    const have = new Set((await D.all()).map(r => r.id));
    const btn = (x, i, kind) => {
      const id = kind + ":" + x.id;
      return have.has(id) ? '<button type="button" class="icon-btn" data-open="' + esc(id) + '">' + esc(T(kind === "plan" ? "app.bank.openPlan" : "app.bank.openPreview")) + "</button>"
        : '<button type="button" class="icon-btn" data-import="' + i + '" data-kind="' + kind + '"' + (state.busy ? " disabled" : "") + ">" + esc(T(kind === "plan" ? "app.bank.addPlan" : "app.bank.addPreview")) + "</button>";
    };
    const rows = state.catalog.map((x, i) => '<div class="app-card app-entry"><div><strong class="app-entry-title">' + esc(x.title) + '</strong><span class="focus">' +
      esc([x.id, langName(x.lang), T("app.bank.meta", { s: x.sessions, e: x.exercises })].concat(x.uncertain ? [T("app.bank.uncertain", { n: x.uncertain })] : []).join(" · ")) +
      '</span></div><div class="app-row">' + btn(x, i, "plan") + btn(x, i, "preview") + "</div></div>").join("");
    return page(T("app.bank.title"), T("app.bank.eyebrow"), "#plans", '<p class="app-lead">' + esc(T("app.bank.lead")) + "</p>" +
      (state.busy ? '<p class="note">' + esc(T("app.bank.loading", { title: state.busy })) + "</p>" : "") + '<div class="app-list">' + rows + "</div>");
  }
  const toDataURL = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
  async function importa(x, kind) {
    const base = "../" + x.dir + "/";
    const get = async (f, how) => { const r = await fetch(base + f, { cache: "no-cache" }); if (!r.ok) throw new Error(f + " " + r.status); return how === "text" ? r.text() : how === "blob" ? r.blob() : r.json(); };
    const lib = await get(x.lib), stem = f => f.replace(/\.[^.]+$/, "");
    const rec = { id: kind + ":" + x.id, kind, source: x.dir, title: lib.title, lang: lib.lang, addedAt: Date.now(), images: {} };
    let wanted = x.images;
    if (kind === "plan") {
      Object.assign(rec, { lib, compose: x.compose ? await get(x.compose, "text") : null, data: x.data ? await get(x.data) : null, review: { fields: {} } });
    } else {
      const a = App.anteprima.costruisci(lib), keep = new Set(a.chosen.map(ex => (lib.exercises[ex] || {}).img || ex));
      // valori incerti dei 2 esercizi giocabili: nel player con il segno "da verificare" (solo il necessario per scriverlo)
      const data = x.data ? await get(x.data) : null, unverified = [];
      if (data) RV.campi(data, lib).filter(c => c.uncertain && c.labelField).forEach(c => {
        const k = a.markKey(c.pos.wid, c.pos.pi, c.pos.ii);
        if (k) unverified.push({ k, field: c.labelField, c: { tipo: c.tipo, parts: c.parts.map(p => ({ sub: p.sub, n: { valore: p.n.valore, unita: p.n.unita } })) } });
      });
      Object.assign(rec, { lib: a.plan, compose: null, outline: a.outline, coverage: a.coverage, unverified });
      wanted = x.images.filter(f => keep.has(stem(f)));
    }
    for (const f of wanted) rec.images[stem(f)] = await toDataURL(await get("images/" + f, "blob"));
    await D.put(rec);
    return rec;
  }

  /* ---- impostazioni ---- */
  const seg = (group, key, options, current) => '<div class="seg" data-group="' + group + '" data-key="' + key + '">' +
    options.map(o => '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + String(String(current) === String(o[0])) + '">' + esc(o[1]) + "</button>").join("") + "</div>";
  const row = (label, hint, control) => '<div class="set-row"><div>' + esc(label) + (hint ? "<small>" + esc(hint) + "</small>" : "") + "</div>" + control + "</div>";
  async function impostazioni() {
    const s = D.settings.get(), a = D.audio.get(), I = WP().i18n;
    const offline = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    const langs = '<select class="app-select" data-setting="lang" aria-label="' + esc(T("app.settings.lang")) + '">' +
      '<option value="auto"' + (s.lang === "auto" ? " selected" : "") + ">" + esc(T("app.settings.langAuto", { lang: I.t(I.pick(navigator.languages || [navigator.language]), "lang.name") })) + "</option>" +
      I.LANGS.map(l => '<option value="' + l + '"' + (s.lang === l ? " selected" : "") + ">" + esc(I.t(l, "lang.name")) + "</option>").join("") + "</select>";
    const yesNo = [[1, T("btn.yes")], [0, T("btn.no")]];
    return page(T("app.settings.title"), "", "#plans",
      '<section class="app-section">' +
        row(T("app.settings.lang"), T("app.settings.langHint"), langs) +
        row(T("app.settings.theme"), "", seg("app", "theme", [["auto", T("app.settings.themeAuto")], ["light", T("app.settings.themeLight")], ["dark", T("app.settings.themeDark")]], s.theme)) +
      '</section><section class="app-section"><h2 class="app-h2">' + esc(T("audio.title")) + "</h2>" +
        row(T("audio.beep"), T("audio.beepHint"), seg("audio", "beep", yesNo, a.beep)) +
        row(T("audio.voice"), T("audio.voiceHint"), seg("audio", "voice", yesNo, a.voice)) +
        row(T("audio.prep"), T("audio.prepHint"), seg("audio", "prep", [[5, "5"], [10, "10"], [15, "15"]], a.prep)) +
        '<p class="fine">' + esc(T("audio.iosNote")) + '</p><p class="fine">' + esc(T("app.settings.voiceNote")) + "</p>" +
      '</section><p class="fine">' + esc(T(offline ? "app.settings.offlineOn" : "app.settings.offlineOff")) + "</p>");
  }

  /* ---- revisione ---- */
  const fieldLabel = c => (c.labelField ? T("field." + c.labelField) : T("app.review.value"));
  const exerciseName = (rec, ex) => (ex ? (rec.data.esercizi[ex] || {}).nome || ex : "");
  function crop(rec, ex) {
    const src = ex && rec.images[(rec.lib.exercises[ex] || {}).img || ex];
    return src ? '<div class="figure"><img alt="' + esc(T("alt.figure", { name: exerciseName(rec, ex) })) + '" src="' + src + '" width="600" height="300"></div>' : "";
  }
  function source(rec, c) {
    const f = RV.fonte(rec.data, c), n = c.parts[0].n;
    if (!f) return '<p class="fine">' + esc(T("app.review.noSource")) + "</p>";
    const where = [f.docName, f.pagina != null ? T("app.review.page", { n: f.pagina }) : f.foglio != null ? T("app.review.sheet", { n: f.foglio }) : "",
      f.riga != null ? T("app.review.row", { n: f.riga }) : "", f.cella ? T("app.review.cell", { c: f.cella }) : ""].filter(Boolean).join(" · ");
    return '<div class="app-source"><span class="eyebrow">' + esc(T("app.review.source")) + "</span><q>" + esc(f.testo) + "</q><small>" +
      esc(where + (n.scritto ? " · " + T("app.review.written", { w: n.scritto }) : "")) + "</small></div>";
  }
  function why(c) {
    const w = RV.perche(c);
    return '<p class="fine">' + esc(T("app.why." + w.kind, w)) + "</p>";
  }
  function editor(rec, c, r) {
    const unit = c.tipo === "carico" ? (c.parts[0].n.unita || "kg") : T(UNIT[c.tipo] || "app.unit.value");
    return '<div class="app-editor">' + c.parts.map(p => '<label class="app-input"><span>' + esc(T(p.sub ? "app.review.sub." + p.sub : "app.review.value")) +
      '</span><input type="number" inputmode="decimal" step="any" min="0" data-sub="' + esc(p.sub || "") + '" value="' + esc(r ? r.values[p.sub || ""] : p.n.valore) + '"><small>' + esc(unit) + "</small></label>").join("") +
      (state.error === c.key ? '<p class="app-attn">' + esc(T("app.review.invalid")) + "</p>" : "") +
      '<div class="app-row"><button type="button" class="btn" data-save="' + esc(c.key) + '">' + esc(T("app.review.save")) + '</button><button type="button" class="btn ghost" data-cancel="1">' + esc(T("app.review.cancel")) + "</button></div></div>";
  }
  function fieldCard(rec, c) {
    const lang = App.lang(), r = (rec.review.fields || {})[c.key], read = RV.testoCampo(c, null, lang);
    const where = [c.where.seduta, c.where.fase, exerciseName(rec, c.where.esercizio)].filter(Boolean).join(" · ");
    const status = r ? '<p class="app-status">' + esc(r.state === "corrected" ? T("app.review.corrected", { value: RV.testoCampo(c, r.values, lang), original: read }) : T("app.review.confirmed", { value: read })) + "</p>" : "";
    const effect = RV.effetto(rec, c, r ? r.values : null);
    const noEffect = (effect ? '<p class="fine">' + esc(T(effect)) + "</p>" : "") +
      (c.tipo === "carico" && c.parts[0].n.unita === "lb" ? '<p class="fine">' + esc(T("app.review.lbNote")) + "</p>" : "");
    const actions = state.openKey === c.key ? editor(rec, c, r) : '<div class="app-row">' +
      (r ? "" : '<button type="button" class="btn" data-confirm="' + esc(c.key) + '">' + esc(T("app.review.confirm", { value: read })) + "</button>") +
      '<button type="button" class="btn ghost" data-fix="' + esc(c.key) + '">' + esc(T(r ? "app.review.change" : "app.review.fix")) + "</button></div>";
    return '<article class="app-field' + (c.uncertain && !r ? " app-field-open" : "") + '" id="f-' + esc(c.key.replace(/\//g, "-")) + '"><span class="eyebrow">' + esc(where) + "</span>" +
      '<h3 class="app-field-title">' + esc(fieldLabel(c) + ": " + RV.testoCampo(c, null, lang, true)) + "</h3>" + crop(rec, c.where.esercizio) + source(rec, c) + (c.uncertain ? why(c) : "") + status + noEffect + actions + "</article>";
  }
  function valueRow(rec, c) {
    const r = (rec.review.fields || {})[c.key], lang = App.lang();
    const value = r ? RV.testoCampo(c, r.values, lang) : RV.testoCampo(c, null, lang);
    return '<div class="app-value"><span>' + esc([exerciseName(rec, c.where.esercizio) || c.where.fase, fieldLabel(c)].join(" · ")) + "<b>" + esc(value) + "</b>" +
      (r ? "<small>" + esc(T(r.state === "corrected" ? "app.review.tagCorrected" : "app.review.tagConfirmed")) + "</small>" : "") + "</span>" +
      '<button type="button" class="icon-btn" data-fix="' + esc(c.key) + '">' + esc(T("app.review.fix")) + "</button></div>";
  }
  async function revisione(id) {
    const rec = await D.get(id);
    if (!rec || rec.kind !== "plan") return lista();
    rec.review = rec.review || { fields: {} };
    const cs = rec.data ? RV.campi(rec.data, rec.lib) : [], inc = cs.filter(c => c.uncertain), n = RV.pending(rec), ok = RV.playable(rec);
    const top = ok ? '<p class="app-lead">' + esc(T(inc.length ? "app.review.leadDone" : "app.review.leadNone")) + "</p>"
      : '<div class="note"><span class="eyebrow">' + esc(T("app.review.lockTitle")) + "</span>" + esc(n ? T("app.review.lock", { n }) : T("app.review.lockConfirm")) + "</div>";
    const cta = ok ? '<button class="btn" type="button" data-play="' + esc(id) + '">' + esc(T("app.review.play")) + "</button>"
      : '<button class="btn" type="button" data-conclude="' + esc(id) + '"' + (n ? " disabled" : "") + ">" + esc(T("app.review.conclude")) + "</button>";
    const groups = {};
    cs.forEach(c => { (groups[c.where.seduta] = groups[c.where.seduta] || []).push(c); });
    const all = Object.keys(groups).map(k => '<details class="app-details"' + (groups[k].some(c => c.key === state.openKey && !c.uncertain) ? " open" : "") + "><summary>" +
      esc(k + " · " + T("app.review.count", { n: groups[k].length })) + "</summary>" +
      groups[k].map(c => (c.key === state.openKey && !c.uncertain ? fieldCard(rec, c) : valueRow(rec, c))).join("") + "</details>").join("");
    return page(rec.title, T(ok ? "app.review.eyebrowDone" : "app.review.eyebrow"), "#plans", top +
      '<section class="app-section"><h2 class="app-h2">' + esc(T("app.review.uncertainTitle", { n: inc.length })) + "</h2>" +
      (inc.length ? inc.map(c => fieldCard(rec, c)).join("") : '<p class="fine">' + esc(T("app.review.noneUncertain")) + "</p>") + "</section>" +
      '<div class="app-actions">' + cta + "</div>" +
      (cs.length ? '<section class="app-section"><h2 class="app-h2">' + esc(T("app.review.allTitle")) + '</h2><p class="fine">' + esc(T("app.review.allLead")) + "</p>" + all + "</section>" : ""));
  }
  // conferma o correzione di un campo. Il player tiene i carichi ritoccati con "−/+" per esercizio nella sua memoria del piano e li
  // preferisce al carico della scheda: se la correzione cambia il carico di un esercizio, o salva un carico diverso da quello letto
  // (anche uguale alla correzione di prima: così si sistema un ritocco rimasto da prima di questa regola), il ritocco si scarta
  // (difetto del 24/09: lo squat corretto in revisione restava al valore ritoccato nel player); una semplice conferma no
  function registra(rec, c, values) {
    const prima = RV.applica(rec), r = RV.registra(rec, c, values);
    const w = rec.lib.workouts[c.pos.wid], ph = w && w.phases[c.pos.pi], it = ph && c.pos.ii != null ? ph.items[c.pos.ii] : null;
    const mine = r.state === "corrected" && c.libField === "kg" && it ? [it.ex] : [];
    D.forgetKg(rec.lib.storageKey || "workoutplayer-" + rec.lib.id, RV.carichiCambiati(prima, RV.applica(rec)).concat(mine));
    return r;
  }
  async function reviewAction(kind, key) {
    const id = decodeURIComponent(location.hash.split("/").slice(1).join("/")), rec = await D.get(id);
    const c = RV.campi(rec.data, rec.lib).find(x => x.key === key);
    if (kind === "confirm") registra(rec, c, null);
    if (kind === "save") {
      const values = {};
      let bad = false;
      document.querySelectorAll("#app .app-editor input[data-sub]").forEach(inp => {
        const v = Number(String(inp.value).replace(",", "."));
        if (inp.value === "" || !isFinite(v) || v < 0 || (INTEGER.includes(c.tipo) && !Number.isInteger(v))) bad = true;
        values[inp.dataset.sub] = v;
      });
      if (!bad && values.min != null && values.max != null && values.min > values.max) bad = true;
      if (bad) { state.error = key; return route(); }
      registra(rec, c, values);
    }
    state.openKey = null; state.error = null;
    await D.put(rec);
    route();
  }

  /* ---- anteprima ---- */
  async function anteprima(id) {
    const rec = await D.get(id);
    if (!rec || rec.kind !== "preview") return lista();
    const cov = rec.coverage, names = cov.free.slice(0, 4).join(", ") + (cov.free.length > 4 ? "…" : "");
    const item = it => it.playable
      ? '<div class="row"><span>' + esc(it.name) + '</span><span class="app-open">' + esc(T("app.preview.playable")) + "</span></div>"
      : '<div class="row app-locked"><span>' + esc(it.name) + '<span class="lock lock-line" aria-hidden="true"></span></span><span class="lock" role="img" aria-label="' + esc(T("app.preview.locked")) + '">•• × •• · •• kg</span></div>';
    const list = rec.outline.map(w => "<section><h3>" + esc((w.letter ? w.letter + " · " : "") + w.title) + "</h3>" + (w.focus ? '<p class="fine">' + esc(w.focus) + "</p>" : "") +
      w.phases.map(ph => '<div class="app-phase">' + esc(ph.title) + "</div>" + ph.items.map(item).join("")).join("") + "</section>").join("");
    return page(rec.title, T("app.preview.eyebrow"), "#plans",
      '<p class="app-lead">' + esc(T("app.preview.meta", { s: cov.sessions, e: cov.items })) + "</p>" +
      '<div class="note" id="coverage"><span class="eyebrow">' + esc(T(cov.freeCount ? "app.preview.partialTitle" : "app.preview.fullTitle")) + "</span>" +
        esc(cov.freeCount ? T("app.preview.partial", { n: cov.freeCount, tot: cov.items, names }) : T("app.preview.full", { tot: cov.items })) + "</div>" +
      '<p class="app-disclaimer" id="disclaimer">' + esc(T("disclaimer.aiGenerated")) + "</p>" +
      '<div class="app-actions"><button class="btn" type="button" data-play="' + esc(id) + '">' + esc(T("app.preview.try")) + '</button><button class="btn ghost" type="button" data-go="#unlock/' + esc(enc(id)) + '">' +
        esc(T("app.preview.unlock", { price: T("app.price") })) + "</button></div>" +
      '<div class="plan app-outline">' + list + "</div>");
  }
  async function sblocca(id) {
    return page(T("app.unlock.title"), T("app.preview.eyebrow"), "#preview/" + enc(id),
      '<p class="app-lead">' + esc(T("app.unlock.lead")) + '</p><p class="app-disclaimer">' + esc(T("disclaimer.aiGenerated")) + "</p>" +
      '<div class="app-actions"><button class="btn ghost" type="button" data-go="#preview/' + esc(enc(id)) + '">' + esc(T("app.unlock.back")) + "</button></div>");
  }

  /* ---- indirizzi ed eventi ---- */
  const VIEWS = { "": lista, plans: lista, bank: banco, settings: impostazioni, review: revisione, preview: anteprima, unlock: sblocca };
  async function route() {
    const h = decodeURIComponent(location.hash.slice(1)), parts = h.split("/"), view = VIEWS[parts[0]] || lista;
    try { $app().innerHTML = await view(parts.slice(1).join("/")); }
    catch (e) { $app().innerHTML = page(T("app.error.title"), "", "#plans", '<p class="app-lead">' + esc(T("app.error.text", { msg: e.message })) + "</p>"); }
    document.documentElement.lang = App.lang();
  }
  async function onClick(e) {
    const t = e.target.closest("button"); if (!t || t.disabled) return;
    const d = t.dataset, segBox = t.parentElement && t.parentElement.dataset.group ? t.parentElement : null;
    if (!d.del) state.pendingDelete = null;
    if (segBox) {
      const v = segBox.dataset.group === "audio" ? Number(d.v) : d.v;
      if (segBox.dataset.group === "audio") D.audio.set({ [segBox.dataset.key]: v }); else { D.settings.set({ [segBox.dataset.key]: v }); App.applyTheme(); }
      return route();
    }
    if (d.go) return go(d.go);
    if (d.open) return open(d.open);
    if (d.play) { location.href = "index.html?p=" + enc(d.play); return; }
    if (d.del) return remove(d.del);
    if (d.import != null) {
      const x = state.catalog[Number(d.import)];
      state.busy = x.title; route();
      try {
        const rec = await importa(x, d.kind);
        state.busy = null;
        if (rec.kind === "preview") return go("#preview/" + enc(rec.id));
        return go(RV.playable(rec) ? "#plans" : "#review/" + enc(rec.id));
      } catch (err) { state.busy = null; $app().innerHTML = page(T("app.error.title"), "", "#bank", '<p class="app-lead">' + esc(T("app.error.text", { msg: err.message })) + "</p>"); return; }
    }
    if (d.fix) { state.openKey = d.fix; state.error = null; return route(); }
    if (d.cancel) { state.openKey = null; state.error = null; return route(); }
    if (d.confirm) return reviewAction("confirm", d.confirm);
    if (d.save) return reviewAction("save", d.save);
    if (d.conclude) {
      const rec = await D.get(d.conclude);
      if (RV.concludi(rec)) { await D.put(rec); location.href = "index.html?p=" + enc(rec.id); }
      return;
    }
  }
  function onChange(e) {
    if (e.target.dataset.setting !== "lang") return;
    D.settings.set({ lang: e.target.value });
    route();
  }
  function avvia() {
    const box = $app();
    box.addEventListener("click", e => { onClick(e).catch(err => console.error(err)); });
    box.addEventListener("change", onChange);
    window.addEventListener("hashchange", () => { state.openKey = null; state.error = null; route().then(() => window.scrollTo(0, 0)); });
    return route();
  }

  App.viste = { avvia, route, importa, registra };
})(globalThis.WorkoutPlayerApp = globalThis.WorkoutPlayerApp || {});
