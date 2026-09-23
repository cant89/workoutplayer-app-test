/* WorkoutPlayer · componente: anteprima della seduta (periodo, durata prevista, fasi, serie, scaletta per fase).
   Da src/app1.js:42 e src/app2.js:53-64. Il periodo si legge da workout.periodLabel + workout.period; i campi assenti non
   mostrano nulla. Piani v1: un riepilogo lungo va a capo (classe "long") invece di uscire dalla riga. */
(function (WP) {
  "use strict";
  WP.modules.preview = function (R) {
    const { $, esc } = WP.util;
    const T = R.t;
    const rowsHTML = ph => R.phaseRows(ph).map(r => '<div class="row' + (R.v1 && String(r[1]).length > 22 ? " long" : "") + '"><span>' + esc(r[0]) + "</span><span>" + esc(r[1]) + "</span></div>").join("");
    function renderPreview(id) {
      const w = R.WORKOUTS[id];
      $("pvPeriod").textContent = [w.periodLabel, w.period].filter(Boolean).join(" ");
      $("pvTitle").textContent = w.title; $("pvFocus").textContent = w.focus || "";
      $("pvStats").innerHTML = "<div><b>~" + R.estimateMinutes(w) + "′</b><span>" + T("stats.duration") + "</span></div><div><b>" + w.phases.length +
        "</b><span>" + T("stats.phases") + "</span></div><div><b>" + R.countSets(w) + "</b><span>" + T("stats.sets") + "</span></div>";
      $("pvPlan").innerHTML = w.phases.map(ph => "<section><h3>" + esc(ph.title) + (ph.optional ? " · " + T("pv.optional") : "") + "</h3>" +
        rowsHTML(ph) + "</section>").join("");
      $("pvStart").onclick = () => { R.unlockAudio(); R.startWorkout(id, 0, Date.now()); };
      R.show("preview");
    }
    return { rowsHTML, renderPreview };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
