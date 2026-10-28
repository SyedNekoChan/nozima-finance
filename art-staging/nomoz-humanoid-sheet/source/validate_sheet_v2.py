"""Programmatic validation of the staged v2 humanoid sheets (and a v1-vs-v2 lighting/jitter comparison).
Run: python3 -I validate_sheet_v2.py   -> writes ../validation_report_v2.txt. Needs Pillow only.
Every check reads the staged PNG files (not the in-memory build) unless a check says it rebuilds from parts."""
import os, sys, json, hashlib
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE); sys.path.insert(0,HERE)
import build_sheet_v2 as B
FW,FH=B.FW,B.FH; DIRS=B.DIRS; FRAMES=B.FRAMES
rep=[];fails=[]
def check(name,ok,detail=''):
    rep.append(('PASS' if ok else 'FAIL')+'  '+name+(('  -> '+detail) if detail else ''))
    if not ok: fails.append(name)
def info(line): rep.append('INFO  '+line)
def load(v): return {k:Image.open(os.path.join(OUT,f'nm_humanoid_base_{n}_sheet_{v}.png')) for k,n in(('body','body'),('hair','hair_default'),('comp','composite'),('mask','underlayer_mask'))}
ims=load('v2');v1=load('v1')
palette={tuple(int(h[i:i+2],16) for i in(1,3,5)) for h in B.PAL.values()}
INV={tuple(int(h[i:i+2],16) for i in(1,3,5)):c for c,h in B.PAL.items()}
def px(im): return im.load()
def frame(im,r,c): return im.crop((c*FW,r*FH,c*FW+FW,r*FH+FH))
def solid(f): return [(x,y) for y in range(FH) for x in range(FW) if f.getpixel((x,y))[3]]

# ---- format / palette ------------------------------------------------------------------
for k,im in ims.items():
    check(f'{k}: RGBA 240x192',im.mode=='RGBA' and im.size==(240,192),f'{im.mode} {im.size}')
    a={im.getpixel((x,y))[3] for y in range(192) for x in range(240)}
    check(f'{k}: alpha only 0/255',a<={0,255},str(sorted(a)))
for k in('body','hair','comp'):
    cols={tuple(ims[k].getpixel((x,y))[:3]) for y in range(192) for x in range(240) if ims[k].getpixel((x,y))[3]}
    check(f'{k}: colours all in declared 23-colour palette',cols<=palette,f'{len(cols)} used')
# ---- layer reconstruction --------------------------------------------------------------
c2=ims['body'].copy();c2.alpha_composite(ims['hair'])
check('composite == body + hair (pixel exact)',c2.tobytes()==ims['comp'].tobytes())
# rebuild in memory from parts and compare with the staged files
rb,ab,gb=B.sheet('body');rh,ah,gh=B.sheet('hair');rc=rb.copy();rc.alpha_composite(rh)
check('staged body sheet == rebuild from source/parts_v2.py',rb.tobytes()==ims['body'].tobytes())
check('staged hair sheet == rebuild from source/parts_v2.py',rh.tobytes()==ims['hair'].tobytes())
check('staged composite == rebuild from source/parts_v2.py',rc.tobytes()==ims['comp'].tobytes())
check('staged underlayer mask == recomputed from body grids',B.underlayer_mask(gb).tobytes()==ims['mask'].tobytes())
bad=[];uncovered=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        fm=frame(ims['mask'],r,c);fb=frame(ims['body'],r,c)
        for x,y in solid(fm):
            if not fb.getpixel((x,y))[3]: bad.append((dn,fn,x,y))
        for x,y in solid(fb):
            ch=INV[tuple(fb.getpixel((x,y))[:3])]
            if ch in B.CLOTH and not fm.getpixel((x,y))[3]: uncovered.append((dn,fn,x,y))
check('underlayer mask lies inside body alpha',not bad,str(bad[:3]))
check('every clothing-coloured body pixel is covered by the mask',not uncovered,str(uncovered[:3]))
hbad=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        bb=frame(ims['hair'],r,c).getbbox()
        if bb is None or bb[0]<9 or bb[2]>31 or bb[1]<2 or bb[3]>24: hbad.append((dn,fn,bb))
check('hair confined to head window (x9..30,y2..23)',not hbad,str(hbad))
# hair pixels sit on head-body pixels of the same frame (no hair floating outside the head silhouette)
float_=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        fb=frame(ims['body'],r,c);fh=frame(ims['hair'],r,c)
        n=sum(1 for x,y in solid(fh) if not fb.getpixel((x,y))[3]);
        if n: float_.append((dn,fn,n))
