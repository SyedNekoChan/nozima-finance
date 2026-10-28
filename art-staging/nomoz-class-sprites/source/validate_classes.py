"""Validates the five class sheets. Run: python3 -I validate_classes.py -> ../validation_report.txt.
All checks read the staged PNG/JSON files; reproducibility checks rebuild from source. No SpriteForge verification is performed."""
import os, sys, json, tempfile
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__));OUT=os.path.dirname(HERE);sys.path.insert(0,HERE)
import build_classes as C
L,B=C.L,C.B
FW,FH,DIRS,FRAMES,ORDER,CLS=C.FW,C.FH,C.DIRS,C.FRAMES,C.ORDER,C.CLS
rep=[];fails=[]
def check(n,ok,d=''):
    rep.append(('PASS' if ok else 'FAIL')+'  '+n+(('  -> '+d) if d else ''))
    if not ok: fails.append(n)
def info(s): rep.append('INFO  '+s)
ld=lambda p:Image.open(p).convert('RGBA')
sheet={k:ld(os.path.join(OUT,C.FILE[k])) for k in ORDER}
meta={k:json.load(open(os.path.join(OUT,f'nm_class_{k}_v1.json'))) for k in ORDER}
bodyB=ld(os.path.join(L.BASE,'nm_humanoid_base_body_sheet_v2.png'));bm=json.load(open(os.path.join(L.BASE,'nm_humanoid_base_v2.json')))
A=lambda im,x,y:im.getpixel((x,y))[3]
cells=[(r,c) for r in range(4) for c in range(6)]
EB={'idle0':0,'idle1':0,'walk0':0,'walk1':-1,'walk2':0,'walk3':-1}
def pts(im,r,c): return {(x,y) for y in range(FH) for x in range(FW) if A(im,c*FW+x,r*FH+y)}
def ch(k,im,r,c,x,y):
    cl=CLS[k];t=tuple(im.getpixel((c*FW+x,r*FH+y))[:3]);return INV[k].get(t)
