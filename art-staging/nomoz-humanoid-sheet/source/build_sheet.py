"""Composes the Nomoz humanoid base sheets from hand-typed parts and validates them.
Run: python3 build_sheet.py   (writes PNG/JSON/preview next to this folder). Only Pillow is needed."""
import os, sys, json
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE)
sys.path.insert(0,HERE)
from parts import PARTS as P

FW,FH=40,48
DIRS=['down','left','right','up']
FRAMES=['idle0','idle1','walk0','walk1','walk2','walk3']
PAL={'O':'#17121f','S':'#f4d9bf','T':'#dcae90','U':'#b07f6a','K':'#e69a8a','E':'#20233f','W':'#ffffff','I':'#3f8fb5',
'a':'#2a1a14','b':'#4b2f22','c':'#7a4e33','d':'#a8714a','0':'#3c3a4a','1':'#5f5d73','2':'#8c8aa3','3':'#bdbbd2',
'p':'#24303f','q':'#3a4a60','r':'#587089','x':'#2e1e14','y':'#50321f','z':'#7d5230','w':'#a77a4a'}
RAMPS={'outline':'O','skin':'UTS','blush':'K','eye':'EWI','hair':'abcd','shirt':'0123','trousers':'pqr','leather':'xyzw'}
FAM={}
for fam,chars in(('skin','STUK'),('shirt','0123'),('pants','pqr'),('leather','xyzw'),('hair','abcd'),('eye','EWI')):
    for c in chars: FAM[c]=fam
TONES={'skin':'ST','shirt':'0123','pants':'pqr','leather':'xyzw','hair':'abcd'}
DARK={'3':'2','2':'1','1':'0','S':'T','T':'U','r':'q','q':'p','w':'z','z':'y','y':'x','d':'c','c':'b','b':'a'}

def darker(rows,n=1):
    out=[]
    for r in rows:
        s=''
        for ch in r:
            for _ in range(n): ch=DARK.get(ch,ch)
            s+=ch
        out.append(s)
    return out
def mirror_half(left,steps=(0,0,1,1,1,2,2)):
    n=len(left[0]);out=[]
    for r in left:
        right=''
        for j in range(n):
            ch=r[n-1-j]
            for _ in range(steps[min(j,len(steps)-1)]): ch=DARK.get(ch,ch)
            right+=ch
        out.append(r+right)
    return out
def relight_mirror(rows):
    """Mirror horizontally, then restore left-to-right tone order inside each material run so light stays upper-left.
    Feature pixels (blush, mouth, ear detail) keep mirrored positions; eye runs are flipped back as a unit."""
    out=[]
    for r in rows:
        m=list(r[::-1]); i=0
        while i<len(m):
            f=FAM.get(m[i])
            if f is None: i+=1; continue
            j=i
            while j<len(m) and FAM.get(m[j])==f: j+=1
            if f=='eye': m[i:j]=m[i:j][::-1]
            else:
                idx=[k for k in range(i,j) if m[k] in TONES[f]]
                vals=[m[k] for k in idx][::-1]
                for k,v in zip(idx,vals): m[k]=v
            i=j
        out.append(''.join(m))
    return out
def shear(rows,offs):
    mn=min(offs);mx=max(offs);w=len(rows[0])+mx-mn
    return ['.'*(o-mn)+r+'.'*(w-len(r)-(o-mn)) for r,o in zip(rows,offs)],mn
def leg_full(rows): return [rows[0]]*2+rows        # two hidden hip rows so the torso can bob without a gap
ARM_FWD=[0,0,-1,-1,-1,-2,-2,-2,-3,-3]; ARM_BACK=[0,0,1,1,1,2,2,2,3,3]
LEG_FWD=[0,0,0,0,-1,-1,-2,-2,-3,-3,-3,-3]; LEG_BACK=[0,0,0,0,1,1,2,2,3,3,3,3]; LEG_LIFT=[0,0,0,0,-1,-1,-1,-1,-2,-2,-2,-2]

