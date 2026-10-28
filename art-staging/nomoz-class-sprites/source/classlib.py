"""Shared compositor for the five Nomoz class sprites. Reuses the humanoid base v2 rig (pose recipes, part placements, anchors) and its
face/skin parts; every class supplies its own torso, headwear, limb finish, accessories and weapon (see cls_*.py).
Pillow only."""
import os, sys, json, hashlib
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE); ROOT=os.path.dirname(OUT)
BASE=os.path.join(ROOT,'nomoz-humanoid-sheet')
sys.path.insert(0,os.path.join(BASE,'source'))
import build_sheet_v2 as B
BP=B.P
FW,FH,DIRS,FRAMES=B.FW,B.FH,B.DIRS,B.FRAMES
COMMON={'O':'#17121f','S':'#f4d9bf','T':'#dcae90','U':'#b07f6a','K':'#e69a8a','E':'#20233f','W':'#ffffff'}

def box(W,H,ox,oy,spec):
    """rows for a part box: spec {y:[(wx,text),...]} in head-window (or part) coordinates; box origin offset (ox,oy)."""
    rows=[]
    for y in range(oy,oy+H):
        cells=['.']*W
        for wx,t in spec.get(y,[]):
            for i,ch in enumerate(t):
                bx=wx-ox+i
                assert 0<=bx<W,(y,wx,t,W,ox)
                if ch!=' ': cells[bx]=ch
        rows.append(''.join(cells))
    return rows
def recolor(rows,m): return [''.join(m.get(c,c) for c in r) for r in rows]
def shift_rows(rows,y0,dx,cmin=0,cmax=None):
    """shift rows >= y0 (row index) horizontally by dx inside columns [cmin,cmax]; clips are errors"""
    rows=[list(r) for r in rows];cmax=len(rows[0])-1 if cmax is None else cmax
    for k in range(y0,len(rows)):
        seg=[(x,rows[k][x]) for x in range(cmin,cmax+1) if rows[k][x]!='.']
        for x,_ in seg: rows[k][x]='.'
        for x,ch in seg:
            assert 0<=x+dx<len(rows[0]),('sway clip',k,x,dx);rows[k][x+dx]=ch
    return [''.join(r) for r in rows]

class Cls:
    def __init__(s,key,title,pal,ramps,iris):
        s.key,s.title=key,title;s.pal=dict(COMMON);s.pal.update(pal);s.pal['I']=iris
        s.ramps=ramps                          # list of dark->light ramp strings (used by darker / relight)
        s.P={};s.cfg={};s.dark={}
        for r in ramps:
            for i in range(1,len(r)): s.dark[r[i]]=r[i-1]
    def part(s,name,rows,grip=None):
        assert len({len(r) for r in rows})==1,(s.key,name,[(i,len(r)) for i,r in enumerate(rows)])
        s.P[name]=rows
        if grip: s.cfg.setdefault('grips',{})[name]=grip
    def padpart(s,name,rows,grip=None):
        w=max(len(r) for r in rows);s.part(name,[r.ljust(w,'.') for r in rows],grip)
    def darker(s,rows,n=1):
        out=[]
        for r in rows:
            t=''
            for ch in r:
                for _ in range(n): ch=s.dark.get(ch,ch)
                t+=ch
            out.append(t)
        return out
    def relight_mirror(s,rows):
        fam={}
        for r in s.ramps:
            for c in r: fam[c]=r
        out=[]
        for r in rows:
            m=list(r[::-1]);i=0
            while i<len(m):
                f=fam.get(m[i])
                if f is None: i+=1;continue
                j=i
                while j<len(m) and fam.get(m[j])==f: j+=1
                idx=list(range(i,j));vals=sorted((m[k] for k in idx),key=f.index,reverse=True)
                for k,v in zip(idx,vals): m[k]=v
                i=j
            out.append(''.join(m))
        return out
    def rgb(s,ch): h=s.pal[ch];return tuple(int(h[i:i+2],16) for i in(1,3,5))