INV={k:{CLS[k].rgb(c):c for c in CLS[k].pal} for k in ORDER}
# base v2 char lookup for face features
BINV={tuple(int(h[i:i+2],16) for i in(1,3,5)):c for c,h in B.PAL.items()}
def hy(dn,fn): return 3+(B.FRONT[fn][0]+B.FRONT[fn][1] if dn in('down','up') else B.SIDE[fn].get('bob',0)+B.SIDE[fn].get('hd',0))
shared={c:CLS[ORDER[0]].pal[c] for c in C.SHARED}
check('shared colours (outline, skin ramp, blush, eye dark/white) are identical in all five classes',all(all(CLS[k].pal[c]==shared[c] for c in C.SHARED) for k in ORDER))
spec={k:{v for c,v in CLS[k].pal.items() if c not in C.SHARED} for k in ORDER}
ov=[(a,b,sorted(spec[a]&spec[b])) for i,a in enumerate(ORDER) for b in ORDER[i+1:] if spec[a]&spec[b]]
check('class-specific colours are unique to their class (no colour shared between two classes beyond the shared set)',not ov,str(ov))
for k in ORDER:
    im=sheet[k];info(f'=== {k} ===')
    check(f'{k}: RGBA 240x192 (= base v2 sheet size), alpha only 0/255',im.mode=='RGBA' and im.size==(240,192) and {A(im,x,y) for y in range(192) for x in range(240)}<={0,255})
    used={tuple(im.getpixel((x,y))[:3]) for y in range(192) for x in range(240) if A(im,x,y)}
    decl={CLS[k].rgb(c) for c in CLS[k].pal}
    check(f'{k}: every colour is in the declared palette ({len(decl)} colours, <= 30)',used<=decl and len(decl)<=30,f'{len(used)} used of {len(decl)}')
    # frame geometry
    minpad=99;bad=[]
    for r,c in cells:
        p=pts(im,r,c)
        if not p: bad.append((DIRS[r],FRAMES[c]));continue
        xs=[x for x,_ in p];ys=[y for _,y in p];minpad=min(minpad,min(xs),min(ys),FW-1-max(xs),FH-1-max(ys))
    check(f'{k}: no empty frame and >=1px transparent padding in all 24 frames',not bad and minpad>=1,f'min padding {minpad}px')
    check(f'{k}: 24 distinct frames',len({im.crop((c*FW,r*FH,c*FW+FW,r*FH+FH)).tobytes() for r,c in cells})==24)
    low=[(DIRS[r],FRAMES[c],max(y for _,y in pts(im,r,c))) for r,c in cells if max(y for _,y in pts(im,r,c))!=44]
    check(f'{k}: lowest pixel is on the base ground row y=44 in every frame',not low,str(low))
    gc=[(DIRS[r],FRAMES[c]) for r,c in cells if sum(1 for x in range(FW) if A(im,c*FW+x,r*FH+44))<3]
    check(f'{k}: every frame has >=3 ground-contact pixels on y=44',not gc,str(gc))
    # face features / head anchor: every base face pixel must show the class equivalent at the same position
    miss=[];kcov=0
    for r,dn in enumerate(DIRS):
        for c,fn in enumerate(FRAMES):
            for (x,y) in pts(bodyB,r,c):
                bchar=BINV.get(tuple(bodyB.getpixel((c*FW+x,r*FH+y))[:3]))
                if bchar not in('E','W','I','K','b'): continue
                if y>=hy(dn,fn)+20: continue
                exp={'E':'E','W':'W','I':'I','K':'K','b':CLS[k].cfg['face_map']['b']}[bchar]
                got=ch(k,im,r,c,x,y) if A(im,c*FW+x,r*FH+y) else None
                if got!=exp:
                    if bchar=='K' and CLS[k].cfg.get('mask_covers')=='K': kcov+=1
                    else: miss.append((dn,fn,x,y,bchar,got))
    check(f'{k}: eyes, brows, blush/mouth pixels of base v2 appear unchanged at the same positions in all 24 frames (shared face, same head anchor)',not miss,str(miss[:4]))
    if kcov: info(f'{k}: blush/mouth pixels hidden by the scarf mask (class design): {kcov} px over the sheet; eyes and brows always visible')
    # silhouette contains base proportions in head/torso/arm rows
    thin=[]
    for r,dn in enumerate(DIRS):
        for c,fn in enumerate(FRAMES):
            lim=34+EB[fn]
            for (x,y) in pts(bodyB,r,c):
                if y<=lim and not A(im,c*FW+x,r*FH+y): thin.append((dn,fn,x,y))
    check(f'{k}: class silhouette contains the base v2 silhouette in all head/torso/arm rows (same chibi proportions, nothing thinner)',not thin,f'{len(thin)} px '+str(thin[:3]))
    if k in('swordsman','hunter','assassin'):
        thin2=[(DIRS[r],FRAMES[c],x,y) for r,c in cells for (x,y) in pts(bodyB,r,c) if y>34+EB[FRAMES[c]] and not A(im,c*FW+x,r*FH+y)]
        check(f'{k}: legs and boots also contain the base v2 leg silhouette (same stance and foot placement)',not thin2,f'{len(thin2)} px '+str(thin2[:3]))
    # anchors vs base
    bad=[]
    for dn in DIRS:
        for fn in FRAMES:
            a=meta[k]['anchors']['per_frame'][f'{dn}/{fn}'];b=bm['anchors']['per_frame']['anchors'][f'{dn}/{fn}']
            if a['head_origin']!=b['head_origin'] or a['hand_a']!=b['hand_a'] or a['hand_b']!=b['hand_b']: bad.append((dn,fn))
    check(f'{k}: head and hand anchors equal humanoid base v2 in all 24 frames',not bad,str(bad[:4]))
    # stray pixels / components / exposed edges
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
        if len(comps)>3 or min(comps)<6: strays.append((DIRS[r],FRAMES[c],comps))
        for x,y in p:
            cc=ch(k,im,r,c,x,y)
            if cc=='O':continue
            if any(not A(im,c*FW+x+dx,r*FH+y+dy) for dx,dy in((1,0),(-1,0),(0,1),(0,-1))): edges.append((DIRS[r],FRAMES[c],x,y,cc))
    check(f'{k}: <=3 connected parts per frame and no stray pixel groups (< 6 px)',not strays,str(strays[:3]))
    info(f'{k}: opaque non-outline pixels touching background (selective outline allowed for flame/feather/glint tips): {len(edges)} over the sheet')
    # lighting
    ramps=[r for r in CLS[k].ramps if r!='UTS'];fam={c:(i,r.index(c)) for i,r in enumerate(ramps) for c in r}
    def score(r,c):
        ph=th=pv=tv=0
        for x,y in pts(im,r,c):
            a=ch(k,im,r,c,x,y)
            if a not in fam: continue
            for dx,dy,m in((1,0,'h'),(0,1,'v')):
                if A(im,c*FW+x+dx,r*FH+y+dy):
                    b=ch(k,im,r,c,x+dx,y+dy)
                    if b in fam and fam[b][0]==fam[a][0] and fam[b][1]!=fam[a][1]:
                        s=1 if fam[b][1]<fam[a][1] else -1
                        if m=='h': th+=1;ph+=s
                        else: tv+=1;pv+=s
        return (ph/th if th else 0),(pv/tv if tv else 0)
    for r,dn in enumerate(DIRS):
        sc=[score(r,c) for c in range(6)]
        check(f'{k}/{dn}: lit from the upper left in every frame, cloth/hair/metal ramps (horizontal tone score >= +0.15, vertical >= 0.00; skin excluded: hood/brim cast shadows are intentional)',all(a>=0.15 and b>=0.0 for a,b in sc),'h '+','.join(f'{a:+.2f}' for a,_ in sc)+' v '+','.join(f'{b:+.2f}' for _,b in sc))
    # continuity
    chg=0;cmax=0
    for r,dn in enumerate(DIRS):
        al=[{(x-9,y-hy(dn,fn)):ch(k,im,r,c,x,y) for x,y in pts(im,r,c) if y<23+EB[fn]} for c,fn in enumerate(FRAMES)]
        for a,b in((0,1),(1,2),(2,3),(3,4),(4,5),(5,2)): chg=max(chg,len(set(al[a].items())^set(al[b].items())))
        cs=[sum(x for x,_ in pts(im,r,c))/len(pts(im,r,c)) for c in range(6)]
        for a,b in((0,1),(1,2),(2,3),(3,4),(4,5),(5,2)): cmax=max(cmax,abs(cs[a]-cs[b]))
    info(f'{k}: head-aligned change between neighbouring frames incl. attachments (planted weapons and body-anchored items shift relative to the head by design): max {chg} px')
    check(f'{k}: silhouette centroid x moves <= 1.5px between neighbouring frames',cmax<=1.5,f'max {cmax:.2f}px')
    # headwear/hair stability: render each frame WITHOUT attachments (weapon, capes, tails, braids, quiver...) and compare the head window, aligned to the head anchor
    cfg=CLS[k].cfg;saved={key:cfg.get(key) for key in('back','under','mid','post_arm','front','weapon','far_weapon')}
    for key in saved: cfg[key]={}
    unstable=[]
    for r,dn in enumerate(DIRS):
        al=[]
        for c,fn in enumerate(FRAMES):
            rows,a=L.build_frame(CLS[k],dn,fn);h=a['head_origin'][1]
            al.append({(x-9,y-h):rows[y][x] for y in range(0,h+20) for x in range(FW) if rows[y][x]!='.'})
        for c in range(1,6):
            if al[c]!=al[0]: unstable.append((dn,FRAMES[c],len(set(al[c].items())^set(al[0].items()))))
    for key,v in saved.items():
        if v is None: cfg.pop(key,None)
        else: cfg[key]=v
    check(f'{k}: hair/headwear (base face + overlay, attachments removed) is pixel-identical in all six frames of each direction when aligned to the head anchor',not unstable,str(unstable[:4]))
    # head overlay identical in idle0/idle1 aligned (breathing moves head as a unit)
    idl=[]
    for r,dn in enumerate(DIRS):
        a={(x-9,y-hy(dn,'idle0')):ch(k,im,r,0,x,y) for x,y in pts(im,r,0) if y<hy(dn,'idle0')+20};b={(x-9,y-hy(dn,'idle1')):ch(k,im,r,1,x,y) for x,y in pts(im,r,1) if y<hy(dn,'idle1')+20}
        d=len(set(a.items())^set(b.items()))
        if d: idl.append((dn,d))
    info(f'{k}: head-aligned differences idle0 vs idle1 over the head window rows (weapon/torso overlap rows only): {idl}')
