"""Builds the five Nomoz protagonist class sheets (Swordsman, Hunter, Assassin, Mage, Necromancer) on the humanoid base v2 layout,
plus metadata, parts export and previews. Run: python3 -I build_classes.py   (Pillow only).
Reads ../../nomoz-humanoid-sheet/source (rig, base face/limb parts); writes into the folder above this one."""
import os, sys, json, importlib
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__));OUT=os.path.dirname(HERE)
sys.path.insert(0,HERE)
import classlib as L
B=L.B;FW,FH,DIRS,FRAMES=L.FW,L.FH,L.DIRS,L.FRAMES
ORDER=['swordsman','hunter','assassin','mage','necromancer']
MODS={k:importlib.import_module('cls_'+k) for k in ORDER}
CLS={k:MODS[k].cls for k in ORDER}
FILE={k:f'nm_class_{k}_v1.png' for k in ORDER}
INFO={
 'swordsman':dict(keyword='wide shoulders + vertical blade',head='short spiky chestnut hair, crimson headband with trailing tails',body='steel pauldrons and breastplate over crimson, leather belt, short crimson cape, charcoal trousers with steel greaves',
   weapon='longsword carried on the back (hilt over the screen-right shoulder; full diagonal blade seen from behind; hanging blade seen from the side)',weapon_hand='none (carried)',accessories=['headband','cape','shoulder pauldrons']),
 'hunter':dict(keyword='cap peak + feather + vertical bow arc',head='soft peaked green cap with copper feather, copper hair with a long side braid',body='leather vest with cord lacing over a green tunic, green shoulder mantle, leather bracers, tall cuffed boots',
   weapon='recurve bow held at the screen-left hand; quiver with fletched arrows on the back',weapon_hand='screen-left (side views: near hand)',accessories=['quiver','braid','feathered cap','mantle']),
 'assassin':dict(keyword='narrow, low, hooded with scarf tails',head='pointed slate hood, crimson scarf mask over the mouth (eyes stay visible), long scarf tails',body='fitted dark jacket with leather harness and buckle, wrapped forearms, crossed sheaths on the back, low boots',
   weapon='two reverse-grip daggers pointing down at both hands',weapon_hand='both (side views: near hand)',accessories=['scarf mask','scarf tails','harness']),
 'mage':dict(keyword='tall bell: hat + robe + staff',head='floppy pointed blue hat with gold band and star, long lilac hair',body='V-neck blue robe with gold trim and sash, bell hem with slippers peeking out, long sleeves with trimmed cuffs',
   weapon='tall crystal staff planted at the screen-right hand',weapon_hand='screen-right (side views: near hand)',accessories=['hat','sash']),
 'necromancer':dict(keyword='ragged triangle + hood + skull staff',head='pointed tattered hood with shadowed brow, glowing green eyes',body='black-violet cloak with high collar and skull clasp, bone shoulder plate, bone-studded belt, ragged hem',
   weapon='skull-topped bone staff with green flame planted at the screen-left hand',weapon_hand='screen-left (side views: near hand)',accessories=['bone shoulder plate','skull clasp','ragged hem'])}
SHARED=['O','S','T','U','K','E','W']
def build_all():
    sheets={};anch={};grids={}
    for k in ORDER: sheets[k],anch[k],grids[k]=L.sheet(CLS[k])
    return sheets,anch,grids
def silhouette_sheet(sheets,path,scale=3):
    dirs=range(4);pad=4;W=len(ORDER)*(FW*scale+pad);Hh=4*(FH*scale+pad)
    bg=Image.new('RGBA',(W,Hh),(232,230,238,255))
    for ci,k in enumerate(ORDER):
        for r in dirs:
            fr=sheets[k].crop((0,r*FH,FW,r*FH+FH));sil=Image.new('RGBA',(FW,FH),(0,0,0,0))
            for y in range(FH):
                for x in range(FW):
                    if fr.getpixel((x,y))[3]: sil.putpixel((x,y),(30,28,40,255))
            bg.alpha_composite(sil.resize((FW*scale,FH*scale),Image.NEAREST),(ci*(FW*scale+pad),r*(FH*scale+pad)))
    bg.save(path)
