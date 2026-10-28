"""Builds the Basic Adventurer clothing sheet on the humanoid base v2 layout and renders composited previews.
Run: python3 -I build_clothing.py   (needs Pillow only; reads ../../nomoz-humanoid-sheet/*_v2.png, writes next to this folder)."""
import os, sys, json, hashlib
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE); ROOT=os.path.dirname(OUT)
BASE=os.path.join(ROOT,'nomoz-humanoid-sheet')
sys.path.insert(0,HERE); sys.path.insert(0,os.path.join(BASE,'source'))
import build_sheet_v2 as B
import outfit_parts as O
P=O.PARTS
FW,FH,DIRS,FRAMES=B.FW,B.FH,B.DIRS,B.FRAMES
PAL=dict(B.PAL);PAL.update(O.PAL_O)
SHEET='nm_clothing_basic_adventurer_sheet_v1.png'
def rgb(ch): h=PAL[ch];return tuple(int(h[i:i+2],16) for i in(1,3,5))
INV={rgb(c):c for c in PAL}

def paint_frame(dn,fn):
    """paints the outfit parts for one frame in the same order/offsets the base body uses (parts only; the base mask clips them)."""
    cv=B.Cv()
    if dn in('down','up'):
        bob,hd,ll,lr,al,ar=B.FRONT[fn]
        cv.place(B.leg_full(P['c_leg_down']),14,33+ll);cv.place(B.leg_full(P['c_leg_down_R']),20,33+lr)
        cv.place(P['c_torso_'+dn],13,23+bob)
        cv.place(P['c_sleeve_L'],9,24+bob);cv.place(P['c_sleeve_R'],27,24+bob)
        return cv.rows()
    right=dn=='right';k='r' if right else 's';sp=B.SIDE[fn];bob=sp.get('bob',0)
    def put(name,x,y,dark=False):
        rows=P[name];x=FW-x-len(rows[0]) if right else x
        cv.place(O.darker(rows,1) if dark else rows,x,y)
    na=sp.get('na','stand');fa=sp.get('fa','stand');nl=sp.get('nl','stand');fl=sp.get('fl','stand')
    put(f'c_arm_{k}_{fa}',B.ARMX[fa][0]+1,24+bob,True)
    put(f'c_leg_{k}_{fl}',12-(2 if fl=='lift' else 0),33,True)
    put(f'c_leg_{k}_{nl}',12-(2 if nl=='lift' else 0),33)
    put('c_torso_right' if right else 'c_torso_left',15,23+bob)
    put(f'c_arm_{k}_{na}',B.ARMX[na][0],24+bob)
    return cv.rows()

def build():
    body=Image.open(os.path.join(BASE,'nm_humanoid_base_body_sheet_v2.png')).convert('RGBA')
    mask=Image.open(os.path.join(BASE,'nm_humanoid_base_underlayer_mask_sheet_v2.png')).convert('RGBA')
    sh=Image.new('RGBA',(FW*6,FH*4),(0,0,0,0));stats={}
    for r,dn in enumerate(DIRS):
        for c,fn in enumerate(FRAMES):
            rows=paint_frame(dn,fn);outside=0;unpainted=[];filled=0
            for y in range(FH):
                for x in range(FW):
                    X,Y=c*FW+x,r*FH+y
                    ch=rows[y][x]
                    if mask.getpixel((X,Y))[3]:
                        if ch!='.' and ch!='O' and INV[body.getpixel((X,Y))[:3]]=='O':
                            # a colour pixel that lands on a body outline pixel (head-bottom outline over the collar): keep the outline colour
                            sh.putpixel((X,Y),rgb('O')+(255,));filled+=1
                        elif ch!='.': sh.putpixel((X,Y),rgb(ch)+(255,))
                        elif INV[body.getpixel((X,Y))[:3]]=='O':    # underlayer outline pixel the parts did not paint: same colour, fill
                            sh.putpixel((X,Y),rgb('O')+(255,));filled+=1
                        else: unpainted.append((x,y))
                    elif ch!='.': outside+=1
            stats[f'{dn}/{fn}']=dict(clipped_by_body=outside,outline_filled=filled,unpainted=unpainted)
    return sh,stats

def composite(body,clo,hair):
    c=body.copy();c.alpha_composite(clo);c.alpha_composite(hair);return c
def contact_sheet(comp,path,scale):
    pad=26;W=FW*scale*6+pad;H=FH*scale*4+pad
    bg=Image.new('RGBA',(W,H),(58,56,72,255));dr=ImageDraw.Draw(bg)
    for ci,fn in enumerate(FRAMES): dr.text((pad+ci*FW*scale+4,6),fn,fill=(230,230,240,255))
    for ri,dn in enumerate(DIRS):
        dr.text((2,pad+ri*FH*scale+4),dn[:2],fill=(230,230,240,255))
        for ci in range(6):
            fr=comp.crop((ci*FW,ri*FH,ci*FW+FW,ri*FH+FH)).resize((FW*scale,FH*scale),Image.NEAREST)
            x0=pad+ci*FW*scale;y0=pad+ri*FH*scale
            dr.rectangle([x0,y0,x0+FW*scale-1,y0+FH*scale-1],outline=(88,86,104,255));bg.alpha_composite(fr,(x0,y0))
    bg.save(path)
