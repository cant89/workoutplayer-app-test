/* WorkoutPlayer · componente: scaletta (tutte le voci della seduta, fatte / in corso, salto a una voce). Da src/app3.js:75-83.
   Una voce senza passi propri (fase resa come un solo passo libero) punta ai passi della sua fase. */
(function (WP) {
  "use strict";
  WP.modules.list = function (R) {
    const { $, esc } = WP.util;
    const EX = R.EX;
    const indexes = pred => R.STEPS.map((s, i) => (pred(s) ? i : -1)).filter(i => i >= 0);
    function renderList() {
      const STEPS = R.STEPS, cur = R.cur;
      $("listBody").innerHTML = R.W.phases.map((ph, pi) => '<div class="sl-phase">' + esc(ph.title) + "</div>" + ph.items.map((it, ii) => {
        let idxs = indexes(s => s.pi === pi && s.ii === ii);
        if (!idxs.length) idxs = indexes(s => s.pi === pi && s.type !== "gate");
        const now = idxs.includes(cur.idx), done = !now && idxs[idxs.length - 1] < cur.idx;
        const target = ph.flow === "circuit" && STEPS[cur.idx].pi === pi ? (idxs.find(i => STEPS[i].round === (STEPS[cur.idx].round || 1)) ?? idxs[0]) : idxs[0];
        return '<button type="button" class="sl-item' + (now ? " now" : done ? " done" : "") + '" data-jump="' + target + '"><span>' + esc(EX[it.ex].name) + "</span><span>" + esc(R.itemSummary(it, ph)) + "</span></button>";
      }).join("")).join("");
    }
    return { renderList };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
