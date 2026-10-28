"""Validates the Basic Adventurer clothing sheet against humanoid base v2. Run: python3 -I validate_clothing.py -> ../validation_report.txt
All checks read the staged PNG/JSON files; reproducibility checks rebuild from outfit_parts.py and compare bytes. No SpriteForge check is performed."""
import os, sys, json, hashlib
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE)
sys.path.insert(0,HERE)
import build_clothing as C
B,O=C.B,C.O
FW,FH,DIRS,FRAMES,BASE=C.FW,C.FH,C.DIRS,C.FRAMES,C.BASE
rep=[];fails=[]
def check(n,ok,d=''):
    rep.append(('PASS' if ok else 'FAIL')+'  '+n+(('  -> '+d) if d else ''))
    if not ok: fails.append(n)
def info(l): rep.append('INFO  '+l)
L=lambda f:Image.open(f).convert('RGBA')
clo=L(os.path.join(OUT,C.SHEET));body=L(os.path.join(BASE,'nm_humanoid_base_body_sheet_v2.png'));hair=L(os.path.join(BASE,'nm_humanoid_base_hair_default_sheet_v2.png'))
mask=L(os.path.join(BASE,'nm_humanoid_base_underlayer_mask_sheet_v2.png'));bcomp=L(os.path.join(BASE,'nm_humanoid_base_composite_sheet_v2.png'))
comp=L(os.path.join(OUT,'preview','nm_clothing_basic_adventurer_composite_sheet_v1.png'))
A=lambda im,x,y:im.getpixel((x,y))[3]
cells=[(r,c) for r in range(4) for c in range(6)]
def pts(im,r,c): return [(x,y) for y in range(FH) for x in range(FW) if A(im,c*FW+x,r*FH+y)]
def ch(im,r,c,x,y): return C.INV.get(tuple(im.getpixel((c*FW+x,r*FH+y))[:3]))
# ---------- format, palette, base integrity ----------
raw=Image.open(os.path.join(OUT,C.SHEET))
check('clothing sheet is RGBA 240x192 (= base v2 sheet size)',raw.mode=='RGBA' and raw.size==(240,192),f'{raw.mode} {raw.size}')
check('alpha is only 0/255',{A(clo,x,y) for y in range(192) for x in range(240)}<={0,255})
used={tuple(clo.getpixel((x,y))[:3]) for y in range(192) for x in range(240) if A(clo,x,y)}
decl={C.rgb(c) for c in list(O.PAL_O)+['O']}
check('every colour is in the declared outfit palette (20 outfit colours + shared outline)',used<=decl,f'{len(used)} of {len(decl)} used')
base_cloth={C.rgb(c) for c in '0123pqrxyzw'}
check('outfit palette is disjoint from the default underlayer colours (outline excepted)',not (used&base_cloth),str(sorted(used&base_cloth)))
m=json.load(open(os.path.join(OUT,'nm_clothing_basic_adventurer_v1.json')))
check('base v2 files unchanged since the outfit was built (sha256 match)',all(C.sha(os.path.join(BASE,f))==h for f,h in m['base']['files_sha256'].items()))
check('metadata sheet sha256 matches the staged PNG',m['sheet']['sha256']==C.sha(os.path.join(OUT,C.SHEET)))
bm=json.load(open(os.path.join(BASE,'nm_humanoid_base_v2.json')))
check('metadata frame/rows/columns/animations equal base v2',all(m[k]==bm[k] for k in('frame','row_order','column_order','animations')) and m['sheet']['columns']==6 and m['sheet']['rows']==4)
# ---------- coverage contract ----------
bad_out=[];bad_gap=[]
for r,c in cells:
    for y in range(FH):
        for x in range(FW):
            a=A(clo,c*FW+x,r*FH+y);mk=A(mask,c*FW+x,r*FH+y)
            if a and not mk: bad_out.append((DIRS[r],FRAMES[c],x,y))
            if mk and not a: bad_gap.append((DIRS[r],FRAMES[c],x,y))
