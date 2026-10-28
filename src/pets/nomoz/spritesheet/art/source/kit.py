"""
Small pixel-art toolkit for build_missing.py: load / crop / paste / row and
column surgery on 96x64 RGBA frames, plus parts re-extracted from the user's
reference at another scale and snapped to the palette of the approved frames.
Frames are numpy arrays (64, 96, 4); alpha is 0 or 255.
"""
import numpy as np
from PIL import Image
from pathlib import Path
HERE=Path(__file__).resolve().parent
ART=str(HERE.parent)+'/'
W,H=96,64
# the frames converted from the reference; everything else is built from these
APPROVED=['idle_front','walk_side','sit_threeq','sit_doze','sit_groom','sit_rear','curl','stretch']
def load(name,n=0):
    return np.array(Image.open(f'{ART}{name}/{n}.png').convert('RGBA'))
def blank(): return np.zeros((H,W,4),'uint8')
def save(a,path): Image.fromarray(a,'RGBA').save(path)
def op(a): return a[...,3]>0
def bbox(a):
    ys,xs=np.where(op(a)); return xs.min(),ys.min(),xs.max()+1,ys.max()+1
def crop(a,x0,y0,x1,y1):
    """a part: array (h,w,4) copy"""
    return a[y0:y1,x0:x1].copy()
def paste(dst,part,x,y):
    h,w=part.shape[:2]
    for yy in range(h):
        for xx in range(w):
            if part[yy,xx,3]>0 and 0<=y+yy<H and 0<=x+xx<W: dst[y+yy,x+xx]=part[yy,xx]
    return dst
def erase(a,x0,y0,x1,y1):
    a[y0:y1,x0:x1,3]=0; return a
def region(a,x0,y0,x1,y1):
    """array same size as a with only the region kept"""
    r=blank(); r[y0:y1,x0:x1]=a[y0:y1,x0:x1]; return r
def shift(a,dx,dy):
    r=blank()
    for y in range(H):
        for x in range(W):
            if a[y,x,3]>0 and 0<=y+dy<H and 0<=x+dx<W: r[y+dy,x+dx]=a[y,x]
    return r
def over(*layers):
    r=blank()
    for l in layers:
        m=l[...,3]>0; r[m]=l[m]
    return r
def delete_rows(a,y0,y1,x0=0,x1=W):
    """remove rows y0..y1 inside columns x0..x1, pulling everything below up"""
    r=a.copy(); n=y1-y0
    r[y0:H-n,x0:x1]=a[y1:H,x0:x1]; r[H-n:H,x0:x1,3]=0
    return r
def insert_rows(a,y0,n,x0=0,x1=W,src=None):
    """repeat row src (default y0) n times at y0 inside columns, pushing the rest down"""
    r=a.copy(); s=y0 if src is None else src
    r[y0+n:H,x0:x1]=a[y0:H-n,x0:x1]
    for i in range(n): r[y0+i,x0:x1]=a[s,x0:x1]
    return r
def ground(a,floor=61):
    """move so the lowest opaque row is on `floor`"""
    x0,y0,x1,y1=bbox(a); return shift(a,0,floor+1-y1)
def clean(a,minnb=3):
    r=a.copy(); m=op(a)
    for y in range(H):
        for x in range(W):
            if m[y,x]:
                nb=sum(1 for dy in(-1,0,1) for dx in(-1,0,1) if (dy or dx) and 0<=y+dy<H and 0<=x+dx<W and m[y+dy,x+dx])
                if nb<minnb: r[y,x,3]=0
    return r
def contact(frames,path,s=6,boost=3.2,gap=4):
    w=sum(f.shape[1] for f in frames)+gap*(len(frames)+1); 
    bg=Image.new('RGBA',(w,H+2*gap),(60,64,70,255)); x=gap
    for f in frames:
        bg.alpha_composite(Image.fromarray(f,'RGBA'),(x,gap)); x+=f.shape[1]+gap
    px=bg.load()
    for y in range(bg.size[1]):
        for xx in range(bg.size[0]):
            r,g,b,a=px[xx,y]
            if (r,g,b)!=(60,64,70) and max(r,g,b)<110: k=min(255,int(max(r,g,b)*boost)); px[xx,y]=(k,k,min(255,k+8),255)
    bg.resize((bg.size[0]*s,bg.size[1]*s),Image.NEAREST).convert('RGB').save(path)

# ---- parts re-extracted from the user's reference at another scale ----
import sys
import importlib.util
_spec=importlib.util.spec_from_file_location('conv',str(HERE/'convert_reference.py'))
conv=importlib.util.module_from_spec(_spec); _spec.loader.exec_module(conv)
def house_palette():
    import glob
    cols=set()
    files=[f for n in APPROVED for f in glob.glob(ART+n+'/[0-9].png')]
    for f in files:
        a=np.array(Image.open(f).convert('RGBA')); m=a[...,3]>0
        for c in a[m][:,:3]: cols.add(tuple(int(v) for v in c))
    cols=np.array(sorted(cols)); eye=np.array([c for c in cols if conv.is_yellow(c)]); fur=np.array([c for c in cols if not conv.is_yellow(c)])
    return fur,eye
FUR,EYE=house_palette()
def ref_part(box,scale,flip=False):
    """area-average a box of the reference down, snap to the house palette"""
    img=conv.downsample(box,scale,flip)
    return np.array(conv.clean(img,FUR,EYE))
