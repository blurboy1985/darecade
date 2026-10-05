"""Compose unchanged Blender/game proof frames into labelled review sheets.

Requires Pillow. Arguments: before-directory after-directory output-directory.
Public reference images are never read or included.
"""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = map(Path, sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
families = ['rogue', 'mage', 'knight', 'barbarian']
names = ['Ranger', 'Academy bob', 'Twin tails', 'Grey curls']

def sheet(name, rows, width=300, height=300):
    canvas = Image.new('RGB', (len(rows[0])*width, len(rows)*(height+38)), '#f5f4ef')
    draw = ImageDraw.Draw(canvas)
    for y, row in enumerate(rows):
        for x, (label, path) in enumerate(row):
            draw.text((x*width+12, y*(height+38)+8), label, fill='#24333a', font=font)
            picture = Image.open(path).convert('RGB')
            picture.thumbnail((width, height))
            canvas.paste(picture, (x*width+(width-picture.width)//2, y*(height+38)+38+(height-picture.height)//2))
    canvas.save(out/name)

sheet('before-after.png', [[
    (f'{label} · before front', before/f'{family}-0.png'),
    ('after front', after/f'{family}-0.png'),
    ('before side', before/f'{family}-90.png'),
    ('after side', after/f'{family}-90.png'),
] for family, label in zip(families, names)])
sheet('turntable.png', [[(f'{label} · {angle}°', after/f'{family}-{angle}.png') for angle in [0,45,90,180]] for family,label in zip(families,names)])
sheet('headwear.png', [[(f'{label} · {angle}°', after/f'{family}-{angle}-hat.png') for angle in [0,90,180,270]] for family,label in zip(families,names)])
sheet('expressions.png', [[(f'{label} · {angle}° {expression}', after/f'{family}-{angle}-{expression}.png') for angle,expression in [(90,'blink'),(90,'smile'),(270,'blink'),(270,'smile')]] for family,label in zip(families,names)])
game = Path('.browser/art-evidence')
if (game/'before-game-90.png').exists():
    sheet('game-before-after.png', [[(f'before · {a}°',game/f'before-game-{a}.png') for a in [0,45,90]],[(f'after · {a}°',game/f'game-look-0-{a}.png') for a in [0,45,90]]],width=480,height=345)
print('PROFILE_CONTACT_SHEETS', out)