check('no clothing pixel outside the underlayer mask (no unintended body coverage / overhang)',not bad_out,str(bad_out[:4]))
check('every underlayer-mask pixel is covered (clothing alpha == mask alpha, 24 frames)',not bad_gap,str(bad_gap[:4]))
# composite = body + clothing + hair
rc=body.copy();rc.alpha_composite(clo);rc.alpha_composite(hair)
check('staged composite == body + clothing + hair (documented draw order, pixel exact)',rc.tobytes()==comp.tobytes())
exp=[];skin=[]
under={C.rgb(c) for c in '0123pqrxyzw'}
nohair=body.copy();nohair.alpha_composite(clo)
for r,c in cells:
    for x,y in pts(comp,r,c):
        if tuple(comp.getpixel((c*FW+x,r*FH+y))[:3]) in under: exp.append((DIRS[r],FRAMES[c],x,y))
    for x,y in pts(body,r,c):
        k=ch(body,r,c,x,y)
        if k in 'STUKEWI' and nohair.getpixel((c*FW+x,r*FH+y))!=body.getpixel((c*FW+x,r*FH+y)): skin.append((DIRS[r],FRAMES[c],x,y))
check('no default-underlayer colour is visible in any composited frame (24 frames)',not exp,f'{len(exp)} exposed px '+str(exp[:4]))
check('body skin and eye pixels are untouched by the clothing layer (hands, neck, face)',not skin,str(skin[:4]))
check('composite silhouette (alpha) == base v2 composite silhouette (no gaps, no clipping, nothing added)',all(A(comp,x,y)==A(bcomp,x,y) for y in range(192) for x in range(240)))
ho=[(DIRS[r],FRAMES[c],x,y) for r,c in cells for x,y in pts(hair,r,c) if A(clo,c*FW+x,r*FH+y)]
hd=[o for o in ho if clo.getpixel((FW*FRAMES.index(o[1])+o[2],FH*DIRS.index(o[0])+o[3]))!=hair.getpixel((FW*FRAMES.index(o[1])+o[2],FH*DIRS.index(o[0])+o[3]))]
check('hair/clothing overlap only on identical outline-colour pixels (so their draw order cannot change the result)',not hd,f'{len(ho)} shared outline pixels, {len(hd)} with different colours')
info('shared hair/clothing pixels: '+str(sorted({(o[0],o[1]) for o in ho})[:8])+' (head-bottom outline pixels in the up view that the base mask includes because they touch the collar)')
minpad=min(min(bb[0],bb[1],FW-bb[2],FH-bb[3]) for r,c in cells for bb in [clo.crop((c*FW,r*FH,c*FW+FW,r*FH+FH)).getbbox()] if bb)
check('clothing keeps >=1px transparent padding inside every frame cell',minpad>=1,f'min {minpad}px')
check('24 distinct clothing frames',len({clo.crop((c*FW,r*FH,c*FW+FW,r*FH+FH)).tobytes() for r,c in cells})==24)
# per-frame stats from the build
stats=json.load(open(os.path.join(HERE,'_build_stats.json')))
unp=[k for k,v in stats.items() if v['unpainted']]
check('every cloth-coloured underlayer pixel was painted by an outfit part (no reliance on fill)',not unp,str(unp))
info('outline-colour fill used on %d underlayer outline pixels across the sheet; outfit paint clipped by body occluders (head/hands) on %d pixels'%(sum(v['outline_filled'] for v in stats.values()),sum(v['clipped_by_body'] for v in stats.values())))
# ---------- anchors / alignment ----------
EB={'idle0':0,'idle1':0,'walk0':0,'walk1':-1,'walk2':0,'walk3':-1}
def first_y(r,c,pred,ymin=0,ymax=47):
    for y in range(ymin,ymax+1):
        for x in range(FW):
            if A(clo,c*FW+x,r*FH+y) and pred(ch(clo,r,c,x,y)): return y
bad=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        top=first_y(r,c,lambda k:k!='O');belt=first_y(r,c,lambda k:k in 'efl',26,36);low=max(y for x,y in pts(clo,r,c))
        # the head overlaps the torso top by 1px in idle1; only check the torso top where the head does not cover it
        if fn!='idle1' and top!=(23 if dn=='up' else 24)+EB[fn]: bad.append((dn,fn,'top',top))
        if belt!=31+EB[fn]: bad.append((dn,fn,'belt',belt))
        if low!=44: bad.append((dn,fn,'sole',low))
