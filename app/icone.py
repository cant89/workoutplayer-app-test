#!/usr/bin/env python3
"""Icone della PWA WorkoutPlayer, disegnate qui con Pillow. Disegno scelto dal titolare il 24/09/2026: tre dischi da
manubrio a scalare (dal più alto al più basso) che insieme formano il triangolo del "play", senza barra; fondo scuro dei
token (--bg scuro #0E1113) e dischi nel colore del lavoro (--work scuro #FF6B2C). Stesse coordinate di
lab/prova-domanda/icons/favicon.svg (griglia 100 × 100, dischi spostati a destra per il centro ottico del triangolo).
Scrive in app/icons/: icon-192.png, icon-512.png (angoli arrotondati, purpose "any"), icon-maskable-512.png (a pieno
campo, disegno dentro la zona sicura dell'80 %), apple-touch-icon.png (180 px, a pieno campo: iOS arrotonda da sé).
Uso: python3 app/icone.py (serve Pillow; su questo Mac c'è in /usr/local/bin/python3)"""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent / "icons"
BG, WORK = (14, 17, 19, 255), (255, 107, 44, 255)
SS = 4  # sovracampionamento per bordi puliti
# Dischi (x, y, larghezza, altezza) nella griglia 100 × 100, raggio degli angoli 4,5.
DISCHI = [(32, 19, 14, 62), (50, 29, 13, 42), (67, 39, 12, 22)]
RAGGIO = 4.5


def draw(size, rounded, scale):
    n = size * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, n - 1, n - 1], fill=BG)
    u = n / 100
    for x, y, w, h in DISCHI:  # "scale" rimpicciolisce il disegno attorno al centro (zona sicura delle icone maskable)
        x0, y0 = 50 + (x - 50) * scale, 50 + (y - 50) * scale
        x1, y1 = 50 + (x + w - 50) * scale, 50 + (y + h - 50) * scale
        d.rounded_rectangle([x0 * u, y0 * u, x1 * u, y1 * u], radius=RAGGIO * scale * u, fill=WORK)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    draw(192, True, 1).save(OUT / "icon-192.png")
    draw(512, True, 1).save(OUT / "icon-512.png")
    draw(512, False, 0.8).save(OUT / "icon-maskable-512.png")
    draw(180, False, 0.9).convert("RGB").save(OUT / "apple-touch-icon.png")
    print("icone scritte in", OUT)


if __name__ == "__main__":
    main()