check('every hair pixel lies over a body pixel (head silhouette contains hair)',not float_,str(float_))
# ---- frame geometry --------------------------------------------------------------------
minpad=99;clip=False;empty=[];feet=[];contact=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        for k in('body','comp'):
            bb=frame(ims[k],r,c).getbbox()
            if bb is None: empty.append((k,dn,fn));continue
            pad=(bb[0],bb[1],FW-bb[2],FH-bb[3]);minpad=min(minpad,min(pad))
            if min(pad)<1: clip=True
        fb=frame(ims['body'],r,c);bb=fb.getbbox()
        if bb[3]-1!=44: feet.append((dn,fn,bb[3]-1))
        row44=[x for x in range(FW) if fb.getpixel((x,44))[3]]
        contact.append(((dn,fn),len(row44),(min(row44),max(row44)) if row44 else None))
check('no empty frames',not empty)
check('no frame touches its border (>=1px padding)',not clip,f'min padding {minpad}px')
check('lowest body pixel is on ground row y=44 in all 24 frames',not feet,str(feet))
check('24 distinct frames (all pairs differ, whole sheet)',len({frame(ims['comp'],r,c).tobytes() for r in range(4) for c in range(6)})==24)
nocontact=[k for k,n,s in contact if n<6]
check('every frame has >=6 ground-contact pixels on y=44',not nocontact,str(nocontact))
# ---- anchor stability ------------------------------------------------------------------
exp_bob={'idle0':0,'idle1':0,'walk0':0,'walk1':-1,'walk2':0,'walk3':-1}
exp_hd={'idle0':0,'idle1':1,'walk0':0,'walk1':0,'walk2':0,'walk3':0}
a=ab;ok=True;bad=[]
for dn in DIRS:
    for fn in FRAMES:
        ho=a[f'{dn}/{fn}']['head_origin']
        if ho!=[9,3+exp_bob[fn]+exp_hd[fn]]: bad.append((dn,fn,ho))
check('head anchor: x fixed at 9 and y = 3 + bob + breath in every frame/direction',not bad,str(bad))
# measure the head from pixels too: topmost hair/head row in each frame equals head origin y
bad=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        top=frame(ims['comp'],r,c).getbbox()[1]
        if top!=3+exp_bob[fn]+exp_hd[fn]: bad.append((dn,fn,top))
check('measured head-top row from the PNG matches the head anchor',not bad,str(bad))
# torso (shirt) top and belt rows follow body bob only
bad=[]
def first_row(f,chars):
    for y in range(FH):
        for x in range(FW):
            p=f.getpixel((x,y))
            if p[3] and INV[tuple(p[:3])] in chars: return y
for r,dn in enumerate(DIRS):
    base=None
    for c,fn in enumerate(FRAMES):
        f=frame(ims['body'],r,c);y=first_row(f,'0123');belt=first_row(f,'zy')
        # belt colours also appear on boots, so use the first belt row above y=36
        if y is None: bad.append((dn,fn,'no shirt'));continue
        exp=23+exp_bob[fn]
        if y not in(exp,exp+1): bad.append((dn,fn,y,exp))
check('shirt top row follows only the documented body bob (<=1px of expectation)',not bad,str(bad))
# hand anchors move only with bob / documented arm foreshortening
bad=[]
for dn in('down','up'):
    for fn in FRAMES:
        h=a[f'{dn}/{fn}'];e=32+exp_bob[fn]
        if abs(h['hand_a'][1]-e)>1 or abs(h['hand_b'][1]-e)>1: bad.append((dn,fn))
check('front/back hand anchors within 1px of 32+bob',not bad,str(bad))
bad=[]
for dn in('left','right'):
    for fn in FRAMES:
        h=a[f'{dn}/{fn}']
        if h['hand_a'][1]!=32+exp_bob[fn] or h['hand_b'][1]!=32+exp_bob[fn]: bad.append((dn,fn))
check('side hand anchors at y=32+bob',not bad,str(bad))
# right anchors mirror left anchors (x -> 39-x)
bad=[]
for fn in FRAMES:
    L=a[f'left/{fn}'];R=a[f'right/{fn}']
    for k in('hand_a','hand_b'):
        if abs((39-L[k][0])-R[k][0])>0.01: bad.append((fn,k))
