"""Validates the three Nomoz hairstyle sheets against humanoid base v2 + Basic Adventurer clothing v1.
Run: python3 -I validate_hairstyles.py -> ../validation_report.txt. Reads the staged PNG/JSON files; reproducibility checks rebuild from
hair_parts.py and compare bytes. No SpriteForge check is performed (SpriteForge was not used for these sheets)."""
import os, sys, json, tempfile
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE)
sys.path.insert(0,HERE)
import build_hairstyles as C
H,B=C.H,C.B
FW,FH,DIRS,FRAMES,STYLES=C.FW,C.FH,C.DIRS,C.FRAMES,C.STYLES
rep=[];fails=[]
def check(n,ok,d=''):
    rep.append(('PASS' if ok else 'FAIL')+'  '+n+(('  -> '+d) if d else ''))
    if not ok: fails.append(n)
def info(l): rep.append('INFO  '+l)
L=C.load
body,clo,hdef=C.layers()
hair={s:L(os.path.join(OUT,C.FILE[s])) for s in STYLES}
comp={s:L(os.path.join(OUT,'preview',f'nm_hairstyle_{s}_composite_sheet_v1.png')) for s in STYLES}
A=lambda im,x,y:im.getpixel((x,y))[3]
cells=[(r,c) for r in range(4) for c in range(6)]
def pts(im,r,c): return {(x,y) for y in range(FH) for x in range(FW) if A(im,c*FW+x,r*FH+y)}
def chr_(im,r,c,x,y): return C.INV.get(tuple(im.getpixel((c*FW+x,r*FH+y))[:3]))
EB={'idle0':0,'idle1':0,'walk0':0,'walk1':-1,'walk2':0,'walk3':-1}
def hy(dn,fn): return C.head_y(dn,fn)
# declared hair zones (frame coordinates, before bob): window x9..30 / box margins
ZONE={'short':(9,30),'medium':(7,32),'long':(7,32)}
ZONE_Y={'short':(2,24),'medium':(1,26),'long':(2,36)}
meta={s:json.load(open(os.path.join(OUT,f'nm_hairstyle_{s}_v1.json'))) for s in STYLES}
bm=json.load(open(os.path.join(B.__file__.rsplit('/source',1)[0],'nm_humanoid_base_v2.json'))) if False else json.load(open(os.path.join(C.BASE,'nm_humanoid_base_v2.json')))
for s in STYLES:
    im=hair[s];info(f'=== {s} ===')
    check(f'{s}: RGBA 240x192 (= base v2 sheet size)',im.mode=='RGBA' and im.size==(240,192))
    check(f'{s}: alpha only 0/255',{A(im,x,y) for y in range(192) for x in range(240)}<={0,255})
    used={tuple(im.getpixel((x,y))[:3]) for y in range(192) for x in range(240) if A(im,x,y)}
    decl={C.rgb(c) for c in list(H.PAL[s])+['O']}
    check(f'{s}: palette = 4-tone ramp + shared outline (5 colours)',used<=decl,f'{len(used)} used')
    other={C.rgb(c) for c in C.PAL if c not in H.PAL[s] and c!='O'}
    check(f'{s}: no colour shared with base, clothing or the other hairstyles (outline excepted)',not (used&other))
    # frame geometry
    bad=[];zone=[];minpad=99
    for r,c in cells:
        p=pts(im,r,c)
        if not p: bad.append((DIRS[r],FRAMES[c],'empty'));continue
        xs=[x for x,_ in p];ys=[y for _,y in p]
        minpad=min(minpad,min(xs),min(ys),FW-1-max(xs),FH-1-max(ys))
        z0,z1=ZONE[s];y0,y1=ZONE_Y[s]
        if min(xs)<z0 or max(xs)>z1 or min(ys)<y0+min(0,EB[FRAMES[c]]) or max(ys)>y1+(0 if s!='long' else 0): zone.append((DIRS[r],FRAMES[c],min(xs),max(xs),min(ys),max(ys)))
    check(f'{s}: no empty frame; >=1px transparent padding in every frame cell',not bad and minpad>=1,f'min padding {minpad}px')
    check(f'{s}: hair stays inside its declared zone x{ZONE[s][0]}..{ZONE[s][1]}, y{ZONE_Y[s][0]}..{ZONE_Y[s][1]}',not zone,str(zone[:3]))
    # head anchor consistency: aligned crops
    base_aligned={}
    mism=[];top_off={}
    for r,dn in enumerate(DIRS):
        al=[]
        for c,fn in enumerate(FRAMES):
            hx0,hy0=9,hy(dn,fn)
            p={(x-hx0,y-hy0):chr_(im,r,c,x,y) for x,y in pts(im,r,c)};al.append(p)
        top_off[dn]=[min(y for _,y in a) for a in al]
        sw=[spec[0] for spec in C.SWAY.get((s,dn),[])]
        ystat=min(sw) if sw else 99
        ref={k:v for k,v in al[0].items() if k[1]<ystat}
        for c in range(1,6):
            cur={k:v for k,v in al[c].items() if k[1]<ystat}
            if cur!=ref: mism.append((dn,FRAMES[c],len(set(cur.items())^set(ref.items()))))
    check(f'{s}: head-anchored region (above the sway rows) is pixel-identical in all 6 frames of each direction (no flicker, fixed hairline)',not mism,str(mism))
    check(f'{s}: hair top row - head anchor y is constant within each direction',all(len(set(v))==1 for v in top_off.values()),str(top_off))
    # continuity
    worst=0;chg=0
    for r,dn in enumerate(DIRS):
        al=[]
        for c,fn in enumerate(FRAMES):
            al.append({(x-9,y-hy(dn,fn)):chr_(im,r,c,x,y) for x,y in pts(im,r,c)})
        for a,b in((0,1),(1,2),(2,3),(3,4),(4,5),(5,2)):
            chg=max(chg,len(set(al[a].items())^set(al[b].items())))
        cs=[(sum(x for x,_ in pts(im,r,c))/len(pts(im,r,c))) for c in range(6)]
        for a,b in((0,1),(1,2),(2,3),(3,4),(4,5),(5,2)): worst=max(worst,abs(cs[a]-cs[b]))
    check(f'{s}: head-aligned change between neighbouring frames <= 24 px (incl. walk3->walk0 loop wrap; idle0->idle1 unchanged)',chg<=24,f'max {chg} px')
    check(f'{s}: hair centroid x moves <= 1.5px between neighbouring frames',worst<=1.5,f'max {worst:.2f}px')
    # components / stray pixels / outline integrity
    strays=[];edges=[]
    for r,c in cells:
        p=pts(im,r,c);seen=set();comps=[]
        for q in p:
            if q in seen: continue
            st=[q];seen.add(q);n=0
            while st:
                x,y=st.pop();n+=1
                for dx in(-1,0,1):
                    for dy in(-1,0,1):
                        t=(x+dx,y+dy)
                        if t in p and t not in seen: seen.add(t);st.append(t)
            comps.append(n)
        if len(comps)>2 or min(comps)<8: strays.append((DIRS[r],FRAMES[c],comps))
        # exterior edge pixels must be outline: a hair pixel with a 4-neighbour transparent in the full composite
        fc=comp[s]
        for x,y in p:
            k=chr_(im,r,c,x,y)
            if k=='O': continue
            for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                if not A(fc,c*FW+x+dx,r*FH+y+dy): edges.append((DIRS[r],FRAMES[c],x,y));break
    check(f'{s}: one connected silhouette per frame, no stray pixels (components <= 2, none < 8 px)',not strays,str(strays[:3]))
    check(f'{s}: no un-outlined exterior hair edge (hair pixels touching transparent background are outline colour)',not edges,f'{len(edges)} px '+str(edges[:4]))
    # lighting (tone ramp)
    ramp=H.RAMP[s];FAM={c:i for i,c in enumerate(ramp)}
    def score(r,c):
        ph=th=pv=tv=0
        for x,y in pts(im,r,c):
            k=chr_(im,r,c,x,y)
            if k not in FAM: continue
            for dx,dy,m in((1,0,'h'),(0,1,'v')):
                if A(im,c*FW+x+dx,r*FH+y+dy):
                    k2=chr_(im,r,c,x+dx,y+dy)
                    if k2 in FAM and FAM[k2]!=FAM[k]:
                        sg=1 if FAM[k2]<FAM[k] else -1
                        if m=='h': th+=1;ph+=sg
                        else: tv+=1;pv+=sg
        return (ph/th if th else 0),(pv/tv if tv else 0)
    for r,dn in enumerate(DIRS):
        sc=[score(r,c) for c in range(6)]
        check(f'{s}/{dn}: lit from upper-left in every frame (horizontal tone score >= +0.20, vertical >= +0.05)',all(a>=0.20 and b>=0.05 for a,b in sc),'h '+','.join(f'{a:+.2f}' for a,_ in sc)+' v '+','.join(f'{b:+.2f}' for _,b in sc))
    # compositing: face visibility, hands, clothing
    face=[];hands=[];clo_over=0;outl=0
    rc=body.copy();rc.alpha_composite(clo);rc.alpha_composite(im)
    check(f'{s}: staged composite == body + clothing + this hairstyle (documented draw order, pixel exact)',rc.tobytes()==comp[s].tobytes())
    for r,dn in enumerate(DIRS):
        for c,fn in enumerate(FRAMES):
            b0=EB[fn]
            for (x,y) in pts(body,r,c):
                k=chr_(body,r,c,x,y)
                same=comp[s].getpixel((c*FW+x,r*FH+y))==body.getpixel((c*FW+x,r*FH+y))
                if k in 'EWIKb' and y<24+b0+1 and not same: face.append((dn,fn,x,y,k))
                if k in 'STUK' and y>=27+b0 and not same: hands.append((dn,fn,x,y))
            hp=pts(im,r,c);cp=pts(clo,r,c);clo_over+=len(hp&cp)
    check(f'{s}: face is never covered (eyes, brows, mouth/blush pixels of the base are unchanged in all 24 frames)',not face,str(face[:4]))
    check(f'{s}: hands and forearms are never covered',not hands,str(hands[:4]))
    info(f'{s}: hair pixels overlapping clothing over the whole sheet: {clo_over} (documented overlap; clothing remains beneath)')
    # hair over the base head: hair pixels over transparent base pixels only as overhang/outline
    outside={'short':0}.get(s)
    ov=0
    for r,dn in enumerate(DIRS):
        for c,fn in enumerate(FRAMES):
            for x,y in pts(im,r,c):
                if not A(body,c*FW+x,r*FH+y): ov+=1
    if s=='short': check('short: hair never extends beyond the base head silhouette (no overhang)',ov==0,f'{ov} px outside')
    else: info(f'{s}: hair pixels outside the base body silhouette (declared overhang/tail): {ov}')
    # swappability: hair layer independent of body/clothing hashes recorded
    m=meta[s]
    check(f'{s}: metadata sheet sha256 matches PNG',m['sheet']['sha256']==C.sha(os.path.join(OUT,C.FILE[s])))
    check(f'{s}: base v2, clothing v1 and default hair files unchanged (sha256 match metadata)',all(C.sha(os.path.join(C.BASE,f))==h for f,h in m['base']['files_sha256'].items()) and all(C.sha(os.path.join(C.CLO,f))==h for f,h in m['clothing']['files_sha256'].items()))