# ---- cross-class distinctness ----
sil={}
for k in ORDER:
    for r,dn in enumerate(DIRS): sil[(k,dn)]={(x-9,y-hy(dn,'idle0')) for x,y in pts(sheet[k],r,0)}
mn={}
for i,a in enumerate(ORDER):
    for b in ORDER[i+1:]:
        for dn in DIRS:
            u=sil[(a,dn)]|sil[(b,dn)];x=sil[(a,dn)]^sil[(b,dn)];mn[(a,b)]=min(mn.get((a,b),9),len(x)/len(u))
info('silhouette difference (XOR/union, idle0, minimum over the four directions): '+'; '.join(f'{a}-{b} {v:.2f}' for (a,b),v in mn.items()))
ext={}
for k in ORDER:
    for r,dn in enumerate(DIRS):
        base={(x-9,y-hy(dn,'idle0')) for x,y in pts(bodyB,r,0)};ext[(k,dn)]={p for p in sil[(k,dn)] if p not in base}
dj={}
for i,a in enumerate(ORDER):
    for b in ORDER[i+1:]:
        v=[1-len(ext[(a,d)]&ext[(b,d)])/max(1,len(ext[(a,d)]|ext[(b,d)])) for d in DIRS];dj[(a,b)]=(min(v),sum(v)/4)