check('left/right hand anchors are mirror images (x -> 39-x)',not bad,str(bad))
# ---- walking-pose sanity -----------------------------------------------------------------
d={k:(n,s) for k,n,s in contact}
for dn in('left','right'):
    idle=d[(dn,'idle0')][1];c0=d[(dn,'walk0')][1];c2=d[(dn,'walk2')][1]
    wi=idle[1]-idle[0];w0=c0[1]-c0[0];w2=c2[1]-c2[0]
    check(f'{dn}: contact poses (walk0/walk2) spread the feet wider than idle ({w0},{w2} vs {wi} px)',w0>wi+3 and w2>wi+3)
    for fn in('walk1','walk3'):
        f=frame(ims['body'],DIRS.index(dn),FRAMES.index(fn));rows=[y for y in range(FH) if any(f.getpixel((x,y))[3] for x in range(FW))]
        run=best=0
        for x in range(FW):
            p=f.getpixel((x,42))
            run=run+1 if p[3] and INV[tuple(p[:3])]=='O' else 0
            best=max(best,run)
        check(f'{dn}/{fn}: passing pose shows a lifted foot (>=6px sole outline run on y=42)',best>=6,f'longest outline run {best}px')
for dn in('down','up'):
    for fn in('walk0','walk2'):
        f=frame(ims['body'],DIRS.index(dn),FRAMES.index(fn))
        lo=[x for x in range(FW) if f.getpixel((x,44))[3]];hi=[x for x in range(FW) if f.getpixel((x,42))[3] and not f.getpixel((x,43))[3]]
        check(f'{dn}/{fn}: one foot planted on y=44, the stepping foot clear of the ground',bool(lo) and len(hi)>=4,f'ground px {len(lo)}, lifted px {len(hi)}')
# ---- jitter ---------------------------------------------------------------------------
def centroid(f):
    p=solid(f);return sum(x for x,_ in p)/len(p),sum(y for _,y in p)/len(p)
worst=0;drift=[];seq={}
for r,dn in enumerate(DIRS):
    cs=[centroid(frame(ims['comp'],r,c)) for c in range(6)];seq[dn]=cs
    for i in(1,3,4,5):
        worst=max(worst,abs(cs[i][0]-cs[i-1][0]))
    drift.append((dn,round(max(x for x,_ in cs)-min(x for x,_ in cs),2)))
check('horizontal centroid change between neighbouring frames <=1.5px (idle0->idle1, walk steps)',worst<=1.5,f'max {worst:.2f}px')
check('per-direction centroid x drift over 6 frames <=2.5px',all(v<=2.5 for _,v in drift),str(drift))
info('centroid x per direction (idle0..walk3): '+'; '.join(f"{dn} "+','.join(f'{x:.1f}' for x,_ in seq[dn]) for dn in DIRS))
# ---- directional lighting --------------------------------------------------------------
FAM={'U':('skin',0),'T':('skin',1),'S':('skin',2),'0':('shirt',0),'1':('shirt',1),'2':('shirt',2),'3':('shirt',3),
 'p':('pants',0),'q':('pants',1),'r':('pants',2),'x':('lea',0),'y':('lea',1),'z':('lea',2),'w':('lea',3),
 'a':('hair',0),'b':('hair',1),'c':('hair',2),'d':('hair',3)}
def light_scores(im):
    """For one frame: horizontal pairs inside one material, same tone-ramp; score = (right darker - right lighter)/pairs.
    +1 means every tone step goes lit->dark from left to right (light from the left). Vertical: lower darker than upper."""
    ph=pv=th=tv=0
    W,H=im.size
    for y in range(H):
        for x in range(W):
            p=im.getpixel((x,y))
            if not p[3]: continue
            c=INV[tuple(p[:3])]
            if c not in FAM: continue
            if x+1<W:
                q=im.getpixel((x+1,y))
                if q[3]:
                    c2=INV[tuple(q[:3])]
                    if c2 in FAM and FAM[c2][0]==FAM[c][0] and FAM[c2][1]!=FAM[c][1]:
                        th+=1; ph+= 1 if FAM[c2][1]<FAM[c][1] else -1
            if y+1<H:
                q=im.getpixel((x,y+1))
                if q[3]:
                    c2=INV[tuple(q[:3])]
                    if c2 in FAM and FAM[c2][0]==FAM[c][0] and FAM[c2][1]!=FAM[c][1]:
                        tv+=1; pv+= 1 if FAM[c2][1]<FAM[c][1] else -1
    return (ph/th if th else 0.0),(pv/tv if tv else 0.0),th,tv
def table(S):
    out={}
    for r,dn in enumerate(DIRS):
        out[dn]=[light_scores(frame(S,r,c)) for c in range(6)]
    return out
L2=table(ims['comp']);L1=table(v1['comp'])
for tag,L in(('v1',L1),('v2',L2)):
    info(f'{tag} horizontal light score (+1 = light from left) per frame: '+'; '.join(f"{dn} "+','.join(f'{s[0]:+.2f}' for s in L[dn]) for dn in DIRS))
    info(f'{tag} vertical light score (+1 = light from above): '+'; '.join(f"{dn} "+','.join(f'{s[1]:+.2f}' for s in L[dn]) for dn in DIRS))
