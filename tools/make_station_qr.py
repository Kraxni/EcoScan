"""Étiquette QR d'une station EcoScan : le QR ouvre l'app et lance la session ; l'identifiant est écrit dessous.
Usage :  python3 tools/make_station_qr.py ECO-001 [--base https://kraxni.github.io/EcoScan/app/]
Sortie : assets/stations/<ID>-qr.svg (à imprimer) et <ID>-qr.png.
Nécessite : pip install segno
"""
import re
import sys
from pathlib import Path

try:
    import segno
except ImportError:
    sys.exit('Installer segno : pip install segno')

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args or not re.fullmatch(r'ECO-\d{3,4}', args[0].upper()):
    sys.exit('Usage : python3 tools/make_station_qr.py ECO-001 [--base URL]')
station = args[0].upper()
base = 'https://kraxni.github.io/EcoScan/app/'
if '--base' in sys.argv:
    base = sys.argv[sys.argv.index('--base') + 1]
url = f'{base.rstrip("/")}/?s={station}'
out = Path(__file__).resolve().parents[1] / 'assets' / 'stations'
out.mkdir(parents=True, exist_ok=True)
qr = segno.make(url, error='m')   # correction d'erreur moyenne : lisible même un peu abîmé ou sale
qr.save(out / f'{station}-qr.svg', scale=10, border=4, dark='#0b2a1b', light='#ffffff', title=f'QR code de la station {station}')
qr.save(out / f'{station}-qr.png', scale=14, border=4, dark='#0b2a1b', light='#ffffff')
print(f'{station} -> {url}\n{out / (station + "-qr.svg")}')
