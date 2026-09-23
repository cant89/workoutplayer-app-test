#!/usr/bin/env python3
"""Piano di prova per la revisione e l'anteprima (T2): SINTETICO, per i test dell'app, senza schede di terzi.
Parte dalla generazione del banco `banco/generati-v1/giro3/whatsapp-scheda/1/plan.json` (scheda sintetica, nessuna persona
vera) e aggiunge, dichiaratamente, i casi che la revisione deve saper trattare:
  - panca piana (primo esercizio della prima seduta, quindi anche nell'anteprima): serie incerte, letture in disaccordo 4 / 3;
    scalata con il numero di serie che la portano (1 = l'ultima);
  - plank laterale: durata "30 - 45’" (apice = minuti per la convenzione; per una tenuta fa pensare ai secondi), incerta;
  - curl su fitball: recupero senza riga del documento (dedotto), incerto;
  - circuito finale nuovo (2 giri, piegamenti e crunch), con le serie per giro scritte (1).
Le righe aggiunte del documento sono marcate "[prova sintetica]". Il piano per la libreria (`plan.json`) lo produce il
convertitore del generatore (`generator/converti_v1.py`, importato e non modificato), come in produzione; `dati.json` sono i
dati con provenienza e certezza (schema wp-plan/1). Nessuno script di composizione: il player usa il rendering di riserva.
Uso: python3 plans/prova-revisione/crea.py"""
import copy
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "generator"))
import converti_v1  # noqa: E402

SRC = ROOT / "banco/generati-v1/giro3/whatsapp-scheda/1/plan.json"


def num(valore, tipo, unita, scritto, fonte, certezza, letture, **extra):
    n = {"valore": valore, "tipo": tipo, "unita": unita, "scritto": scritto, "unita_scritta": extra.pop("unita_scritta", None),
         "fonte": fonte, "certezza": certezza, "letture": letture}
    n.update(extra)
    return n


def main():
    d = json.loads(SRC.read_text())
    d["id"] = "prova-revisione"
    d["titolo"] = "Scheda di prova per la revisione"
    d["chiave_memoria"] = "workoutplayer-prova-revisione"
    d["fonti"]["d1:r90"] = {"doc": "d1", "riga": 90, "testo": "[prova sintetica] Core: plank laterale 30 - 45’ per lato, rec 30''"}
    d["fonti"]["d1:r91"] = {"doc": "d1", "riga": 91, "testo": "[prova sintetica] Circuito finale, 2 giri: piegamenti 1x10, crunch 1x15"}
    s = d["sedute"][0]
    fasi = {ph["id"]: ph for ph in s["fasi"]}

    panca = fasi["petto"]["voci"][0]
    panca["serie"].update({"certezza": "bassa", "letture": [4, 3], "motivo": "letture in disaccordo: A «4», B «3»"})
    panca["scalate"]["serie"] = num(1, "serie", "serie", "finale", "d1:r2", "media", [1])

    plank = fasi["core"]["voci"][0]
    rng = dict(tipo="tempo", unita="s", scritto="30 - 45’", fonte="d1:r90", certezza="bassa", unita_scritta="’",
               normalizzazione="’ = minuti (convenzione degli apici) → secondi",
               motivo="unità ambigua: «30 - 45’» per la convenzione degli apici sono minuti, su una tenuta fanno pensare ai secondi")
    plank["durata"] = {"min": num(1800, letture=[1800], **rng), "max": num(2700, letture=[2700], **rng), "testo": "30 - 45’"}
    plank["fonti"] = plank.get("fonti", []) + ["d1:r90"]

    curl = fasi["femorali"]["voci"][0]
    curl["recupero"] = num(60, "recupero", "s", "", None, "bassa", [60], motivo="dedotto: nessuna riga del documento lo scrive")
    del curl["recupero"]["fonte"]

    d["esercizi"]["piegamenti"] = {"nome": "Piegamenti", "nome_esteso": "Piegamenti sulle braccia", "attrezzi": "",
                                   "istruzioni": ["Mani sotto le spalle, corpo in linea", "Scendi fino a sfiorare il pavimento e risali"], "fonti": ["d1:r91"]}
    d["esercizi"]["crunch"] = {"nome": "Crunch", "nome_esteso": "Crunch a terra", "attrezzi": "",
                               "istruzioni": ["Schiena a terra, ginocchia piegate", "Solleva le spalle espirando"], "fonti": ["d1:r91"]}
    voce = lambda ex, reps: {"esercizio": ex, "modo": "ripetizioni", "serie": num(1, "serie", "serie", "1x", "d1:r91", "alta", [1, 1]),
                             "ripetizioni": num(reps, "ripetizioni", "rip", str(reps), "d1:r91", "alta", [reps, reps]), "fonti": ["d1:r91"]}
    s["fasi"].append({"id": "finale", "titolo": "Circuito finale", "note": [], "flusso": "circuito",
                      "giri": num(2, "giri", "giri", "2 giri", "d1:r91", "alta", [2, 2]), "fonti": ["d1:r91"],
                      "voci": [voce("piegamenti", 10), voce("crunch", 15)]})

    (HERE / "dati.json").write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
    lib = converti_v1.a_libreria(copy.deepcopy(d))
    (HERE / "plan.json").write_text(json.dumps(lib, ensure_ascii=False, indent=1) + "\n")
    print("scritti", (HERE / "dati.json").relative_to(ROOT), (HERE / "plan.json").relative_to(ROOT))


if __name__ == "__main__":
    main()