check('first coloured torso row = 24+bob (23+bob in the up view, which has collar trim on the top row), belt top = 31+bob, lowest boot pixel y=44 in all 24 frames (base anchors)',not bad,str(bad))
# brass buckle sits at the documented spot: front centre / side front / absent on back
bk=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        xs=[x for x,y in pts(clo,r,c) if ch(clo,r,c,x,y) in 'MNP' and 28<=y<=36]
        if dn=='up':
            if xs: bk.append((dn,fn,'unexpected buckle'))
        elif not xs:
            if not (dn in('left','right') and B.SIDE[fn].get('na')=='fwd'): bk.append((dn,fn,'missing'))   # near arm swung forward hides the front buckle
        elif dn=='down' and not all(18<=x<=21 for x in xs): bk.append((dn,fn,xs))
        elif dn=='left' and not all(x<=21 for x in xs): bk.append((dn,fn,xs))
        elif dn=='right' and not all(x>=19 for x in xs): bk.append((dn,fn,xs))
check('buckle: centre-front (down), front-left (left), front-right (right), none on the back (up); hidden only when the near arm swings forward (side walk2)',not bk,str(bk))
# ---------- continuity / animation discontinuities ----------
def cen(r,c):
    p=pts(clo,r,c);return sum(x for x,_ in p)/len(p),sum(y for _,y in p)/len(p)
worst=0;belt_jump=0;rows=[]
for r,dn in enumerate(DIRS):
    for a,b in((0,1),(1,2),(2,3),(3,4),(4,5),(5,2)):
        ca,cb=cen(r,a),cen(r,b);worst=max(worst,abs(ca[0]-cb[0]))
        ba=first_y(r,a,lambda k:k in 'efl',26,36);bb=first_y(r,b,lambda k:k in 'efl',26,36);belt_jump=max(belt_jump,abs(ba-bb))
check('clothing centroid x moves <=1.5px between neighbouring frames (incl. walk loop walk3->walk0 wrap, idle0->idle1)',worst<=1.5,f'max {worst:.2f}px')
check('belt row moves <=1px between neighbouring frames',belt_jump<=1,f'max {belt_jump}px')
# colour-region stability: tunic pixel count per frame varies only with documented bob/occlusion
tn=[[sum(1 for x,y in pts(clo,r,c) if ch(clo,r,c,x,y) in 'ghjk') for c in range(6)] for r in range(4)]
info('tunic-green pixel count per frame: '+'; '.join(f'{DIRS[r]} '+','.join(map(str,tn[r])) for r in range(4)))
check('tunic pixel count varies <=12% within each direction (no pop between frames)',all(max(t)-min(t)<=0.12*max(t) for t in tn))
# ---------- lighting ----------
FAMO={}
for fam,chars in O.RAMPS.items():
    for i,cc in enumerate(chars): FAMO[cc]=(fam,i)
def score(r,c):
    ph=th=pv=tv=0
    for x,y in pts(clo,r,c):
        k=ch(clo,r,c,x,y)
        if k not in FAMO: continue
        for dx,dy,mode in((1,0,'h'),(0,1,'v')):
            if x+dx<FW and y+dy<FH and A(clo,c*FW+x+dx,r*FH+y+dy):
                k2=ch(clo,r,c,x+dx,y+dy)
                if k2 in FAMO and FAMO[k2][0]==FAMO[k][0] and FAMO[k2][1]!=FAMO[k][1]:
                    s=1 if FAMO[k2][1]<FAMO[k][1] else -1
                    if mode=='h': th+=1;ph+=s
                    else: tv+=1;pv+=s
    return ph/th if th else 0,pv/tv if tv else 0
