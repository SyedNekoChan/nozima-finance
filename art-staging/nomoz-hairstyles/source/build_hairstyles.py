"""Builds the three Nomoz hairstyle sheets (short, medium, long) on the humanoid base v2 layout + composited previews.
Run: python3 -I build_hairstyles.py  (Pillow only). Reads ../../nomoz-humanoid-sheet/*_v2.png and ../../nomoz-clothing-basic-adventurer/*."""
import os, sys, json, hashlib
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE); ROOT=os.path.dirname(OUT)
BASE=os.path.join(ROOT,'nomoz-humanoid-sheet');CLO=os.path.join(ROOT,'nomoz-clothing-basic-adventurer')
sys.path.insert(0,HERE);sys.path.insert(0,os.path.join(BASE,'source'));sys.path.insert(0,os.path.join(CLO,'source'))
import build_sheet_v2 as B
import outfit_parts as OP
import hair_parts as H
FW,FH,DIRS,FRAMES=B.FW,B.FH,B.DIRS,B.FRAMES
STYLES=['short','medium','long']
FILE={s:f'nm_hairstyle_{s}_v1.png' for s in STYLES}
PAL=dict(B.PAL);PAL.update(OP.PAL_O)
for s in STYLES: PAL.update(H.PAL[s])
def rgb(ch): h=PAL[ch];return tuple(int(h[i:i+2],16) for i in(1,3,5))
INV={rgb(c):c for c in PAL}

# ---------------- secondary motion (hand-chosen per style/direction/frame): shift the tail/lock rows sideways ----------------
# (first window row, first window col, last window col, {frame: dx}); applied to rows >= first row inside the column span
SWAY={('medium','down'):[(20,12,23,{'walk0':-1}),(20,-2,11,{'walk2':1})],
      ('medium','left'):[(20,8,22,{'walk0':1,'walk2':1})],
      ('medium','right'):[(20,-1,13,{'walk0':-1,'walk2':-1})],
      ('long','down'):[(26,-1,10,{'walk0':1}),(26,11,22,{'walk2':-1})],
      ('long','left'):[(25,12,22,{'walk0':1,'walk2':1})],
      ('long','right'):[(25,-1,9,{'walk0':-1,'walk2':-1})]}
def sway(style,dn,fn,rows):
    b=H.BOX[style];rows=[list(r) for r in rows]
    for y0,c0,c1,table in SWAY.get((style,dn),[]):
        dx=table.get(fn,0)
        if not dx: continue
        for k in range(len(rows)):
            if k+b['oy']<y0: continue
            seg=[(x,rows[k][x]) for x in range(c0-b['ox'],c1-b['ox']+1) if 0<=x<b['W'] and rows[k][x]!='.']
            for x,_ in seg: rows[k][x]='.'
            for x,ch in seg:
                nx=x+dx;assert 0<=nx<b['W'],(style,dn,fn,k,x,dx);rows[k][nx]=ch
    return [''.join(r) for r in rows]
def head_y(dn,fn):
    if dn in('down','up'): bob,hd=B.FRONT[fn][0],B.FRONT[fn][1]
    else: s=B.SIDE[fn];bob,hd=s.get('bob',0),s.get('hd',0)
    return 3+bob+hd
def hair_rows_for(style,dn,fn):
    return sway(style,dn,fn,H.PARTS[(style,dn)])
def paint(style,dn,fn):
    b=H.BOX[style];rows=hair_rows_for(style,dn,fn);hx,hy=9,head_y(dn,fn)
    cells={}
    for k,r in enumerate(rows):
        for j,ch in enumerate(r):
            if ch!='.': cells[(hx+b['ox']+j,hy+b['oy']+k)]=ch
    return cells