# ---------------- derived limb parts (role-based recolour of the base v2 geometry, then hand patches in cls_*.py) ----------------
def derive_leg(rows,tmap,cuff,bmap,sole):
    """base leg pose -> class leg: trousers r/q/p via tmap; first boot row = cuff map; last boot row = sole map; others bmap."""
    boot=[i for i,r in enumerate(rows) if any(c in r for c in 'wzyx')]
    out=[]
    for i,r in enumerate(rows):
        m=cuff if (boot and i==boot[0]) else (sole if (boot and i==boot[-1]) else bmap)
        out.append(''.join(tmap.get(c,c) if c in 'rqp' else (m.get(c,c) if c in 'wzyx' else c) for c in r))
    return out
def derive_arm(rows,smap,ext=0,emap=None,glove=0,gmap=None):
    """base arm pose -> class arm. sleeve chars 3/2/1 via smap; the first `ext` skin rows via emap (long sleeve / bracer);
    the last `glove` skin rows via gmap (glove)."""
    skin=[i for i,r in enumerate(rows) if any(c in r for c in 'STU')]
    out=[]
    for i,r in enumerate(rows):
        t=''
        for ch in r:
            if ch in '321': ch=smap[ch]
            elif ch in 'STU':
                k=skin.index(i)
                if k<ext and emap: ch=emap.get(ch,ch)
                elif glove and k>=len(skin)-glove and gmap: ch=gmap.get(ch,ch)
            t+=ch
        out.append(t)
    return out

# ---------------- frame composition ----------------
class Ctx: pass
def build_frame(cls,dn,fn):
    cfg=cls.cfg;cv=B.Cv();ctx=Ctx();ctx.fn=fn;ctx.dn=dn
    right=dn=='right';anch={}
    def get(name,dark=False):
        rows=cls.P[name]
        return cls.darker(rows,1) if dark else rows
    def place(name,x,y,dark=False,sway=None,flip_x=True):
        rows=get(name,dark)
        if sway:
            y0,tab=sway;dx=tab.get(fn,0)
            if dx: rows=shift_rows(rows,y0,dx)
        if right and flip_x: x=FW-x-len(rows[0])
        cv.place(rows,x,y)
    items=lambda key:cfg.get(key,{}).get(dn,[])
    if dn in('down','up'):
        bob,hd,ll,lr,al,ar=B.FRONT[fn];hy=3+bob+hd
        ctx.bob=bob;ctx.hd=hd
        hands={'a':(11,32+bob+{'short':-1,'long':1,None:0}[al]),'b':(28,32+bob+{'short':-1,'long':1,None:0}[ar])}
        run(cls,items('back'),ctx,place,hands)
        if cfg.get('legs','pants')=='pants' or cfg.get('legs')=='boots':
            nm='boots' if cfg.get('legs')=='boots' else 'leg'
            cv.place(B.leg_full(cls.P[nm+'_down']),14,33+ll);cv.place(B.leg_full(cls.P[nm+'_down_R']),20,33+lr)
        ctx.ll=ll;ctx.lr=lr
        run(cls,items('under'),ctx,place,hands)
        place('torso_'+dn,13,23+bob,flip_x=False)
        run(cls,items('mid'),ctx,place,hands)
        place_rows(cv,B.arm_var(cls.P['arm_down_L'],al),9,24+bob);place_rows(cv,B.arm_var(cls.P['arm_down_R'],ar),27,24+bob)
        run(cls,items('post_arm'),ctx,place,hands)
        place_rows(cv,recolor_head(cls,BP['head_'+dn]),9,hy)
        ov=cfg['head_over'][dn];place(ov[0],9+ov[1],hy+ov[2],flip_x=False)
        run(cls,items('front'),ctx,place,hands)
        run(cls,items('weapon'),ctx,place,hands)
        anch=dict(head_origin=[9,hy],hand_a=list(hands['a']),hand_b=list(hands['b']))
    else:
        sp=B.SIDE[fn];bob=sp.get('bob',0);hd=sp.get('hd',0);hy=3+bob+hd;k='r' if right else 's'
        na=sp.get('na','stand');fa=sp.get('fa','stand');nl=sp.get('nl','stand');fl=sp.get('fl','stand')
        ctx.bob=bob;ctx.hd=hd;ctx.na=na;ctx.fa=fa;ctx.nl=nl;ctx.fl=fl;ctx.k=k
        hx=B.ARMX[na][0]+B.ARMX[na][1];fx=B.ARMX[fa][0]+1+B.ARMX[fa][1]
        if right: hx=FW-1-hx;fx=FW-1-fx
        hands={'a':(round(hx,1),32+bob),'b':(round(fx,1),32+bob)}
        run(cls,items('back'),ctx,place,hands)
        place(f'arm_{k}_{fa}',B.ARMX[fa][0]+1,24+bob,dark=True)
        lg=cfg.get('legs','pants')
        legname='leg' if lg=='pants' else 'boots'
        place(f'{legname}_{k}_{fl}',12-(2 if fl=='lift' else 0),33,dark=True)
        place(f'{legname}_{k}_{nl}',12-(2 if nl=='lift' else 0),33)
        run(cls,items('far_weapon'),ctx,place,hands)
        run(cls,items('under'),ctx,place,hands)
        place('torso_right' if right else 'torso_left',15,23+bob)
        run(cls,items('mid'),ctx,place,hands)
        place(f'arm_{k}_{na}',B.ARMX[na][0],24+bob)
        run(cls,items('post_arm'),ctx,place,hands)
        place_rows(cv,recolor_head(cls,BP['head_right' if right else 'head_left']),9,hy)
        ov=cfg['head_over'][dn];place(ov[0],9+ov[1],hy+ov[2],flip_x=False)
        run(cls,items('front'),ctx,place,hands)
        run(cls,items('weapon'),ctx,place,hands)
        anch=dict(head_origin=[9,hy],hand_a=list(hands['a']),hand_b=list(hands['b']))
    return cv.rows(),anch