class Cv:
    def __init__(s): s.g=[['.']*FW for _ in range(FH)]
    def place(s,rows,x,y,mirror=False):
        if mirror: rows=relight_mirror(rows); x=FW-x-len(rows[0])
        for dy,r in enumerate(rows):
            for dx,ch in enumerate(r):
                if ch!='.' and 0<=x+dx<FW and 0<=y+dy<FH: s.g[y+dy][x+dx]=ch
    def rows(s): return [''.join(r) for r in s.g]

# per-frame pose recipes -------------------------------------------------------------------
# down/up: (bob, head_dy, legL_dy, legR_dy, armL_dy, armR_dy); side: legs/arms pose names
FRONT={'idle0':(0,0,0,0,0,0),'idle1':(0,1,0,0,0,0),'walk0':(0,0,-2,0,-1,1),'walk1':(-1,0,0,-1,0,0),
       'walk2':(0,0,0,-2,1,-1),'walk3':(-1,0,-1,0,0,0)}
SIDE={'idle0':{},'idle1':dict(hd=1),
      'walk0':dict(nl='fwd',fl='back',na='back',fa='fwd'),'walk1':dict(bob=-1,nl='stand',fl='lift'),
      'walk2':dict(nl='back',fl='fwd',na='fwd',fa='back'),'walk3':dict(bob=-1,nl='lift',fl='stand')}

def front_parts(view):
    tl=P['torso_down_L'] if view=='down' else P['torso_up_L']
    return dict(torso=mirror_half(tl),head=P['head_'+view],hair=P['hair_'+view],armL=P['arm_down'],
                armR=darker(relight_mirror(P['arm_down']),1),leg=leg_full(P['leg_down']))
def build_front(view,fn,layer):
    d=front_parts(view);cv=Cv();bob,hd,ll,lr,al,ar=FRONT[fn];anch={}
    if layer=='body':
        cv.place(d['leg'],14,33+ll);cv.place(d['leg'],20,33+lr)
        cv.place(d['torso'],13,23+bob)
        cv.place(d['armL'],9,24+bob+al);cv.place(d['armR'],27,24+bob+ar)
        cv.place(d['head'],9,3+bob+hd)
    else: cv.place(d['hair'],9,3+bob+hd)
    anch=dict(head_origin=[9,3+bob+hd],hand_a=[11,32+bob+al],hand_b=[28,32+bob+ar])
    return cv.rows(),anch
def build_side(fn,layer,mirror):
    d=dict(torso=P['torso_left'],head=P['head_left'],hair=P['hair_left'],arm=P['arm_down'],leg=leg_full(P['leg_stand']))
    sp=SIDE[fn];bob=sp.get('bob',0);hd=sp.get('hd',0);cv=Cv()
    def legpose(k):
        if k in(None,'stand'): return d['leg'],0,0
        offs={'fwd':LEG_FWD,'back':LEG_BACK,'lift':LEG_LIFT}[k]
        r,mn=shear(d['leg'],offs);return r,mn,(-2 if k=='lift' else 0)
    def armpose(k):
        if k is None: return d['arm'],0
        r,mn=shear(d['arm'],ARM_FWD if k=='fwd' else ARM_BACK);return r,mn
    far_leg,fmn,fdy=legpose(sp.get('fl'));near_leg,nmn,ndy=legpose(sp.get('nl'))
    far_arm,famn=armpose(sp.get('fa'));near_arm,namn=armpose(sp.get('na'))
    if layer=='body':
        cv.place(darker(far_arm,1),19+famn,24+bob,mirror);cv.place(darker(far_leg,1),16+fmn,33+fdy,mirror)
        cv.place(near_leg,16+nmn,33+ndy,mirror);cv.place(d['torso'],15,23+bob,mirror)
        cv.place(near_arm,18+namn,24+bob,mirror);cv.place(d['head'],9,3+bob+hd,mirror)
    else: cv.place(d['hair'],9,3+bob+hd,mirror)
    hx=18+namn+2; fx=19+famn+2
    if mirror: hx=FW-1-hx; fx=FW-1-fx
    return cv.rows(),dict(head_origin=[(FW-9-22) if mirror else 9,3+bob+hd],hand_a=[hx,32+bob],hand_b=[fx,32+bob])
