"""Prepare NileLink's supplied brand artwork, without altering live page imports.
Run with the bundled Python (Pillow, numpy, pypdf); see docs/brand/README.md.
"""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from xml.sax.saxutils import escape
import numpy as np
from PIL import Image, ImageOps
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/brand/nilelink'
COLORS = dict(corten='#A4492A', steel='#161616', chalk='#F2EEE6', patina='#3B2A22', ember='#DF7B4F', quay='#E5DFD3', ribShadow='#8E3E23')
PHI = (1 + 5 ** .5) / 2

def svg(width, height, body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img"><title>{escape(title)}</title>{body}</svg>\n'

def write(name, text):
    p = OUT / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text, encoding='utf-8', newline='\n')

def mask_path(mask):
    """Lossless binary-mask outline as vertically merged run rectangles.
    Glyphs are copied from the approved flattened artwork, never typeset with
    a substitute font or guessed from the wordmark's name.
    """
    active, rectangles = {}, []
    for y, row in enumerate(mask):
        changes = np.diff(np.pad(row.astype(np.int8), (1, 1)))
        spans = set(zip(np.where(changes == 1)[0].tolist(), np.where(changes == -1)[0].tolist()))
        for span in list(active):
            if span not in spans:
                start, height = active.pop(span); rectangles.append((span[0], start, span[1]-span[0], height))
        for span in spans:
            start, height = active.get(span, (y, 0)); active[span] = (start, height+1)
    for span, (start, height) in active.items(): rectangles.append((span[0], start, span[1]-span[0], height))
    return ''.join(f'M{x} {y}h{w}v{h}h-{w}z' for x,y,w,h in sorted(rectangles))

