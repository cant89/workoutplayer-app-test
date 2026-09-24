/* WorkoutPlayer · componenti: le viste dello scheletro (lib/shell.html) e i testi del piano che vi entrano.
   Da src/app2.js:5-6 e dai testi fissi di src/body.html (intestazione e regole del trainer, ora nei dati del piano).
   T2: le parole fisse dello scheletro non stanno in shell.html ma nei file di lingua; shell.html indica la chiave con
   data-i18n (testo; se l'elemento ha figli, il primo nodo di testo), data-i18n-html (testo con markup dal file di lingua)
   e data-i18n-aria (aria-label). All'avvio il testo entra nella lingua scelta e gli attributi si tolgono: il DOM resta
   quello dell'artifact (parità, tests/parita-dom.pw.js). */
(function (WP) {
  "use strict";
  const ROOTS = ["home", "preview", "player", "done", "dlgList", "dlgAudio", "dlgExit"];
  WP.modules.shell = function (R) {
    const { $, esc } = WP.util;
    const views = ["home", "preview", "player", "done"];
    function show(id) { views.forEach(v => { $(v).hidden = v !== id; }); window.scrollTo(0, 0); }
    const scrollTop = () => window.scrollTo(0, 0);
    // T2: ridisegno del passo dopo un tocco che non cambia passo (serie, ripetizioni fatte, carico, pausa, giro contato): il
    // pulsante toccato resta nello stesso punto dello schermo (se il ridisegno non lo ha più, resta lo scroll di prima).
    // Il cambio di passo e l'apertura di un'altra vista tornano in cima (enter, show).
    function keepPlace(el, paint) {
      const key = JSON.stringify(el.dataset), same = () => [...$("stage").querySelectorAll("button")].filter(b => JSON.stringify(b.dataset) === key);
      const k = same().indexOf(el), top = el.getBoundingClientRect().top, y = window.scrollY;
      paint();
      const again = same()[k];
      if (!again) { if (window.scrollY !== y) window.scrollTo(0, y); return; }
      const d = Math.round(again.getBoundingClientRect().top - top);
      if (d) window.scrollBy(0, d);
    }
    const playerHidden = () => $("player").hidden;
    const pageHidden = () => document.visibilityState === "hidden";
    function setText(el, s) {
      if (!el.children.length) { el.textContent = s; return; }
      if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = s;
      else el.insertBefore(document.createTextNode(s), el.firstChild);
    }
    function translateShell() {
      ROOTS.map($).filter(Boolean).forEach(root => [root, ...root.querySelectorAll("*")].forEach(el => {
        if (el.hasAttribute("data-i18n")) { setText(el, R.t(el.getAttribute("data-i18n"))); el.removeAttribute("data-i18n"); }
        if (el.hasAttribute("data-i18n-html")) { el.innerHTML = R.t(el.getAttribute("data-i18n-html")); el.removeAttribute("data-i18n-html"); }
        if (el.hasAttribute("data-i18n-aria")) { el.setAttribute("aria-label", R.t(el.getAttribute("data-i18n-aria"))); el.removeAttribute("data-i18n-aria"); }
      }));
    }
    function fillShell() {
      translateShell();
      const rules = R.plan.rules || [];
      $("homeKicker").textContent = R.plan.kicker || "";
      $("rulesList").innerHTML = rules.map(r => "<li>" + esc(r) + "</li>").join("");
      $("rulesHead").hidden = $("rulesList").hidden = !rules.length;
    }
    return { show, scrollTop, keepPlace, playerHidden, pageHidden, fillShell };
  };
})(globalThis.WorkoutPlayer = globalThis.WorkoutPlayer || {});
