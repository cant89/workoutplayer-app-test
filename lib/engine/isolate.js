/* WorkoutPlayer · motore: lo script di composizione gira isolato (T0 passo 5a).

   Pagina ospite ── iframe sandbox="allow-scripts" (origine opaca: niente memoria, cookie, accesso all'ospite)
                    CSP: default-src 'none'; script-src 'sha256-<solo il runner>'; worker-src blob:
                    └── Worker da blob con: API dei passi + script del piano. Il Worker eredita origine opaca e CSP
                        (niente rete, niente eval), non ha DOM né location (non può navigare) e si termina allo scadere.
   L'ospite manda al runner il testo del Worker e il piano (postMessage); il runner risponde con { ok, steps | error }.
   L'ospite non esegue mai il testo dello script. Wake Lock, audio e voce restano dell'ospite.
   Perché un Worker e non lo script direttamente nell'iframe: nell'iframe uno script ostile può navigare il proprio
   riquadro verso un indirizzo qualsiasi portandosi dietro i dati (prova in T0-passo5a.md), e un ciclo infinito
   blocca il riquadro; nel Worker nessuna delle due cose è possibile e il ciclo si interrompe con terminate(). */
(function (WP) {
  "use strict";

  // Runner dell'iframe: l'unico script ammesso dalla CSP (per hash). Crea il Worker, lo ferma allo scadere, risponde una volta.
  function runner() {
    "use strict";
    var done = false;
    function reply(msg) { if (!done) { done = true; parent.postMessage(msg, "*"); } }
    addEventListener("message", function (e) {
      if (e.source !== parent || done || !e.data || e.data.type !== "compose") return;
      var d = e.data, w;
      try { w = new Worker(URL.createObjectURL(new Blob([d.worker], { type: "text/javascript" }))); }
      catch (err) { reply({ type: "result", ok: false, error: "Worker non disponibile: " + err.message }); return; }
      var timer = setTimeout(function () { w.terminate(); reply({ type: "result", ok: false, error: "tempo scaduto (" + d.timeoutMs + " ms)" }); }, d.timeoutMs);
      w.onmessage = function (ev) {
        clearTimeout(timer); w.terminate();
        var r = ev.data || {};
        reply({ type: "result", ok: r.ok === true, steps: r.steps, error: r.error });
      };
      w.onerror = function (ev) { ev.preventDefault(); clearTimeout(timer); w.terminate(); reply({ type: "result", ok: false, error: "errore dello script: " + ev.message }); };
      w.postMessage({ plan: d.plan });
    });
    parent.postMessage({ type: "ready" }, "*");
  }
  // Coda del Worker: chiama compose(plan, api) all'arrivo del piano, con l'API della versione del piano (plan.api), e restituisce i passi (o l'errore).
  function workerMain() {
    "use strict";
    self.onmessage = function (e) {
      var out;
      try { out = { ok: true, steps: compose(e.data.plan, WorkoutPlayer.api(e.data.plan.api)) }; }
      catch (err) { out = { ok: false, error: "errore dello script: " + (err && err.message ? err.message : String(err)) }; }
      try { self.postMessage(out); } catch (err) { self.postMessage({ ok: false, error: "passi non trasferibili: " + err.message }); }
    };
  }

  const RUNNER = "(" + runner.toString() + ")();";
  // hash SHA-256 (base64) di RUNNER: lo verifica tests/parita.test.js, che stampa quello giusto se il runner cambia
  const RUNNER_SHA256 = "dXMZB0lQ+D5V8wYzodaahB4bPEmtytIubWcVUnJSBoo=";
  const CSP = "default-src 'none'; script-src 'sha256-" + RUNNER_SHA256 + "'; worker-src blob:";
  const workerSource = composeSource => "var WorkoutPlayer = {};\n(" + WP.defineApi.toString() + ")(WorkoutPlayer);\n" +
    composeSource + "\n;(" + workerMain.toString() + ")();\n";

  /* Esegue lo script isolato. Risolve sempre (mai rifiuta): { ok: true, steps } oppure { ok: false, error }.
     timeoutMs vale per l'esecuzione nel Worker; l'ospite aspetta al massimo timeoutMs + 3 s anche se il riquadro non risponde. */
  function composeIsolated(plan, composeSource, timeoutMs) {
    timeoutMs = timeoutMs || 2000;
    return new Promise(resolve => {
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.hidden = true; frame.title = "Script del piano";
      frame.srcdoc = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '"><script>' + RUNNER + "</" + "script>";
      let settled = false;
      const finish = res => {
        if (settled) return;
        settled = true; clearTimeout(backstop); window.removeEventListener("message", onMessage); frame.remove(); resolve(res);
      };
      const onMessage = e => {
        if (e.source !== frame.contentWindow || !e.data) return;
        if (e.data.type === "ready") frame.contentWindow.postMessage({ type: "compose", worker: workerSource(composeSource), plan, timeoutMs }, "*");
        else if (e.data.type === "result") finish(e.data.ok ? { ok: true, steps: e.data.steps } : { ok: false, error: String(e.data.error || "errore sconosciuto") });
      };
      window.addEventListener("message", onMessage);
      const backstop = setTimeout(() => finish({ ok: false, error: "il riquadro isolato non ha risposto" }), timeoutMs + 3000);
      document.body.appendChild(frame);
    });
  }

  WP.isolation = { CSP, RUNNER, RUNNER_SHA256, workerSource };
  WP.composeIsolated = composeIsolated;
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
