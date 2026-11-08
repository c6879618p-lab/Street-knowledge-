#!/usr/bin/env python3
"""Generate Android + iOS icons and splash screens from the PWA icon (icons/icon-512.png). Needs Pillow."""
import os, glob
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = Image.open(os.path.join(ROOT, 'www/icons/icon-512.png')).convert('RGBA')
BG = src.getpixel((8, 8))[:3]
big = src.resize((1024, 1024), Image.LANCZOS)
# white arrow on transparency for adaptive-icon foreground
fg = Image.new('RGBA', big.size, (0, 0, 0, 0)); px = big.load(); fpx = fg.load()
for y in range(big.height):
    for x in range(big.width):
        r, g, b, a = px[x, y]; w = min(r, g, b)
        lum = max(0, min(255, int((w - BG[2] * 0 - 120) * 255 / 135))) if w > 120 else 0
        if lum: fpx[x, y] = (255, 255, 255, lum)
res = os.path.join(ROOT, 'android/app/src/main/res')
dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in dens.items():
    os.makedirs(f'{res}/mipmap-{d}', exist_ok=True)
    s = int(48 * k); big.convert('RGB').resize((s, s), Image.LANCZOS).save(f'{res}/mipmap-{d}/ic_launcher.png')
    # round icon
    m = Image.new('L', (s * 4, s * 4), 0); from PIL import ImageDraw; ImageDraw.Draw(m).ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255); m = m.resize((s, s), Image.LANCZOS)
    r = big.resize((s, s), Image.LANCZOS); r.putalpha(m); r.save(f'{res}/mipmap-{d}/ic_launcher_round.png')
    # adaptive foreground: 108dp canvas, artwork in the central ~60%
    fs = int(108 * k); canvas = Image.new('RGBA', (fs, fs), (0, 0, 0, 0)); a = int(fs * 0.62)
    canvas.paste(fg.resize((a, a), Image.LANCZOS), ((fs - a) // 2, (fs - a) // 2)); canvas.save(f'{res}/mipmap-{d}/ic_launcher_foreground.png')
with open(f'{res}/values/ic_launcher_background.xml', 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#%02X%02X%02X</color>\n</resources>\n' % BG)
def splash(w, h, path):
    im = Image.new('RGB', (w, h), BG); a = int(min(w, h) * 0.28)
    im.paste(fg.resize((a, a), Image.LANCZOS), ((w - a) // 2, (h - a) // 2), fg.resize((a, a), Image.LANCZOS)); im.save(path)
for p in glob.glob(f'{res}/drawable*/splash.png'):
    w, h = Image.open(p).size; splash(w, h, p)
ios = os.path.join(ROOT, 'ios/App/App/Assets.xcassets')
big.convert('RGB').save(f'{ios}/AppIcon.appiconset/AppIcon-512@2x.png')
for p in glob.glob(f'{ios}/Splash.imageset/*.png'): splash(2732, 2732, p)
print('icons + splash generated, background', BG)
