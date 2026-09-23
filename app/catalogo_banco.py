#!/usr/bin/env python3
"""Catalogo dei piani del banco per la schermata "Aggiungi dal banco" dell'app (T2, solo prove: in produzione i piani
arrivano dal server, T3). Scrive dist/banco-catalogo.json con, per ogni piano:
  id, dir (cartella dalla radice del repository), title, lang, api, sessions, exercises,
  lib (file del piano per la libreria), data (dati con provenienza e certezza, schema wp-plan/1, se ci sono),
  compose (script di composizione, se c'è), images (ritagli in images/), uncertain (numeri a certezza "bassa").
Piani: le generazioni consegnate del giro 3 del banco v1 (banco/generati-v1/giro3/<documento>/1/) e i piani di plans/
(cantelli = l'artifact del titolare, prova-v1 = piano sintetico con tutti i componenti). Nessuna chiamata a modelli.
Le cartelle con i piani delle schede di terzi sono fuori da git: se mancano, il catalogo non le elenca.
Uso: python3 app/catalogo_banco.py"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = {".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg"}


def bassa(o):
    if isinstance(o, dict):
        return (1 if o.get("certezza") == "bassa" else 0) + sum(bassa(v) for v in o.values())
    if isinstance(o, list):
        return sum(bassa(v) for v in o)
    return 0


def voce(d, lib_file, data_file, gruppo):
    lib = json.loads((d / lib_file).read_text())
    data = json.loads((d / data_file).read_text()) if data_file else None
    imgs = sorted(f.name for f in (d / "images").iterdir() if f.suffix.lower() in IMG) if (d / "images").is_dir() else []
    rel = d.relative_to(ROOT).as_posix()
    return {
        "id": rel.replace("banco/generati-v1/", "").replace("/", "-"), "dir": rel, "group": gruppo,
        "title": lib.get("title", rel), "lang": lib.get("lang", ""), "api": lib.get("api", "v0"),
        "sessions": len(lib["workouts"]), "exercises": len(lib["exercises"]),
        "lib": lib_file, "data": data_file, "compose": "compose.js" if (d / "compose.js").is_file() else None,
        "images": imgs, "uncertain": bassa(data) if data else 0,
    }


def main():
    out = []
    for d in sorted((ROOT / "banco/generati-v1/giro3").glob("*/1")):
        if (d / "libreria.json").is_file() and (d / "plan.json").is_file():
            out.append(voce(d, "libreria.json", "plan.json", "banco"))
    for name in ("cantelli", "prova-v1"):
        d = ROOT / "plans" / name
        if (d / "plan.json").is_file():
            out.append(voce(d, "plan.json", None, "plans"))
    target = ROOT / "dist" / "banco-catalogo.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps({"piani": out}, ensure_ascii=False, indent=1) + "\n")
    print(target.relative_to(ROOT), len(out), "piani;", sum(1 for x in out if x["uncertain"]), "con valori incerti")


if __name__ == "__main__":
    main()
