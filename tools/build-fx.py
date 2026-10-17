# Picks the Kenney Particle Pack textures (CC0, https://kenney.nl/assets/particle-pack) the effects use and
# writes them to public/assets/fx/ as small white PNGs whose alpha is the original brightness, so the game
# can tint them any colour and draw them additively or as plain transparent sprites.
#
# Usage: python3 tools/build-fx.py "<particle pack>/PNG (Black background)"
import os
import sys

from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'fx')

# game name -> (Kenney file, size in px)
PICK = {
    'glow': ('circle_05', 128),
    'ring': ('circle_03', 256),
    'star': ('star_04', 128),
    'shard': ('star_07', 128),
    'flare': ('star_06', 128),
    'flame': ('flame_02', 128),
    'fire': ('fire_01', 128),
    'jet': ('muzzle_02', 128),
    'smoke': ('smoke_04', 128),
    'bolt': ('spark_05', 256),
    'zap': ('spark_02', 128),
    'rune': ('magic_02', 256),
    'slash': ('slash_02', 256),
    'twirl': ('twirl_02', 256),
    'scorch': ('scorch_02', 256),
    'trace': ('trace_01', 128),
    'sparkle': ('star_08', 128),
}

os.makedirs(OUT, exist_ok=True)
for name, (src, size) in PICK.items():
    lum = Image.open(os.path.join(SRC, f'{src}.png')).convert('L').resize((size, size), Image.LANCZOS)
    rgba = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    rgba.putalpha(lum)
    rgba.save(os.path.join(OUT, f'{name}.png'), optimize=True)
print('wrote', len(PICK), 'textures to', os.path.normpath(OUT))
