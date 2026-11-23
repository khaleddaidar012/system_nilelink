"""Audit the prepared asset pack and the preserved legacy inventory."""
import hashlib,json,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'public/brand/nilelink'
manifest=json.loads((ROOT/'docs/brand/assets-manifest.json').read_text(encoding='utf-8'))
files=manifest['files'];listed={row['path'] for row in files}
actual={str(p.relative_to(BASE)).replace('\\','/') for p in BASE.rglob('*') if p.is_file()}
assert listed==actual,'Manifest and prepared assets differ'
for row in files:
 p=(BASE/row['path']).resolve();assert p.is_relative_to(BASE.resolve())
 data=p.read_bytes();assert len(data)==row['bytes'];assert hashlib.sha256(data).hexdigest()==row['sha256'],row['path']
 if p.suffix=='.svg':
  doc=ET.fromstring(data);assert doc.tag=='{http://www.w3.org/2000/svg}svg'
  assert doc.find('{http://www.w3.org/2000/svg}title') is not None
  assert len(doc.attrib['viewBox'].split())==4
  for element in doc.iter():
   assert element.tag.rsplit('}',1)[-1] not in ['script','foreignObject','image','text']
   assert not any('href' in key or key.startswith('on') for key in element.attrib)
  if row['path'].startswith('icons/'):
   groups=doc.findall('.//{http://www.w3.org/2000/svg}g')
   assert any(g.attrib.get('stroke-width')=='2' for g in groups)
 elif p.suffix in ['.png','.webp','.ico']:
  with Image.open(p) as im: im.verify()
 elif p.suffix=='.woff2':assert data[:4]==b'wOF2'
for row in manifest['imageVariants']:
 with Image.open(BASE/row['path']) as im:assert im.size==(row['width'],row['height'])
license_text=(BASE/'fonts/OFL.txt').read_text(encoding='utf-8')
assert 'SIL OPEN FONT LICENSE Version 1.1' in license_text
for row in json.loads((ROOT/'docs/brand/existing-assets-inventory.json').read_text(encoding='utf-8'))['files']:
 assert hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'],'Legacy asset changed: '+row['path']
assert manifest['pendingInputs']==[{'id':'safiro-webfont','requiredForFinalTypography':True,'request':'Supply the licensed Safiro Medium WOFF/WOFF2 files and web-use license information.'}]
print(json.dumps({'preparedFiles':len(files),'totalBytes':sum(row['bytes'] for row in files),'svgAndFontChecks':'passed','legacyAssets':'unchanged','finalTypography':'pending Safiro webfont'},indent=2))