def metadata(k,sheet,anch):
    c=CLS[k];bm=json.load(open(os.path.join(L.BASE,'nm_humanoid_base_v2.json')));I=INFO[k]
    deps={f:L.sha(os.path.join(L.BASE,f)) for f in['nm_humanoid_base_v2.json','source/parts_v2.py','source/parts.py','source/build_sheet_v2.py']}
    ramps={}
    for r in c.ramps: ramps[r]=[c.pal[ch] for ch in r]
    return {'id':f'nm_class_{k}','version':1,'category':'protagonist_class_sprite','class':c.title,
     'appearance':'fixed by class; equipment never changes this sprite (docs/nomoz/GAME_DESIGN.md section 6)',
     'sheet':{'file':FILE[k],'sha256':L.sha(os.path.join(OUT,FILE[k])),'width':240,'height':192,'columns':6,'rows':4},
     'frame':bm['frame'],'row_order':bm['row_order'],'column_order':bm['column_order'],'animations':bm['animations'],
     'anchors':{'ground':bm['anchors']['ground'],'foot_baseline_y':bm['anchors']['foot_baseline_y'],'body_axis_x':bm['anchors']['body_axis_x'],'head_window':bm['anchors']['head_window'],
                'per_frame':anch,'note':'hand_a/hand_b follow base v2 (screen-left/screen-right in down/up views, near/far in side views); weapons attach to them or are planted on y=44'},
     'design':{'silhouette_keyword':I['keyword'],'head':I['head'],'body':I['body'],'weapon':I['weapon'],'weapon_hand':I['weapon_hand'],'accessories':I['accessories'],
               'eye_iris':c.pal['I']},
     'palette':{'shared':{ch:c.pal[ch] for ch in SHARED},'iris':c.pal['I'],'class_ramps_dark_to_light':ramps,'colors_total':len({v for v in c.pal.values()}),'lighting':'upper-left'},
     'rig':{'uses':'humanoid base v2 pose recipes, part placements, face parts and limb geometry (build dependencies hashed below)','build_dependencies_sha256':deps,
            'secondary_motion':'1 px sway on walk contacts for capes, scarf tails, braids (head/body-anchored parts stay fixed); robe hems use lifted-side variants'},
     'scope':{'included':'idle (2 frames) and walk (4 frames) in four directions','excluded':['combat poses','portraits/UI','runtime integration','NPCs','creatures']}}
def export_parts():
    for k in ORDER:
        d=os.path.join(HERE,'parts',k);os.makedirs(d,exist_ok=True)
        for n,r in CLS[k].P.items(): open(os.path.join(d,n+'.txt'),'w').write('\n'.join(r)+'\n')
def main():
    sheets,anch,grids=build_all();pv=os.path.join(OUT,'preview');os.makedirs(pv,exist_ok=True)
    for k in ORDER: sheets[k].save(os.path.join(OUT,FILE[k]))
    for k in ORDER: json.dump(metadata(k,sheets[k],anch[k]),open(os.path.join(OUT,f'nm_class_{k}_v1.json'),'w'),indent=1)
    for sc in(1,2,5):
        L.contact([sheets[k] for k in ORDER],os.path.join(pv,f'nm_classes_gallery_{sc}x_v1.png'),sc,[CLS[k].title for k in ORDER],cols=[0],dirs=range(4))
        for k in ORDER: L.contact([sheets[k]],os.path.join(pv,f'nm_class_{k}_contact_{sc}x_v1.png'),sc,[CLS[k].title])
    L.contact([sheets[k] for k in ORDER],os.path.join(pv,'nm_classes_walk_2x_v1.png'),2,[CLS[k].title for k in ORDER],cols=[2,3,4,5],dirs=range(4))
    silhouette_sheet(sheets,os.path.join(pv,'nm_classes_silhouettes_v1.png'))
    export_parts()
    json.dump({'set':'nm_class_sprites','version':1,'classes':[{'id':f'nm_class_{k}','file':FILE[k],'metadata':f'nm_class_{k}_v1.json','sha256':L.sha(os.path.join(OUT,FILE[k]))} for k in ORDER],
               'gallery_order':ORDER,'note':'local staging index only; not a game manifest'},open(os.path.join(OUT,'nm_class_set_v1.json'),'w'),indent=1)
    return sheets,anch,grids
if __name__=='__main__': main();print('built')