def build_frame(dname,fn,layer):
    if dname in('down','up'): return build_front(dname,fn,layer)
    return build_side(fn,layer,dname=='right')
def to_img(rows):
    im=Image.new('RGBA',(FW,FH),(0,0,0,0))
    for y,r in enumerate(rows):
        for x,ch in enumerate(r):
            if ch!='.': h=PAL[ch];im.putpixel((x,y),tuple(int(h[k:k+2],16) for k in(1,3,5))+(255,))
    return im
def sheet(layer):
    sh=Image.new('RGBA',(FW*len(FRAMES),FH*len(DIRS)),(0,0,0,0));anchors={};grids={}
    for ri,dn in enumerate(DIRS):
        for ci,fn in enumerate(FRAMES):
            rows,a=build_frame(dn,fn,layer);sh.paste(to_img(rows),(ci*FW,ri*FH));anchors[f'{dn}/{fn}']=a;grids[(dn,fn)]=rows
    return sh,anchors,grids
def contact_sheet(comp,path,scale=5):
    pad=26;W=FW*scale*len(FRAMES)+pad;H=FH*scale*len(DIRS)+pad
    bg=Image.new('RGBA',(W,H),(58,56,72,255));dr=ImageDraw.Draw(bg)
    for ci,fn in enumerate(FRAMES): dr.text((pad+ci*FW*scale+4,6),fn,fill=(230,230,240,255))
    for ri,dn in enumerate(DIRS):
        dr.text((2,pad+ri*FH*scale+4),dn[:2],fill=(230,230,240,255))
        for ci in range(len(FRAMES)):
            fr=comp.crop((ci*FW,ri*FH,ci*FW+FW,ri*FH+FH)).resize((FW*scale,FH*scale),Image.NEAREST)
            x0=pad+ci*FW*scale;y0=pad+ri*FH*scale
            dr.rectangle([x0,y0,x0+FW*scale-1,y0+FH*scale-1],outline=(88,86,104,255))
            bg.alpha_composite(fr,(x0,y0))
    bg.save(path)
CLOTH='0123pqrxyzw'
def underlayer_mask(grids):
    sh=Image.new('RGBA',(FW*len(FRAMES),FH*len(DIRS)),(0,0,0,0))
    for ri,dn in enumerate(DIRS):
        for ci,fn in enumerate(FRAMES):
            rows=grids[(dn,fn)];keep=set()
            for y,r in enumerate(rows):
                for x,ch in enumerate(r):
                    if ch in CLOTH: keep.add((x,y))
                    elif ch=='O':
                        for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                            xx,yy=x+dx,y+dy
                            if 0<=xx<FW and 0<=yy<FH and rows[yy][xx] in CLOTH: keep.add((x,y));break
            for (x,y) in keep: sh.putpixel((ci*FW+x,ri*FH+y),(255,255,255,255))
    return sh
def main():
    body,ab,gb=sheet('body');hair,ah,gh=sheet('hair');comp=body.copy();comp.alpha_composite(hair)
    names={'body':'nm_humanoid_base_body_sheet_v1.png','hair':'nm_humanoid_base_hair_default_sheet_v1.png','comp':'nm_humanoid_base_composite_sheet_v1.png'}
    body.save(os.path.join(OUT,names['body']));hair.save(os.path.join(OUT,names['hair']));comp.save(os.path.join(OUT,names['comp']))
    underlayer_mask(gb).save(os.path.join(OUT,'nm_humanoid_base_underlayer_mask_sheet_v1.png'))
    contact_sheet(comp,os.path.join(OUT,'preview','nm_humanoid_base_contact_sheet_5x.png'),5)
    contact_sheet(comp,os.path.join(OUT,'preview','nm_humanoid_base_contact_sheet_2x.png'),2)
    json.dump(dict(anchors=ab,hair_anchors=ah),open(os.path.join(HERE,'_anchors.json'),'w'))
    return body,hair,comp,ab,names
if __name__=='__main__': main(); print('built')