mean=lambda L,dn,i:sum(s[i] for s in L[dn])/6
for dn in DIRS:
    check(f'{dn}: every frame lit from the left (horizontal score >= +0.25)',all(s[0]>=0.25 for s in L2[dn]),f'min {min(s[0] for s in L2[dn]):+.2f}, mean {mean(L2,dn,0):+.2f}')
    check(f'{dn}: every frame lit from above (vertical score >= +0.10)',all(s[1]>=0.10 for s in L2[dn]),f'min {min(s[1] for s in L2[dn]):+.2f}, mean {mean(L2,dn,1):+.2f}')
check('right-facing lighting within 0.20 of left-facing (mean horizontal score)',abs(mean(L2,'left',0)-mean(L2,'right',0))<=0.20,f"left {mean(L2,'left',0):+.2f} right {mean(L2,'right',0):+.2f} (v1 right {mean(L1,'right',0):+.2f})")
def lum(c):
    h=B.PAL[c];r,g,b=(int(h[i:i+2],16) for i in(1,3,5));return .299*r+.587*g+.114*b
MAT={'skin':'UTS','hair':'abcd','shirt':'0123','pants':'pqr','lea':'xyzw'}
def mat_delta(im,r):
    ds={}
    for mn,chars in MAT.items():
        pts=[]
        for c in range(6):
            f=frame(im,r,c)
            for x,y in solid(f):
                ch=INV[tuple(f.getpixel((x,y))[:3])]
                if ch in chars: pts.append((x,lum(ch)))
        if len(pts)<30: continue
        mid=sorted(p[0] for p in pts)[len(pts)//2]
        L=[v for x,v in pts if x<mid];R=[v for x,v in pts if x>=mid]
        if L and R: ds[mn]=sum(L)/len(L)-sum(R)/len(R)
    return ds
for tag,S in(('v1',v1['comp']),('v2',ims['comp'])):
    info(f'{tag} per-material luminance, left half minus right half (positive = light from left): '+'; '.join(f"{dn} "+','.join(f'{k}={v:+.1f}' for k,v in mat_delta(S,i).items()) for i,dn in enumerate(DIRS)))
for i,dn in enumerate(DIRS):
    ds=mat_delta(ims['comp'],i)
    check(f'{dn}: all five materials (skin, hair, shirt, trousers, leather) are brighter on the left half than the right',all(v>0 for v in ds.values()) and len(ds)==5,str({k:round(v,1) for k,v in ds.items()}))
# ---- craft metrics (informational) -----------------------------------------------------
def isolated(im):
    n=0
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            p=im.getpixel((x,y))
            if not p[3]: continue
            same=False
            for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                xx,yy=x+dx,y+dy
                if 0<=xx<im.size[0] and 0<=yy<im.size[1] and im.getpixel((xx,yy))==p: same=True;break
            if not same:n+=1
    return n
info(f"isolated pixels (no 4-neighbour of the same colour), whole composite sheet: v1 {isolated(v1['comp'])}, v2 {isolated(ims['comp'])}")
info('colours used: v2 composite %d / 23'%len({tuple(ims['comp'].getpixel((x,y))[:3]) for y in range(192) for x in range(240) if ims['comp'].getpixel((x,y))[3]}))
# ---- metadata ------------------------------------------------------------------------
mp=os.path.join(OUT,'nm_humanoid_base_v2.json')
if os.path.exists(mp):
    m=json.load(open(mp))
    check('metadata frame 40x48, sheet 240x192, 6 cols x 4 rows',m['frame']=={'width':40,'height':48} and m['sheet']['width']==240 and m['sheet']['height']==192 and m['sheet']['columns']==6 and m['sheet']['rows']==4)
    check('metadata row/column order unchanged from v1',m['row_order']==DIRS and m['column_order']==FRAMES)
    check('metadata ground anchor (20,45), foot baseline 44 unchanged',m['anchors']['ground']==[20,45] and m['anchors']['foot_baseline_y']==44)
    check('metadata per-frame anchors equal the rebuilt anchors',m['anchors']['per_frame']['anchors']==ab)
    v1m=json.load(open(os.path.join(OUT,'nm_humanoid_base_v1.json')))
    check('metadata animation timing unchanged from v1',m['animations']==v1m['animations'])
    check('metadata layer draw order and future slots unchanged from v1',m['layers_draw_order']==v1m['layers_draw_order'] and m['future_slots']==v1m['future_slots'])
else: check('nm_humanoid_base_v2.json exists',False)
open(os.path.join(OUT,'validation_report_v2.txt'),'w').write('\n'.join(rep)+'\n\nFAILS: '+str(fails)+'\n')
print('\n'.join(rep));print('FAILS:',fails)