def wordmark(image, box):
    a = np.asarray(image.crop(box).convert('RGBA'))
    mask = (a[:,:,:3].max(axis=2) < 80) & (a[:,:,3] > 127)
    ys,xs = np.where(mask)
    if not len(xs): raise ValueError('Missing wordmark in the supplied reference')
    mask = mask[ys.min():ys.max()+1, xs.min():xs.max()+1]
    return mask_path(mask), mask.shape[1], mask.shape[0], int(mask.sum())

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--pdf', type=Path, required=True); parser.add_argument('--hero', type=Path, required=True); parser.add_argument('--warehouse', type=Path, required=True)
    args = parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != '35f31952aa981327bfcdc1a81756112622cbf81654ce7fa5f1bdddbecc05a951':
        raise ValueError('This exporter is calibrated to the reviewed 30-page brand PDF; review a changed source first')
    pdf = PdfReader(args.pdf)
    sheet = pdf.pages[12].images[0].image
    mark = pdf.pages[29].images[2].image.convert('RGBA')
    if sheet.size != (3200,2200) or mark.size != (555,555): raise ValueError('Unexpected source image geometry')
    for folder in ['logos','icons','icons/cards','favicons','images','patterns']: (OUT/folder).mkdir(parents=True,exist_ok=True)
    a=np.asarray(mark); nmask=(a[:,:,:3].min(axis=2)>180)&(a[:,:,3]>127)
    npath=mask_path(nmask)
    columns=np.where(nmask.any(axis=0))[0]; segments=np.split(columns,np.where(np.diff(columns)>1)[0]+1)
    if len(segments)!=3: raise ValueError('Stencil bridges or N components changed')
    diagonal=nmask.copy(); diagonal[:,:segments[1][0]]=False; diagonal[:,segments[1][-1]+1:]=False
    radius=round(555/PHI**3,3)
    def symbol(variant='primary'):
        tile,ink=({'primary':(COLORS['corten'],COLORS['chalk']),'reverse':(COLORS['chalk'],COLORS['corten']),'patina':(COLORS['patina'],COLORS['chalk'])})[variant]
        body=f'<rect width="555" height="555" rx="{radius}" fill="{tile}"/><path d="{npath}" fill="{ink}"/>'
        if variant=='patina': body+=f'<path d="{mask_path(diagonal)}" fill="{COLORS["ember"]}"/>'
        return body
    for variant in ['primary','reverse','patina']: write('logos/mark-'+variant+'.svg',svg(555,555,symbol(variant),'NileLink stencil N'))
    mark.save(OUT/'logos/mark-primary.png',optimize=True)
    words={lang:wordmark(sheet,box) for lang,box in {'en':(350,1200,1100,1400),'ar':(900,1440,1520,1620)}.items()}
    word_metrics={}
    for lang,(d,w,h,pixels) in words.items():
        if w<200 or h<40: raise ValueError('Wordmark crop is incomplete')
        word_metrics[lang]=dict(width=w,height=h,foregroundPixels=pixels,method='lossless threshold-mask outline from supplied page 13')
        for context,ink in [('on-light',COLORS['steel']),('on-dark',COLORS['chalk'])]:
            write(f'logos/wordmark-{lang}-{context}.svg',svg(w,h,f'<path d="{d}" fill="{ink}"/>','NileLink' if lang=='en' else 'نايل لينك'))
            tile=64; cap=tile/PHI; scale=cap/h; gap=tile/PHI**2; width=round(tile+gap+w*scale,3); word_x=tile+gap if lang=='en' else 0; mark_x=0 if lang=='en' else width-tile
            body=f'<g transform="translate({mark_x} 0) scale({tile/555})">{symbol()}</g><path d="{d}" fill="{ink}" transform="translate({word_x} {(tile-cap)/2}) scale({scale})"/>'
            write(f'logos/lockup-{lang}-{context}.svg',svg(width,tile,body,'NileLink' if lang=='en' else 'نايل لينك'))
    for size in [16,32,48,180,192,512]: mark.resize((size,size),Image.Resampling.LANCZOS).save(OUT/f'favicons/mark-{size}.png',optimize=True)
    mark.save(OUT/'favicons/favicon.ico',sizes=[(16,16),(32,32),(48,48)])
    write('favicons/favicon.svg',svg(555,555,symbol(),'NileLink'))
    icons={
      'sea-freight':'<path d="M3 13h18l-3 7H6L3 13ZM8 13V7h8v6M12 3v4"/>',
      'air-freight':'<path d="m3 10 18-7-7 18-4-8-7-3Zm7 3L21 3"/>',
      'land-transport':'<path d="M3 6h11v11H3zM14 10h4l3 4v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
      'customs-clearance':'<path d="M6 3h9l4 4v14H6V3Zm9 0v5h4M9 13l3 3 5-5"/>',
      'warehousing':'<path d="m3 10 9-7 9 7v11H3V10Zm6 11v-7h6v7"/>',
      'cargo-insurance':'<path d="m12 3 8 4v6c0 4-4 7-8 9-4-2-8-5-8-9V7l8-4Zm-4 9 3 3 6-6"/>'
    }
    for name,paths in icons.items():
        line=f'<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">{paths}</g>'
        write(f'icons/{name}.svg',svg(24,24,line,name.replace('-',' ')))
        body=f'<path d="M0 0h48v38L38 48H0Z" fill="{COLORS["corten"]}"/><g transform="translate(12 12)" color="{COLORS["chalk"]}">{line}</g>'
        write(f'icons/cards/{name}.svg',svg(48,48,body,name.replace('-',' ')))
    # Exact repeat geometry/color from the independent page-30 pattern image.
    write('patterns/corrugation.svg',svg(60,60,f'<path fill="{COLORS["corten"]}" d="M0 0h60v60H0z"/><path fill="{COLORS["ribShadow"]}" d="M37 0h23v60H37z"/>','Decorative container corrugation'))
    images=[]
    for stem,source,variants in [
      ('hero',args.hero,[('desktop-1920',(1920,1080),(.5,.5)),('desktop-1280',(1280,720),(.5,.5)),('mobile-720',(720,1280),(.72,.5))]),
      ('warehouse',args.warehouse,[('desktop-1200',(1200,900),(.45,.55)),('mobile-800',(800,800),(.40,.55)),('small-640',(640,480),(.45,.55))])]:
        original=Image.open(source).convert('RGB'); original.thumbnail((2560,2560))
        original.save(OUT/f'images/{stem}-source.webp',format='WEBP',quality=88,method=6)
        images.append(dict(path=f'images/{stem}-source.webp',width=original.width,height=original.height,transform='resize only; no baked overlay or text'))
        for suffix,size,center in variants:
            if max(size[0]/original.width,size[1]/original.height)>1: raise ValueError('Image variant would upscale its source')
            im=ImageOps.fit(original,size,method=Image.Resampling.LANCZOS,centering=center)
            p=f'images/{stem}-{suffix}.webp';im.save(OUT/p,format='WEBP',quality=84,method=6)
            images.append(dict(path=p,width=size[0],height=size[1],cropCenter=list(center)))
    evidence=dict(sourcePdfSha256=hashlib.sha256(args.pdf.read_bytes()).hexdigest(),markForegroundPixels=int(nmask.sum()),wordmarks=word_metrics,images=images,brandColors=COLORS)
    evidence_path = ROOT/'.private/brand-assets/preparation-evidence.json'
    evidence_path.parent.mkdir(parents=True,exist_ok=True)
    evidence_path.write_text(json.dumps(evidence,indent=2,ensure_ascii=False),encoding='utf-8')
    print('Prepared source-derived logo variants, outlined wordmarks, favicons, 12 service SVGs, patterns and responsive photos')

if __name__=='__main__': main()