S=[[score(r,c) for c in range(6)] for r in range(4)]
for r,dn in enumerate(DIRS):
    info(f'{dn}: horizontal light score per frame '+','.join(f'{s[0]:+.2f}' for s in S[r])+'; vertical '+','.join(f'{s[1]:+.2f}' for s in S[r]))
    check(f'{dn}: every frame lit from the left (horizontal tone score >= +0.25)',all(s[0]>=0.25 for s in S[r]),f'min {min(s[0] for s in S[r]):+.2f}')
    check(f'{dn}: every frame lit from above (vertical tone score >= +0.10)',all(s[1]>=0.10 for s in S[r]),f'min {min(s[1] for s in S[r]):+.2f}')
def lum(cc): h=C.PAL[cc];r_,g,b=(int(h[i:i+2],16) for i in(1,3,5));return .299*r_+.587*g+.114*b
MATS={'tunic':'ghjk','trousers':'stu','boots':'ABCD'}
for r,dn in enumerate(DIRS):
    d={}
    for mn,chars in MATS.items():
        pp=[(x,lum(ch(clo,r,c,x,y))) for c in range(6) for x,y in pts(clo,r,c) if ch(clo,r,c,x,y) in chars]
        mid=sorted(p[0] for p in pp)[len(pp)//2];Lh=[v for x,v in pp if x<mid];Rh=[v for x,v in pp if x>=mid]
        d[mn]=sum(Lh)/len(Lh)-sum(Rh)/len(Rh)
    info(f'{dn}: per-material luminance left half minus right half '+', '.join(f'{k}={v:+.1f}' for k,v in d.items()))
    check(f'{dn}: tunic, trousers and boots are each brighter on the left half than the right',all(v>0 for v in d.values()),str({k:round(v,1) for k,v in d.items()}))
# ---------- distinct from underlayer ----------
def meanrgb(im,chars,mk=None):
    pp=[im.getpixel((x,y))[:3] for y in range(192) for x in range(240) if A(im,x,y) and C.INV.get(tuple(im.getpixel((x,y))[:3])) in chars]
    return tuple(sum(p[i] for p in pp)/len(pp) for i in range(3))
tn_=meanrgb(clo,'ghjk');sh_=meanrgb(body,'0123')
dist=sum((a-b)**2 for a,b in zip(tn_,sh_))**.5
check('tunic mean colour differs clearly from the default shirt (RGB distance > 40)',dist>40,f'{dist:.0f}')
tr_=meanrgb(clo,'stu');tb_=meanrgb(body,'pqr');check('trousers mean colour differs clearly from the default trousers (distance > 40)',sum((a-b)**2 for a,b in zip(tr_,tb_))**.5>40,f'{sum((a-b)**2 for a,b in zip(tr_,tb_))**.5:.0f}')
# ---------- reproducibility ----------
rb,_=C.build()
check('rebuilt clothing sheet == staged PNG (pixel/byte exact)',rb.tobytes()==clo.tobytes())
rcomp=body.copy();rcomp.alpha_composite(rb);rcomp.alpha_composite(hair)
check('rebuilt composite == staged composite PNG (pixel/byte exact)',rcomp.tobytes()==comp.tobytes())
import tempfile
ok=True
for s in(1,2,5):
    t=os.path.join(tempfile.mkdtemp(),'p.png');C.contact_sheet(rcomp,t,s)
    ok&=(Image.open(t).tobytes()==Image.open(os.path.join(OUT,'preview',f'nm_clothing_basic_adventurer_contact_{s}x_v1.png')).tobytes())
check('rebuilt 1x/2x/5x contact previews == staged previews (pixel exact)',ok)
check('metadata equals a regenerated metadata block',json.load(open(os.path.join(OUT,'nm_clothing_basic_adventurer_v1.json')))==json.loads(json.dumps(C.metadata(C.sha(os.path.join(OUT,C.SHEET))))))
pt=all(open(os.path.join(HERE,'parts',n+'.txt')).read()=='\n'.join(r)+'\n' for n,r in O.PARTS.items())
check('exported parts/*.txt match outfit_parts.py',pt)
open(os.path.join(OUT,'validation_report.txt'),'w').write('\n'.join(rep)+'\n\nFAILS: '+str(fails)+'\n')
print('\n'.join(rep));print('FAILS:',fails)