def place_rows(cv,rows,x,y): cv.place(rows,x,y)
def recolor_head(cls,rows):
    m=cls.cfg.get('face_map')
    return recolor(rows,m) if m else rows
def run(cls,lst,ctx,place,hands):
    """item: dict(part=str|callable(ctx), x,y, follow='body'|'head'|None, dark=bool, hand='a'|'b'|None, sway=(row0,{fn:dx}), flip=bool)"""
    for it in lst:
        name=it['part'](ctx) if callable(it['part']) else it['part']
        if name is None: continue
        follow=it.get('follow','body')
        dy={'body':ctx.bob,'head':ctx.bob+ctx.hd,None:0}[follow]
        if it.get('hand'):
            gx,gy=cls.cfg['grips'][name];hx,hy=hands[it['hand']]
            x=int(round(hx))-gx+it.get('dx',0);y=hy-gy+it.get('dy',0)     # parts are typed for the facing they are used in
            if it.get('plant'): y=45-len(cls.P[name])+it.get('dy',0)       # planted on the ground line (y=44), independent of the bob
            place(name,x,y,dark=it.get('dark',False),sway=it.get('sway'),flip_x=False);continue
        x=it['x'](ctx) if callable(it['x']) else it['x']
        place(name,x,it['y']+dy,dark=it.get('dark',False),sway=it.get('sway'),flip_x=it.get('flip',True))


def to_img(cls,rows):
    im=Image.new('RGBA',(FW,FH),(0,0,0,0))
    for y,r in enumerate(rows):
        for x,ch in enumerate(r):
            if ch!='.': im.putpixel((x,y),cls.rgb(ch)+(255,))
    return im
def sheet(cls):
    sh=Image.new('RGBA',(FW*6,FH*4),(0,0,0,0));anch={};grids={}
    for r,dn in enumerate(DIRS):
        for c,fn in enumerate(FRAMES):
            rows,a=build_frame(cls,dn,fn);sh.paste(to_img(cls,rows),(c*FW,r*FH));anch[f'{dn}/{fn}']=a;grids[(dn,fn)]=rows
    return sh,anch,grids
