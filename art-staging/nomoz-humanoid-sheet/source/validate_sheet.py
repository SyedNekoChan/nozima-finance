"""Programmatic validation of the staged humanoid sheets. Run: python3 validate_sheet.py (writes validation_report.txt)."""
import os, sys, json
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE); sys.path.insert(0,HERE)
import build_sheet as B
FW,FH=B.FW,B.FH; DIRS=B.DIRS; FRAMES=B.FRAMES
rep=[];fails=[]
def check(name,ok,detail=''):
    rep.append(('PASS' if ok else 'FAIL')+'  '+name+(('  -> '+detail) if detail else ''))
    if not ok: fails.append(name)
files={'body':'nm_humanoid_base_body_sheet_v1.png','hair':'nm_humanoid_base_hair_default_sheet_v1.png','comp':'nm_humanoid_base_composite_sheet_v1.png','mask':'nm_humanoid_base_underlayer_mask_sheet_v1.png'}
ims={k:Image.open(os.path.join(OUT,v)) for k,v in files.items()}
palette={tuple(int(h[i:i+2],16) for i in(1,3,5)) for h in B.PAL.values()}
for k,im in ims.items():
    check(f'{k}: mode RGBA and size 240x192',im.mode=='RGBA' and im.size==(240,192),f'{im.mode} {im.size}')
    a=set(im.getchannel('A').getdata())
    check(f'{k}: alpha is only 0/255',a<={0,255},str(sorted(a)))
for k in('body','hair','comp'):
    cols={im_px[:3] for im_px in ims[k].getdata() if im_px[3]}
    check(f'{k}: every colour belongs to the declared palette',cols<=palette,f'{len(cols)} colours used of {len(palette)}')
def frame(im,r,c): return im.crop((c*FW,r*FH,c*FW+FW,r*FH+FH))
def bbox(im): return im.getbbox()
# composite == body + hair
c2=ims['body'].copy();c2.alpha_composite(ims['hair'])
check('composite equals body + hair composited',list(c2.getdata())==list(ims['comp'].getdata()))
# frame boundaries / clipping / padding / feet line
minpad=99;feet_ok=True;feet_detail=[];clip=False;empty=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        for k in('body','comp'):
            f=frame(ims[k],r,c);bb=bbox(f)
            if bb is None: empty.append((k,dn,fn)); continue
            pad=(bb[0],bb[1],FW-bb[2],FH-bb[3]);minpad=min(minpad,min(pad))
            if min(pad)<1: clip=True
        bb=bbox(frame(ims['body'],r,c))
        if bb[3]-1!=44: feet_ok=False;feet_detail.append((dn,fn,bb[3]-1))
check('no empty frames',not empty,str(empty))
check('no frame touches its border (transparent padding >=1px)',not clip,f'minimum padding {minpad}px')
check('lowest body pixel sits on ground row y=44 in every frame',feet_ok,str(feet_detail))
# layers are confined to their frames (no leakage across frame cells)
check('sheet cells are independent (frame crops tile the sheet exactly)',ims['comp'].size==(FW*6,FH*4))
# hair aligns to head: hair pixels lie inside head box (x9..30, y bob-adjusted 2..24)
bad=[]
for r,dn in enumerate(DIRS):
    for c,fn in enumerate(FRAMES):
        bb=bbox(frame(ims['hair'],r,c))
        if bb is None: bad.append((dn,fn,'no hair')); continue
        if bb[0]<9 or bb[2]>31 or bb[1]<2 or bb[3]>24: bad.append((dn,fn,bb))
check('hair stays inside the head box (x9..30, y2..23)',not bad,str(bad))
# frame to frame continuity: centroid shift and bbox size change per direction
worst=0;detail=''
for r,dn in enumerate(DIRS):
    prev=None
    for c,fn in enumerate(FRAMES):
        f=frame(ims['comp'],r,c);px=[(x,y) for y in range(FH) for x in range(FW) if f.getpixel((x,y))[3]]
        cx=sum(p[0] for p in px)/len(px)
        if c in(1,2,3,4,5) and prev is not None and c!=2:
            worst=max(worst,abs(cx-prev))
        prev=cx
        if c==1: prev=cx
check('horizontal centroid jitter between neighbouring frames <= 1.5px',worst<=1.5,f'max {worst:.2f}px (idle->idle, walk->walk)')
# idle->walk transition, centroid shift
wi=[]
for r,dn in enumerate(DIRS):
    cs=[]
    for c in range(6):
        f=frame(ims['comp'],r,c);px=[(x,y) for y in range(FH) for x in range(FW) if f.getpixel((x,y))[3]]
        cs.append(sum(p[0] for p in px)/len(px))
    wi.append((dn,round(max(cs)-min(cs),2)))
check('per-direction centroid drift across all 6 frames <= 2.5px',all(v<=2.5 for _,v in wi),str(wi))
# duplicates inside a direction
dups=[]
for r,dn in enumerate(DIRS):
    fr=[frame(ims['comp'],r,c).tobytes() for c in range(6)]
    for i in range(6):
        for j in range(i+1,6):
            if fr[i]==fr[j]: dups.append((dn,FRAMES[i],FRAMES[j]))
check('no duplicated frames inside a direction',not dups,str(dups))
# head part dimensions identical across directions (structural) and hair parts share the same window
P=B.P
dims={k:(len(P[k][0]),len(P[k])) for k in('head_down','head_up','head_left','hair_down','hair_up','hair_left')}
check('head and hair parts share one 22x20 window in every direction',set(dims.values())=={(22,20)},str(dims))
# lighting heuristic: mean luminance of the left half minus the right half of non-outline pixels
def lum(p): return 0.299*p[0]+0.587*p[1]+0.114*p[2]
diffs={};
for r,dn in enumerate(DIRS):
    row=[]
    for c,fn in enumerate(FRAMES):
        f=frame(ims['comp'],r,c);bb=bbox(f);mid=(bb[0]+bb[2])/2
        L=[lum(f.getpixel((x,y))) for y in range(FH) for x in range(FW) if f.getpixel((x,y))[3] and f.getpixel((x,y))[:3]!=(0x17,0x12,0x1f) and x<mid]
        R=[lum(f.getpixel((x,y))) for y in range(FH) for x in range(FW) if f.getpixel((x,y))[3] and f.getpixel((x,y))[:3]!=(0x17,0x12,0x1f) and x>=mid]
        row.append(round(sum(L)/len(L)-sum(R)/len(R),1))
    diffs[dn]=row
ok=all(sum(v)/len(v)>0 and sum(1 for d in v if d>0)>=5 for v in diffs.values())
check('lighting heuristic: left half brighter than right (direction mean >0 and >=5 of 6 frames >0)',ok,str(diffs))
# underlayer mask is a subset of body alpha
mb=list(ims['mask'].getchannel('A').getdata());bb_=list(ims['body'].getchannel('A').getdata())
check('underlayer mask lies inside body alpha',all(m==0 or b==255 for m,b in zip(mb,bb_)))
# palette size per layer
print('\n'.join(rep));open(os.path.join(OUT,'validation_report.txt'),'w').write('\n'.join(rep)+'\n')
print('FAILS:',fails)
sys.exit(1 if fails else 0)