def build(style):
    sh=Image.new('RGBA',(FW*6,FH*4),(0,0,0,0));anch={}
    for r,dn in enumerate(DIRS):
        for c,fn in enumerate(FRAMES):
            cells=paint(style,dn,fn)
            for (x,y),ch in cells.items():
                assert 0<=x<FW and 0<=y<FH,(style,dn,fn,x,y)
                sh.putpixel((c*FW+x,r*FH+y),rgb(ch)+(255,))
            anch[f'{dn}/{fn}']=dict(head_origin=[9,head_y(dn,fn)],box_origin=[9+H.BOX[style]['ox'],head_y(dn,fn)+H.BOX[style]['oy']])
    return sh,anch
def load(p): return Image.open(p).convert('RGBA')
def layers():
    return (load(os.path.join(BASE,'nm_humanoid_base_body_sheet_v2.png')),load(os.path.join(CLO,'nm_clothing_basic_adventurer_sheet_v1.png')),
            load(os.path.join(BASE,'nm_humanoid_base_hair_default_sheet_v2.png')))
def composite(body,clo,hair):
    c=body.copy();c.alpha_composite(clo);c.alpha_composite(hair);return c
def contact(sheets,path,scale,labels):
    """sheets: list of 240x192 composites side by side (one per style); rows = directions, columns = frames."""
    pad=26;gap=10;n=len(sheets);cw=FW*scale*6
    W=pad+n*cw+(n-1)*gap;Hh=FH*scale*4+pad+12
    bg=Image.new('RGBA',(W,Hh),(58,56,72,255));dr=ImageDraw.Draw(bg)
    for si,(sh,lab) in enumerate(zip(sheets,labels)):
        x0=pad+si*(cw+gap);dr.text((x0+2,2),lab,fill=(250,250,160,255))
        for ci,fn in enumerate(FRAMES): dr.text((x0+ci*FW*scale+3,13),fn,fill=(210,210,225,255))
        for ri,dn in enumerate(DIRS):
            if si==0: dr.text((2,pad+12+ri*FH*scale+4),dn[:2],fill=(230,230,240,255))
            for ci in range(6):
                fr=sh.crop((ci*FW,ri*FH,ci*FW+FW,ri*FH+FH)).resize((FW*scale,FH*scale),Image.NEAREST)
                xx=x0+ci*FW*scale;yy=pad+12+ri*FH*scale
                dr.rectangle([xx,yy,xx+FW*scale-1,yy+FH*scale-1],outline=(88,86,104,255));bg.alpha_composite(fr,(xx,yy))
    bg.save(path)
def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
DESIGN={'short':'Short practical cut: compact cap that follows the head silhouette, clean arched hairline with forehead visible, short sideburns, ears exposed, tapered jagged nape. Ink/blue-grey palette.',
 'medium':'Medium layered cut: fuller silhouette (1-2 px overhang), side-swept fringe, layered lower locks ending at the jaw with outward flicks, scalloped three-lobe hem at the back. Auburn palette.',
 'long':'Long cut: curtain bangs around a forehead triangle, side curtains continuing into two chest locks (front), a long fall over the back (up) or behind the body (side) with a stepped tip. Pale-gold palette.'}
COVER={'may_cover':['head skin','head outline pixels (hair draws its own outline)','nape/ear skin as designed per direction','clothing: shoulders/chest (long front locks), upper back (long, up view), torso back edge (long, side tail)'],
 'must_not_cover':['eyes, brows, nose bump, blush/mouth pixels of the base head','hands and forearms (body skin at y >= 27+bob)'],
 'overhang':{'short':'none (stays inside the base head silhouette)','medium':'up to 2 px beyond the head window on the sides/top (box ox=-2, oy=-2)','long':'up to 2 px beyond the window sides; falls below the head to window row 27 (about y=30+bob)'}}
def anchors_for(s):
    return build(s)[1]
