/* WorkoutPlayer · componente: schermata finale (tempo totale, serie e blocchi, messaggio di chiusura della seduta).
   Da src/app2.js:154-157. Il messaggio viene dai dati (workout.doneMsg).
   T2, con il diario (R.features.diary): "serie fatte" al posto di "serie e blocchi" e il diario della seduta, voce per voce
   (carico e ripetizioni di ogni serie, durata delle serie a tempo; "+" = serie aggiunta da te), con le serie aggiunte e tolte.
   T2 passo 9 (piani v1): il recupero scritto dopo l'ultima serie della seduta, che non si esegue, si dice sotto il messaggio. */
(function (WP) {
  "use strict";
  WP.modules.done = function (R) {
    const { $, esc, durText } = WP.util;
    const T = R.t;
    // una serie del diario in poche lettere: "62,5 kg × 10", "× 8", "45 s", "blocco: 4 giri"
    function setText(e) {
      let s = "";
      if (e.secs != null) s = durText(e.secs);
      else if (e.type === "work") s = (typeof e.kg === "number" ? R.fmtKg(e.kg) + " kg " : "") + "× " + (e.reps == null ? "—" : e.reps);
      else if (e.type === "block") s = e.rounds != null ? T("diary.rounds", { n: e.rounds }) : T("diary.block");
      else s = T("diary.free");
      return (e.extra ? "+ " : "") + s;
    }
    function diaryHTML(log) {
      const W = R.W, groups = [];
      log.sets.forEach(e => {
        const key = e.pi + "/" + (e.ii == null ? "" : e.ii);
        let g = groups.find(x => x.key === key);
        if (!g) { g = { key, name: e.ii != null ? R.EX[W.phases[e.pi].items[e.ii].ex].name : W.phases[e.pi].title, sets: [] }; groups.push(g); }
        g.sets.push(setText(e));
      });
      const added = log.edits.filter(e => e.type === "add").length, removed = log.edits.filter(e => e.type === "remove").length;
      return '<div class="plan"><section><h3>' + T("diary.title") + "</h3>" +
        groups.map(g => '<div class="row long"><span>' + esc(g.name) + "</span><span>" + esc(g.sets.join(" · ")) + "</span></div>").join("") +
        (added || removed ? '<p class="fine">' + esc(T("diary.edits", { added, removed })) + "</p>" : "") + "</section></div>";
    }
    // T2 passo 9: un recupero scritto dopo l'ultima serie della seduta (lib/engine/steps.js, endRest) non si esegue, ma si dice qui
    function paintEndRest(st) {
      let p = $("doneRest");
      if (!st) { if (p) p.remove(); return; }
      if (!p) { p = document.createElement("p"); p.className = "fine"; p.id = "doneRest"; $("doneMsg").after(p); }
      const ph = R.W.phases[st.pi], it = ph.items[st.ii], secs = WP.v1.restSeconds(ph, st.ii, st.round || 1);
      p.textContent = T("done.lastRest", { what: R.EX[it.ex].name, rest: secs ? durText(secs) : it.restText });
    }
    function renderDone(mins) {
      const W = R.W, log = R.features.diary ? R.lastLog : null;
      const setsDone = log ? new Set(log.sets.filter(e => e.type !== "block").map(e => e.pi + "." + e.ii + "." + e.set + "." + e.round)).size + log.sets.filter(e => e.type === "block").length : 0;
      $("doneKicker").textContent = [W.title, W.focus].filter(Boolean).join(" · ");
      $("doneStats").innerHTML = "<div><b>" + mins + "′</b><span>" + T("stats.total") + "</span></div>" +
        (log ? "<div><b>" + setsDone + "</b><span>" + T("stats.setsDone") + "</span></div>" : "<div><b>" + R.countSets(W) + "</b><span>" + T("stats.sets") + "</span></div>");
      $("doneMsg").textContent = W.doneMsg || "";
      paintEndRest(R.v1 ? WP.v1.endRest(W, R.STEPS) : null);
      const box = $("doneDiary");
      if (box) { box.innerHTML = log && log.sets.length ? diaryHTML(log) : ""; box.hidden = !box.innerHTML; }
      R.show("done");
    }
    return { renderDone };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