# ---- cross-style distinctness at native size -------------------------------------------------
def aligned_alpha(im,r,c,dn,fn): return {(x-9,y-hy(dn,fn)) for x,y in pts(im,r,c)}
ds=[]
for r,dn in enumerate(DIRS):
    sets={s:aligned_alpha(hair[s],r,0,dn,'idle0') for s in STYLES};sets['default']=aligned_alpha(hdef,r,0,dn,'idle0')
    for a,b in(('short','medium'),('short','long'),('medium','long'),('short','default'),('medium','default'),('long','default')):
        u=sets[a]|sets[b];x=sets[a]^sets[b];ds.append((dn,a,b,len(x)/len(u)))
mn={}
for dn,a,b,v in ds: mn[(a,b)]=min(mn.get((a,b),9),v)
info('silhouette difference (XOR/union of head-aligned hair alpha, idle0) minimum over the four directions: '+'; '.join(f'{a}-{b} {v:.2f}' for (a,b),v in mn.items()))
check('the three hairstyles differ clearly in silhouette in every direction (XOR/union >= 0.20 for each pair)',all(v>=0.20 for (a,b),v in mn.items() if 'default' not in (a,b)),str({k:round(v,2) for k,v in mn.items() if 'default' not in k}))
check('each hairstyle also differs from the default hair (XOR/union >= 0.15 in every direction)',all(v>=0.15 for (a,b),v in mn.items() if 'default' in (a,b)),str({k:round(v,2) for k,v in mn.items() if 'default' in k}))
hh={s:[(max(y for _,y in aligned_alpha(hair[s],r,0,d,'idle0'))-min(y for _,y in aligned_alpha(hair[s],r,0,d,'idle0'))+1) for r,d in enumerate(DIRS)] for s in STYLES}
info('hair height in pixels (down,left,right,up): '+'; '.join(f'{s} {hh[s]}' for s in STYLES))
check('length ordering short < medium < long in every direction',all(hh['short'][i]<hh['medium'][i]<hh['long'][i] for i in range(4)))
def mean_rgb(s): 
    cs=[C.rgb(c) for c in H.PAL[s]];return tuple(sum(c[i] for c in cs)/4 for i in range(3))