def sha(path): return hashlib.sha256(open(path,'rb').read()).hexdigest()
BASE_FILES=['SPEC_v2.md','nm_humanoid_base_v2.json','nm_humanoid_base_body_sheet_v2.png','nm_humanoid_base_hair_default_sheet_v2.png',
            'nm_humanoid_base_composite_sheet_v2.png','nm_humanoid_base_underlayer_mask_sheet_v2.png']
def metadata(sheet_sha):
    base=json.load(open(os.path.join(BASE,'nm_humanoid_base_v2.json')))
    return {
     'id':'nm_clothing_basic_adventurer','version':1,'category':'clothing','slot':'outfit',
     'base':{'id':'nm_humanoid_base','version':2,'files_sha256':{f:sha(os.path.join(BASE,f)) for f in BASE_FILES}},
     'sheet':{'file':SHEET,'sha256':sheet_sha,'width':240,'height':192,'columns':6,'rows':4},
     'frame':base['frame'],'row_order':base['row_order'],'column_order':base['column_order'],'animations':base['animations'],
     'anchors':{'reuses':'nm_humanoid_base_v2.json anchors (ground [20,45], foot baseline y=44, head window, hand anchors); clothing carries no anchors of its own',
                'measured_in_validation':{'torso_top_y':'23+bob','belt_top_y':'31+bob (front/back/side)','boot_sole_bottom_y':44}},
     'layer':{'name':'clothing_outfit','draw_order':['body (nm_humanoid_base_body_sheet_v2)','clothing_outfit (this sheet)','hair (nm_humanoid_base_hair_default_sheet_v2)'],
              'compositing':'alpha-over, per frame, same 40x48 cell','notes':['clothing replaces the default underlayer (shirt, trousers, boots); transparent pixels reveal base skin/outline',
              'hair is drawn after clothing; hair never overlaps clothing in any frame (validated)']},
     'coverage':{'contract':'clothing alpha == nm_humanoid_base_underlayer_mask_sheet_v2.png alpha, pixel exact, in all 24 frames',
                 'overhang':'none; no clothing pixel lies outside the underlayer mask (no hem/cuff overhang, no neck or hand coverage)',
                 'outline_fill':'underlayer outline pixels not painted by an outfit part are filled with outline colour O (#17121f)'},
     'palette':{'outline':'#17121f (shared with base)','ramps':{n:[O.PAL_O[c] for c in chars] for n,chars in O.RAMPS.items()},'colors_including_outline':len(O.PAL_O)+1,
                'lighting':'upper-left'},
     'design':{'name':'Basic Adventurer','pieces':['green field tunic with linen collar lacing, placket and sleeve cuffs','leather belt with brass buckle (front/side), plain belt (back)',
               'khaki trousers','dark chestnut boots with tan cuff band and welt sole'],'excludes':['weapons','accessories','armor variants','alternate outfits']},
     'authoring':{'hand_typed':['torso front/back/left/right','sleeves (front, side stand/fwd/back, left+right facing)','front/back legs'],
                  'derived_then_checked':['side-view leg pose variants: role-based recolour of base leg pose geometry (needed for exact coverage)','right-facing legs: mirrored draft of the left-facing legs, tones re-ordered so light stays upper-left']},
     'future_slots':base['future_slots'],
    }
def export_parts():
    d=os.path.join(HERE,'parts');os.makedirs(d,exist_ok=True)
    for n,r in P.items(): open(os.path.join(d,n+'.txt'),'w').write('\n'.join(r)+'\n')
def main():
    clo,stats=build()
    body=Image.open(os.path.join(BASE,'nm_humanoid_base_body_sheet_v2.png')).convert('RGBA')
    hair=Image.open(os.path.join(BASE,'nm_humanoid_base_hair_default_sheet_v2.png')).convert('RGBA')
    clo.save(os.path.join(OUT,SHEET));export_parts()
    json.dump(metadata(sha(os.path.join(OUT,SHEET))),open(os.path.join(OUT,'nm_clothing_basic_adventurer_v1.json'),'w'),indent=1)
    comp=composite(body,clo,hair);os.makedirs(os.path.join(OUT,'preview'),exist_ok=True)
    comp.save(os.path.join(OUT,'preview','nm_clothing_basic_adventurer_composite_sheet_v1.png'))
    for s in(1,2,5): contact_sheet(comp,os.path.join(OUT,'preview',f'nm_clothing_basic_adventurer_contact_{s}x_v1.png'),s)
    json.dump(stats,open(os.path.join(HERE,'_build_stats.json'),'w'))
    return clo,stats
if __name__=='__main__':
    clo,stats=main()
    bad={k:v['unpainted'] for k,v in stats.items() if v['unpainted']}
    print('built; frames with unpainted underlayer pixels:',len(bad));
    for k,v in list(bad.items())[:24]: print(' ',k,v[:12])