info('class-specific silhouette = pixels outside the shared base v2 silhouette (hats, hoods, capes, hems, weapons); pairwise Jaccard distance (min, mean over four directions): '+'; '.join(f'{a}-{b} {m:.2f}/{n:.2f}' for (a,b),(m,n) in dj.items()))
info('extension pixels per class (down,left,right,up): '+'; '.join(f'{k} '+str([len(ext[(k,d)]) for d in DIRS]) for k in ORDER))
check('every class adds >= 40 class-specific silhouette pixels (hat/hood/cape/hem/weapon) beyond the shared body in every direction',all(len(v)>=40 for v in ext.values()),str({k:len(v) for k,v in ext.items() if len(v)<40}))
check('class-specific silhouettes of every pair differ (mean Jaccard distance over four directions >= 0.60, minimum >= 0.35)',all(n>=0.60 and m>=0.35 for m,n in dj.values()),str({f'{a}-{b}':(round(m,2),round(n,2)) for (a,b),(m,n) in dj.items() if not(n>=0.60 and m>=0.35)}))
def meanc(k):
    cs=[]
    for r,c in cells:
        for x,y in pts(sheet[k],r,c):
            a=ch(k,sheet[k],r,c,x,y)
            if a not in C.SHARED and a!='I': cs.append(sheet[k].getpixel((c*FW+x,r*FH+y))[:3])
    return tuple(sum(c[i] for c in cs)/len(cs) for i in range(3))
