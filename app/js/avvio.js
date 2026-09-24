/* WorkoutPlayer · app: avvio (T2).
   1. tema (chiaro / scuro / automatico) e lingua dell'interfaccia (impostazione, altrimenti la prima lingua del browser
      fra le cinque, altrimenti inglese);
   2. la libreria: i file di ../lib/manifest.json nell'ordine (un solo elenco per app, pagine di prova e test);
   3. service worker (solo in contesto sicuro: https o localhost);
   4. index.html?p=<id> → player del piano (un caricamento di pagina per piano: la libreria parte una volta per pagina), nella
      lingua della scheda se è una delle cinque, o in quella dell'app se l'utente lo sceglie (App.playerLang, #61);
      altrimenti le viste dell'app (app/js/viste.js), guidate dall'indirizzo dopo "#".
   Il player di un piano "da rivedere" non si apre (D-U7): si torna alla revisione. */
(function (App) {
  "use strict";
  const WP = () => globalThis.WorkoutPlayer;
  const D = App.deposito;

  App.lang = () => { const s = D.settings.get().lang; return WP().i18n.code(s) || WP().i18n.pick(navigator.languages || [navigator.language]); };
  // lingua del player (T2 passo 9, decisione del titolare #61): durante l'allenamento quella della scheda, se è una delle cinque,
  // voce compresa; con "Lingua del player: dell'app" nelle impostazioni, o con una scheda in un'altra lingua, quella dell'app
  App.playerLang = planLang => (D.settings.get().playerLang !== "app" && WP().i18n.code(planLang)) || App.lang();
  App.t = (key, p) => WP().i18n.t(App.lang(), key, p);
  App.applyTheme = () => {
    const th = D.settings.get().theme, el = document.documentElement;
    if (th === "light" || th === "dark") el.dataset.theme = th; else delete el.dataset.theme;
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = () => reject(new Error(src));
      document.body.appendChild(s);
    });
  }
  async function loadLib(withShell) {
    const base = "../lib/", m = await (await fetch(base + "manifest.json")).json();
    await Promise.all(m.js.map(f => loadScript(base + f))); // async=false: si eseguono nell'ordine del manifest
    if (withShell) document.getElementById("wp").innerHTML = await (await fetch(base + m.html)).text();
  }

  // il player di un piano del deposito
  async function play(id) {
    const rec = await D.get(id);
    if (!rec) { location.replace("index.html"); return; }
    if (!App.revisione.playable(rec)) { location.replace("index.html#review/" + encodeURIComponent(id)); return; }
    const piano = rec.kind === "plan";
    const plan = piano ? App.revisione.applica(rec) : rec.lib;
    document.title = plan.title + " · WorkoutPlayer";
    document.getElementById("app").hidden = true;
    // tutto ciò che sta nella pagina del player è nella lingua del player (App.playerLang); i menu dell'app nella lingua dell'app
    const pl = App.playerLang(plan.lang), Tp = (k, p) => WP().i18n.t(pl, k, p);
    document.documentElement.lang = pl;
    const marks = piano ? App.revisione.segni(rec, pl) : {};
    (rec.unverified || []).forEach(u => { (marks[u.k] = marks[u.k] || []).push({ field: u.field, state: "unverified", value: App.revisione.testoCampo(u.c, null, pl) }); });
    const R = await WP().start({
      plan, images: rec.images || {}, composeSource: piano ? rec.compose : null,
      lang: pl, settingsKey: D.AUDIO_KEY, diary: true, editSets: true, marks
    });
    App.runtime = R; // per le prove in headless
    const wrap = document.querySelector("#home .wrap"), back = document.createElement("button");
    back.className = "back"; back.type = "button"; back.textContent = Tp("app.back.plans");
    back.onclick = () => { location.href = piano ? "index.html" : "index.html#preview/" + encodeURIComponent(id); };
    wrap.prepend(back);
    if (!piano) {
      const note = document.createElement("div");
      note.className = "note"; note.innerHTML = '<span class="eyebrow"></span>';
      note.firstChild.textContent = Tp("app.preview.eyebrow"); note.append(Tp("app.preview.playerNote"));
      wrap.querySelector(".masthead").after(note);
    }
  }

  function registerSW() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("sw.js").catch(() => { /* senza service worker l'app funziona con la rete */ });
  }

  async function main() {
    App.applyTheme();
    const id = new URLSearchParams(location.search).get("p");
    await loadLib(!!id);
    document.documentElement.lang = App.lang();
    registerSW();
    if (id) await play(id); else App.viste.avvia();
  }
  App.ready = main().catch(e => {
    const box = document.getElementById("app");
    box.hidden = false;
    box.textContent = "WorkoutPlayer: " + e.message;
    console.error(e);
  });
})(globalThis.WorkoutPlayerApp = globalThis.WorkoutPlayerApp || {});