pd=[(a,b,sum((x-y)**2 for x,y in zip(mean_rgb(a),mean_rgb(b)))**.5) for a,b in(('short','medium'),('short','long'),('medium','long'))]
check('palettes are clearly distinct (mean RGB distance > 60 between each pair)',all(d>60 for *_,d in pd),str([(a,b,round(d)) for a,b,d in pd]))
# ---- reproducibility ---------------------------------------------------------------------------
sheets,anch,comps=None,None,None
import shutil
rs={s:C.build(s)[0] for s in STYLES}
for s in STYLES: check(f'{s}: rebuilt sheet == staged PNG (pixel/byte exact)',rs[s].tobytes()==hair[s].tobytes())
rcomps={s:C.composite(body,clo,rs[s]) for s in STYLES}
check('rebuilt composites == staged composites (pixel/byte exact)',all(rcomps[s].tobytes()==comp[s].tobytes() for s in STYLES))
ok=True
for sc in(1,2,5):
    t=os.path.join(tempfile.mkdtemp(),'p.png');C.contact([rcomps[s] for s in STYLES],t,sc,STYLES)
    ok&=Image.open(t).tobytes()==Image.open(os.path.join(OUT,'preview',f'nm_hairstyles_contact_{sc}x_v1.png')).tobytes()
check('rebuilt 1x/2x/5x contact sheets == staged previews (pixel exact)',ok)
check('exported parts/*.txt match hair_parts.py',all(open(os.path.join(HERE,'parts',f'{s}_{n}.txt')).read()=='\n'.join(r)+'\n' for (s,n),r in H.PARTS.items()))
check('metadata equals regenerated metadata',all(meta[s]==json.loads(json.dumps(C.metadata(s,rs[s],C.anchors_for(s)))) for s in STYLES) if hasattr(C,'metadata') else False)
open(os.path.join(OUT,'validation_report.txt'),'w').write('\n'.join(rep)+'\n\nFAILS: '+str(fails)+'\n')
print('\n'.join(rep));print('FAILS:',fails)