import colorsys
def hue_hist(k):
    hist=[0]*15;n=0
    for r,c in cells:
        for x,y in pts(sheet[k],r,c):
            a=ch(k,sheet[k],r,c,x,y)
            if a in C.SHARED or a=='I': continue
            rr,gg,bb=[v/255 for v in sheet[k].getpixel((c*FW+x,r*FH+y))[:3]];h,s,vv=colorsys.rgb_to_hsv(rr,gg,bb)
            hist[int(h*12)%12 if s>0.18 and vv>0.2 else 12+(0 if vv<0.3 else 1 if vv<0.6 else 2)]+=1;n+=1
    return [v/n for v in hist]
HH={k:hue_hist(k) for k in ORDER}
hd=[(a,b,0.5*sum(abs(x-y) for x,y in zip(HH[a],HH[b]))) for i,a in enumerate(ORDER) for b in ORDER[i+1:]]
check('class colour languages are clearly distinct (hue/neutral-value histogram distance of non-skin, non-outline pixels >= 0.30 between every pair)',all(d>=0.30 for *_,d in hd),str([(a,b,round(d,2)) for a,b,d in hd if d<0.30]))
info('hue-histogram distance range: %.2f-%.2f'%(min(d for *_,d in hd),max(d for *_,d in hd)))
hh={k:[(max(y for _,y in sil[(k,d)])-min(y for _,y in sil[(k,d)])+1,max(x for x,_ in sil[(k,d)])-min(x for x,_ in sil[(k,d)])+1) for d in DIRS] for k in ORDER}
info('silhouette height x width at idle0 (down,left,right,up): '+'; '.join(f'{k} {hh[k]}' for k in ORDER))
# ---- reproducibility and docs ----
rs,ra,_=C.build_all()
for k in ORDER: check(f'{k}: rebuilt sheet == staged PNG (pixel/byte exact)',rs[k].tobytes()==sheet[k].tobytes())
check('metadata JSON equals regenerated metadata for all five classes',all(meta[k]==json.loads(json.dumps(C.metadata(k,rs[k],ra[k]))) for k in ORDER))
ok=True
for sc in(1,2,5):
    t=os.path.join(tempfile.mkdtemp(),'p.png');L.contact([rs[k] for k in ORDER],t,sc,[CLS[k].title for k in ORDER],cols=[0],dirs=range(4))
    ok&=Image.open(t).tobytes()==Image.open(os.path.join(OUT,'preview',f'nm_classes_gallery_{sc}x_v1.png')).tobytes()
    for k in ORDER:
        L.contact([rs[k]],t,sc,[CLS[k].title]);ok&=Image.open(t).tobytes()==Image.open(os.path.join(OUT,'preview',f'nm_class_{k}_contact_{sc}x_v1.png')).tobytes()
check('rebuilt gallery and per-class contact sheets (1x/2x/5x) == staged previews (pixel exact)',ok)
t=os.path.join(tempfile.mkdtemp(),'s.png');C.silhouette_sheet(rs,t);check('rebuilt silhouette sheet == staged',Image.open(t).tobytes()==Image.open(os.path.join(OUT,'preview','nm_classes_silhouettes_v1.png')).tobytes())
check('exported parts/*/*.txt match the source modules',all(open(os.path.join(HERE,'parts',k,n+'.txt')).read()=='\n'.join(r)+'\n' for k in ORDER for n,r in CLS[k].P.items()))
check('required docs present (SPEC.md, CLASS_DESIGN.md)',all(os.path.exists(os.path.join(OUT,f)) for f in('SPEC.md','CLASS_DESIGN.md')))
check('base v2 dependency hashes in metadata still match the files used to build',all(L.sha(os.path.join(L.BASE,f))==h for f,h in meta[ORDER[0]]['rig']['build_dependencies_sha256'].items()))
open(os.path.join(OUT,'validation_report.txt'),'w').write('\n'.join(rep)+'\n\nFAILS: '+str(fails)+'\n')
print('\n'.join(rep));print('FAILS:',fails)
