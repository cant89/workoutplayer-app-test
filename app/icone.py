#!/usr/bin/env python3
"""Icone della PWA WorkoutPlayer (T2), disegnate qui con Pillow: fondo scuro dei token (--bg scuro #0E1113), arco del
quadrante del player nel colore del lavoro (--work scuro #FF6B2C) e un triangolo "play" (--ink scuro #F0F3EE).
Scrive in app/icons/: icon-192.png, icon-512.png (angoli arrotondati, purpose "any"), icon-maskable-512.png (a pieno
campo, disegno dentro la zona sicura dell'80 %), apple-touch-icon.png (180 px, a pieno campo: iOS arrotonda da sé).
Uso: python3 app/icone.py"""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent / "icons"
BG, WORK, INK = (14, 17, 19, 255), (255, 107, 44, 255), (240, 243, 238, 255)
SS = 4  # sovracampionamento per bordi puliti


def draw(size, rounded, scale):
    n = size * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, n - 1, n - 1], fill=BG)
    c, r = n / 2, n * 0.34 * scale          # centro e raggio dell'arco
    w = max(2, int(n * 0.085 * scale))      # spessore dell'arco
    d.arc([c - r, c - r, c + r, c + r], start=-90, end=180, fill=WORK, width=w)   # tre quarti di quadrante, dall'alto
    t = n * 0.16 * scale                     # triangolo "play", spostato a destra per il centro ottico
    x0 = c - t * 0.55
    d.polygon([(x0, c - t), (x0, c + t), (x0 + t * 1.75, c)], fill=INK)
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
