"""Regenerate platform icons from Flaticon 1373067 (Pillow, development only).
Run from web/: python3 scripts/generate-app-icons.py
Attribution and source: public/asset-licenses.txt.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'public/icons/blueprint-1373067.png').convert('RGBA')
res = root / 'android/app/src/main/res'

def icon(size, fraction=1, background=None, circle=False):
    out = Image.new('RGBA', (size, size))
    if background:
        if circle:
            ImageDraw.Draw(out).ellipse((0, 0, size-1, size-1), fill=background)
        else:
            out.paste(background, (0, 0, size, size))
    edge = round(size*fraction)
    out.alpha_composite(source.resize((edge, edge), Image.Resampling.LANCZOS), ((size-edge)//2, (size-edge)//2))
    return out

for size in (192, 512):
    icon(size, .82, '#121c2c').save(root / f'public/icons/icon-{size}.png')
icon(32).save(root / 'public/icons/favicon-32.png')
(root / 'assets').mkdir(exist_ok=True)
icon(256, .82, '#121c2c').save(root / 'assets/icon.ico', sizes=[(n,n) for n in (16,24,32,48,64,128,256)])
for density, scale in [('mdpi',1),('hdpi',1.5),('xhdpi',2),('xxhdpi',3),('xxxhdpi',4)]:
    folder = res / f'mipmap-{density}'
    for name, fraction, bg, circle, dp in [
        ('ic_launcher', .82, '#121c2c', False, 48),
        ('ic_launcher_round', .72, '#121c2c', True, 48),
        ('ic_launcher_foreground', .60, None, False, 108),
    ]:
        icon(round(dp*scale), fraction, bg, circle).save(folder / f'{name}.png')
# Native startup uses a static frame of the same CSS pattern (no WebView yet).
# The checked-in frame is captured from splash.css with animations paused.
background = Image.open(root / 'assets/splash-pattern.png').convert('RGBA')
for target in res.glob('drawable*/splash.png'):
    size = Image.open(target).size
    out = ImageOps.fit(background, size, Image.Resampling.LANCZOS)
    edge = round(min(size)*.24)
    out.alpha_composite(source.resize((edge,edge), Image.Resampling.LANCZOS), ((size[0]-edge)//2,(size[1]-edge)//2))
    out.convert('RGB').quantize(colors=256).save(target, optimize=True)
