"""Composes the Nomoz humanoid base sheets from hand-typed parts and validates them.
Run: python3 build_sheet.py   (writes PNG/JSON/preview next to this folder). Only Pillow is needed."""
import os, sys, json
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE)
sys.path.insert(0,HERE)
from parts_v2 import PARTS as P

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
FRONT={'idle0':(0,0,0,0,None,None),'idle1':(0,1,0,0,None,None),'walk0':(0,0,-2,0,'long','short'),'walk1':(-1,0,0,-1,None,None),
       'walk2':(0,0,0,-2,'short','long'),'walk3':(-1,0,-1,0,None,None)}
SIDE={'idle0':{},'idle1':dict(hd=1),
      'walk0':dict(nl='fwd',fl='back',na='back',fa='fwd'),'walk1':dict(bob=-1,nl='stand',fl='lift'),
      'walk2':dict(nl='back',fl='fwd',na='fwd',fa='back'),'walk3':dict(bob=-1,nl='lift',fl='stand')}

def arm_var(rows,k):
    """front-view arm foreshortening: 'short' = hand raised 1px (swinging forward), 'long' = hand lowered 1px (swinging back)."""
    if k=='short': return rows[:7]+rows[8:]
    if k=='long': return rows[:8]+[rows[7]]+rows[8:]
    return rows
def front_parts(view):
    tl=P['torso_down_L'] if view=='down' else P['torso_up_L']
    return dict(torso=mirror_half(tl),head=P['head_'+view],hair=P['hair_'+view],armL=P['arm_down'],
                armR=darker(relight_mirror(P['arm_down']),1),leg=leg_full(P['leg_down']),legR=leg_full(P['leg_down_R']))
def build_front(view,fn,layer):
    d=front_parts(view);cv=Cv();bob,hd,ll,lr,al,ar=FRONT[fn]
    if layer=='body':
        cv.place(d['leg'],14,33+ll);cv.place(d['legR'],20,33+lr)
        cv.place(d['torso'],13,23+bob)
        cv.place(arm_var(d['armL'],al),9,24+bob);cv.place(arm_var(d['armR'],ar),27,24+bob)
        cv.place(d['head'],9,3+bob+hd)
    else: cv.place(d['hair'],9,3+bob+hd)
    dyh={'short':-1,'long':1,None:0}
    anch=dict(head_origin=[9,3+bob+hd],hand_a=[11,32+bob+dyh[al]],hand_b=[28,32+bob+dyh[ar]])
    return cv.rows(),anch
# side poses: near/far limb pose names (stand/fwd/back/lift); facing right uses the hand-authored *_r_* parts unmirrored.
ARMX={'stand':(18,2),'fwd':(16,2),'back':(16,5.5)}     # (box x, hand centre col) for the near arm; far arm is +1
def build_side(fn,layer,right):
    k='r' if right else 's'
    sp=SIDE[fn];bob=sp.get('bob',0);hd=sp.get('hd',0);cv=Cv()
    def put(name,x,y,dark=False):
        rows=P[name];x=FW-x-len(rows[0]) if right else x
        cv.place(darker(rows,1) if dark else rows,x,y)
    na=sp.get('na','stand');fa=sp.get('fa','stand');nl=sp.get('nl','stand');fl=sp.get('fl','stand')
    if layer=='body':
        put(f'arm_{k}_{fa}',ARMX[fa][0]+1,24+bob,True);put(f'leg_{k}_{fl}',12-(2 if fl=='lift' else 0),33,True)
        put(f'leg_{k}_{nl}',12-(2 if nl=='lift' else 0),33);put('torso_right' if right else 'torso_left',15,23+bob)
        put(f'arm_{k}_{na}',ARMX[na][0],24+bob);put('head_right' if right else 'head_left',9,3+bob+hd)
    else: put('hair_right' if right else 'hair_left',9,3+bob+hd)
    hx=ARMX[na][0]+ARMX[na][1];fx=ARMX[fa][0]+1+ARMX[fa][1]
    if right: hx=FW-1-hx;fx=FW-1-fx
    return cv.rows(),dict(head_origin=[9,3+bob+hd],hand_a=[round(hx,1),32+bob],hand_b=[round(fx,1),32+bob])
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
    names={'body':'nm_humanoid_base_body_sheet_v2.png','hair':'nm_humanoid_base_hair_default_sheet_v2.png','comp':'nm_humanoid_base_composite_sheet_v2.png'}
    body.save(os.path.join(OUT,names['body']));hair.save(os.path.join(OUT,names['hair']));comp.save(os.path.join(OUT,names['comp']))
    underlayer_mask(gb).save(os.path.join(OUT,'nm_humanoid_base_underlayer_mask_sheet_v2.png'))
    contact_sheet(comp,os.path.join(OUT,'preview','nm_humanoid_base_contact_sheet_5x_v2.png'),5)
    contact_sheet(comp,os.path.join(OUT,'preview','nm_humanoid_base_contact_sheet_2x_v2.png'),2)
    contact_sheet(comp,os.path.join(OUT,'preview','nm_humanoid_base_contact_sheet_1x_v2.png'),1)
    json.dump(dict(anchors=ab,hair_anchors=ah),open(os.path.join(HERE,'_anchors_v2.json'),'w'))
    return body,hair,comp,ab,names
if __name__=='__main__': main(); print('built')