def metadata(s,sheet,anch):
    b=H.BOX[s];bm=json.load(open(os.path.join(BASE,'nm_humanoid_base_v2.json')));cm=json.load(open(os.path.join(CLO,'nm_clothing_basic_adventurer_v1.json')))
    hs=lambda d,fs:{f:sha(os.path.join(d,f)) for f in fs}
    return {'id':f'nm_hairstyle_{s}','version':1,'category':'hairstyle','slot':'hair','style':s,
     'base':{'id':'nm_humanoid_base','version':2,'files_sha256':hs(BASE,['SPEC_v2.md','nm_humanoid_base_v2.json','nm_humanoid_base_body_sheet_v2.png','nm_humanoid_base_hair_default_sheet_v2.png','nm_humanoid_base_underlayer_mask_sheet_v2.png'])},
     'clothing':{'id':'nm_clothing_basic_adventurer','version':1,'files_sha256':hs(CLO,['nm_clothing_basic_adventurer_sheet_v1.png','nm_clothing_basic_adventurer_v1.json'])},
     'sheet':{'file':FILE[s],'sha256':sha(os.path.join(OUT,FILE[s])),'width':240,'height':192,'columns':6,'rows':4},
     'frame':bm['frame'],'row_order':bm['row_order'],'column_order':bm['column_order'],'animations':bm['animations'],
     'anchors':{'head_anchor':'frame (9, 3+bob+breath); head window 22x20 (base anchors unchanged)','part_box':{'width':b['W'],'height':b['H'],'origin_offset_from_head_anchor':[b['ox'],b['oy']]},'per_frame':anch},
     'layer':{'draw_order':['body (nm_humanoid_base_body_sheet_v2)','clothing (nm_clothing_basic_adventurer_sheet_v1 or none)','hair: this sheet instead of nm_humanoid_base_hair_default_sheet_v2'],
       'compositing':'alpha-over per 40x48 cell; hair is the top-most of these layers','swappable':'independent: replaces only the default hair layer; body and clothing sheets are not modified'},
     'coverage':COVER,
     'palette':{'outline':'#17121f (shared)','ramp_dark_to_light':[H.PAL[s][c] for c in H.RAMP[s]],'lighting':'upper-left'},
     'design':DESIGN[s],
     'secondary_motion':[{'from_window_row':r,'window_cols':[c0,c1],'dx_by_frame':t} for r,c0,c1,t in SWAY.get((s,d),[])] if False else {d:[{'from_window_row':r,'window_cols':[c0,c1],'dx_by_frame':t} for r,c0,c1,t in SWAY.get((s,d),[])] for d in DIRS},
     'authoring':{'hand_typed':'window/box rows for all four directions, typed separately per direction (right-facing is not run through a mirror)','post_process':'despeckle of single mid-tone pixels (medium, long) then coordinate-placed strand strokes; see hair_parts.py'},
     'excludes':['headwear','accessories','alternate outfits','weapons']}
def export_parts():
    d=os.path.join(HERE,'parts');os.makedirs(d,exist_ok=True)
    for (s,n),r in H.PARTS.items(): open(os.path.join(d,f'{s}_{n}.txt'),'w').write('\n'.join(r)+'\n')
def main():
    body,clo,hdef=layers();sheets={};anch={}
    for s in STYLES:
        sh,a=build(s);sh.save(os.path.join(OUT,FILE[s]));sheets[s]=sh;anch[s]=a
    os.makedirs(os.path.join(OUT,'preview'),exist_ok=True);comps={}
    for s in STYLES:
        comps[s]=composite(body,clo,sheets[s]);comps[s].save(os.path.join(OUT,'preview',f'nm_hairstyle_{s}_composite_sheet_v1.png'))
    for sc in(1,2,5): contact([comps[s] for s in STYLES],os.path.join(OUT,'preview',f'nm_hairstyles_contact_{sc}x_v1.png'),sc,STYLES)
    export_parts()
    for st in STYLES: json.dump(metadata(st,sheets[st],anch[st]),open(os.path.join(OUT,f'nm_hairstyle_{st}_v1.json'),'w'),indent=1)
    return sheets,anch,comps
if __name__=='__main__': main();print('built')
