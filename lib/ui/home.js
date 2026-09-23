/* WorkoutPlayer · componente: home (scelta della seduta con "ultima volta", ripresa della seduta in corso).
   Da src/app2.js:25-51. Lettera o icona di ogni seduta dai dati (workout.letter, workout.icon); il sottotitolo (focus)
   solo se c'è. T2: parole dalla lingua dell'interfaccia; la seduta in corso si riprende anche con la sequenza di riserva
   (R.locate) e con le serie aggiunte o tolte (R.sessionSteps). */
(function (WP) {
  "use strict";
  const ICONS = {
    run: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="30" cy="8" r="4"/><path d="M14 22l8-6 7 3 4 7 7 2M22 16l-3 12 8 6-2 10M19 28l-5 8-8 1"/></svg>'
  };
  WP.modules.home = function (R) {
    const { $, esc } = WP.util;
    const S = R.S, EX = R.EX, WORKOUTS = R.WORKOUTS, T = R.t;
    function lastText(id) {
      const t = S.last[id]; if (!t) return T("home.never");
      const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
      return T("home.last", { when: days <= 0 ? T("home.today") : days === 1 ? T("home.yesterday") : T("home.daysAgo", { n: days }) });
    }
    function renderHome() {
      $("choices").innerHTML = Object.keys(WORKOUTS).map(id => {
        const w = WORKOUTS[id];
        return '<button class="choice" type="button" data-w="' + esc(id) + '">' +
          '<span class="letter">' + (w.icon && ICONS[w.icon] ? ICONS[w.icon] : esc(w.letter || "")) + "</span>" +
          '<span><strong class="t">' + esc(w.title) + "</strong>" + (w.focus ? '<span class="focus">' + esc(w.focus) + "</span>" : "") +
          '<span class="meta">' + esc(T("home.about", { n: R.estimateMinutes(w) })) + " · " + esc(lastText(id)) + "</span></span>" +
          '<span class="go" aria-hidden="true">›</span></button>';
      }).join("");
      const ses = S.session, box = $("resume");
      if (R.resumable(ses)) {
        const w = WORKOUTS[ses.wid], steps = R.sessionSteps(ses), loc = R.locate(ses, steps), st = steps[loc.idx];
        const it = st.ii != null ? w.phases[st.pi].items[st.ii] : null;
        box.hidden = false;
        box.innerHTML = "<div><strong>" + esc(T("resume.title", { title: w.title })) + "</strong><span>" + esc(w.phases[st.pi].title + (it ? " · " + EX[it.ex].name : "")) +
          '</span></div><div class="row"><button type="button" id="resNo">' + T("btn.discard") + '</button><button type="button" class="solid" id="resYes">' + T("btn.resume") + "</button></div>";
        $("resYes").onclick = () => { R.unlockAudio(); R.startWorkout(ses.wid, loc.idx, ses.startedAt, ses.counts, ses); };
        $("resNo").onclick = () => { S.session = null; R.store.save(); renderHome(); };
      } else box.hidden = true;
    }
    return { lastText, renderHome };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