def contact(sheets,path,scale,labels=None,cols=range(6),dirs=range(4),title=True):
    pad=26;gap=10;n=len(sheets);cw=FW*scale*len(list(cols))
    W=pad+n*cw+(n-1)*gap;Hh=FH*scale*len(list(dirs))+pad+12
    bg=Image.new('RGBA',(W,Hh),(58,56,72,255));dr=ImageDraw.Draw(bg)
    for si,sh in enumerate(sheets):
        x0=pad+si*(cw+gap)
        if labels: dr.text((x0+2,2),labels[si],fill=(250,250,160,255))
        for ci,c in enumerate(cols): dr.text((x0+ci*FW*scale+3,13),FRAMES[c],fill=(210,210,225,255))
        for ri,r in enumerate(dirs):
            if si==0: dr.text((2,pad+12+ri*FH*scale+4),DIRS[r][:2],fill=(230,230,240,255))
            for ci,c in enumerate(cols):
                fr=sh.crop((c*FW,r*FH,c*FW+FW,r*FH+FH)).resize((FW*scale,FH*scale),Image.NEAREST)
                xx=x0+ci*FW*scale;yy=pad+12+ri*FH*scale
                dr.rectangle([xx,yy,xx+FW*scale-1,yy+FH*scale-1],outline=(88,86,104,255));bg.alpha_composite(fr,(xx,yy))
    bg.save(path)
def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()


def standard_limbs(cls,tm,cuff,bmap,sole,sm,ext=0,emap=None,glove=0,gmap=None,boots_only=False,darkR=True):
    """create leg_*/boots_*/arm_* parts from the base v2 geometry with the class finish (hand patches are applied by the class file)."""
    def leg(rows):
        r=derive_leg(rows,tm,cuff,bmap,sole)
        return recolor(r,{c:'.' for c in set(tm.values())}) if boots_only else r
    nm='boots' if boots_only else 'leg'
    cls.part(nm+'_down',leg(BP['leg_down']));cls.part(nm+'_down_R',cls.darker(leg(BP['leg_down_R'])) if darkR else leg(BP['leg_down_R']))
    for pose in('stand','fwd','back','lift'):
        cls.part(f'{nm}_s_{pose}',leg(BP['leg_s_'+pose]));cls.part(f'{nm}_r_{pose}',leg(BP['leg_r_'+pose]))
    ARM=lambda rows:derive_arm(rows,sm,ext=ext,emap=emap,glove=glove,gmap=gmap)
    cls.part('arm_down_L',ARM(BP['arm_down']));cls.part('arm_down_R',cls.darker(cls.relight_mirror(cls.P['arm_down_L'])))
    for pose in('stand','fwd','back'):
        cls.part('arm_s_'+pose,ARM(BP['arm_s_'+pose]));cls.part('arm_r_'+pose,ARM(BP['arm_r_'+pose]))
def mirror_pair(cls,left,right,darker=False):
    r=cls.relight_mirror(cls.P[left])
    cls.part(right,cls.darker(r) if darker else r)

def mirror_overlay(cls,left,right):
    """right-facing overlay = mirrored/re-lit copy of the left one; the box origin mirrors about the head window centre (wx -> 21-wx)."""
    name,ox,oy=cls.cfg['head_over']['left'];W=len(cls.P[left][0])
    cls.part(right,cls.relight_mirror(cls.P[left]));cls.cfg['head_over']['right']=(right,21-(ox+W-1),oy)

def lift_side(rows,side,r0):
    """hem lift for walking robes: on the given half ('L' = columns left of centre, 'R' = right) rows from r0 move up by one row."""
    h=len(rows[0])//2;out=[list(r) for r in rows]
    cols=range(0,h) if side=='L' else range(h,len(rows[0]))
    for k in range(r0,len(rows)):
        for x in cols:
            out[k-1][x]=rows[k][x] if rows[k][x]!='.' else out[k-1][x]
            out[k][x]='.'
    return [''.join(r) for r in out]

def fx(cls,name,ox,oy,strokes,allowed):
    """hand-placed strand/fold strokes: (char, window x, window y, length, [dx per step]); only recolours existing pixels whose char is in `allowed`."""
    rows=[list(r) for r in cls.P[name]]
    for ch,wx,y,n,dxs in strokes:
        x=wx
        for i in range(n):
            yy=y+i-oy;xx=x-ox
            if 0<=yy<len(rows) and 0<=xx<len(rows[0]) and rows[yy][xx] in allowed: rows[yy][xx]=ch
            x+=dxs[i%len(dxs)]
    cls.P[name]=[''.join(r) for r in rows]
