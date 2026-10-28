"""Necromancer: black-violet and bone gravecaller. Pointed tattered hood with shadowed brow and glowing green eyes, high collar with skull clasp,
long cloak with a ragged hem, bone-studded belt, skull-topped staff with green flame at the screen-left hand."""
from classlib import *
PAL={'G':'#261f38','H':'#3b3158','J':'#58497f','L':'#8274b0',      # cloak black-violet
     'x':'#77705a','y':'#bdb394','z':'#efe8cc',                    # bone
     'p':'#1c6a42','q':'#3fc06e','r':'#bfffd2',                    # grave-green glow
     'B':'#8e8ea8','C':'#d3d3e6',                                  # ash-white hair tuft
     'l':'#241a20','m':'#4a3140'}                                  # leather
cls=Cls('necromancer','Necromancer',PAL,['UTS','GHJL','xyz','pqr','BC','lm'],'#58e888')
cls.cfg['face_map']={'b':'B'};cls.cfg['legs']='boots'
P=cls.part
P('torso_down',[
"..OOGTTTTGOO..",
".OLJHxyyxHGGO.",
"OLJJHHzzHHHGGO",
"OLJJHHpqHHHGGO",
"OLJJHHxxHHHGGO",
"OLJHHGHHHHGHGO",
"OLJHHGHHGGGGGO",
"OJJHGGHHGGGGGO",
"OmmymmyymmymmO",
"OllllllzzllllO",
"OJHHHHHHHHHGGO",
"OOOOOOOOOOOOOO"])
P('torso_up',[
"..OOGTTTTGOO..",
".OLJJJTTJJHGO.",
"OLJJJxzzxHHGGO",
"OLJJHHxxHHHGGO",
"OLJJHxzzxHHGGO",
"OLJHHHxxHHHGGO",
"OJJHHxzzxHHGGO",
"OJHHHHxxHHHGGO",
"OllllllyyllllO",
"OmmmmmmmmmmmmO",
"OJHHHHHHHHHGGO",
"OOOOOOOOOOOOOO"])
P('torso_left',[
"..OTTTO...",
".OLJyyHHO.",
"OLJyzHHGGO",
"OLJHqHHGGO",
"OLJHxHHGGO",
"OLJHHGHGGO",
"OJJHHGHGGO",
"OJHHHGHGGO",
"OyllyllllO",
"OzmmmmmmmO",
"OJHHHHHGGO",
"OOOOOOOOOO"])
mirror_pair(cls,'torso_left','torso_right')
standard_limbs(cls,{'r':'H','q':'G','p':'G'},{'w':'y','z':'x','y':'x','x':'l'},{'w':'m','z':'l','y':'l','x':'l'},{'w':'l','z':'l','y':'l','x':'l'},
               {'3':'L','2':'J','1':'H'},ext=2,emap={'S':'H','T':'G','U':'G'},boots_only=True)
SK=["...OLJHHHHHHHHGGO...","...OLJJHHGHHHHGGO...","..OLJJHHHGHHHHGGGO..","..OLJJHHHGHHHHGGGO..",".OLJJHHHHGHHHHHGGGO.",".OLJJHHHHGHHHHHGGGO.",
    "OLJJHHHGHHHHHHGHHGGO","OLHH"*5,".OJO"*5]
P('skirt_0',SK);P('skirt_L',lift_side(SK,'L',7));P('skirt_R',lift_side(SK,'R',7))
SS=["...OJHHHHHGGO...","...OJHHHHHGGO...","..OJJHHHHHHGGO..","..OJJHHHHHHGGO..",".OJJHHHHGHHHGGO.",".OJJHHHHGHHHGGO.",".OJHHGHHHHHGGO..",".OJHHOJHHOHHGO..","..OJO.OJO.OJO..."][:9]
SS=[r.ljust(16,'.')[:16] for r in SS]
P('skirt_s0',SS);P('skirt_sfwd',shift_rows(SS,4,-1));P('skirt_sback',shift_rows(SS,4,1));P('skirt_slift',lift_side(SS,'L',7))
mirror_pair(cls,'skirt_s0','skirt_r0');mirror_pair(cls,'skirt_sfwd','skirt_rfwd');mirror_pair(cls,'skirt_sback','skirt_rback');mirror_pair(cls,'skirt_slift','skirt_rlift')
def skirt_front(ctx): return 'skirt_L' if ctx.ll<0 else ('skirt_R' if ctx.lr<0 else 'skirt_0')
def skirt_side(ctx):
    p='fwd' if ctx.nl=='fwd' else ('back' if ctx.nl=='back' else ('lift' if 'lift' in (ctx.nl,ctx.fl) else '0'))
    return f"skirt_{'r' if ctx.k=='r' else 's'}{p}"
cls.cfg['under']={'down':[dict(part=skirt_front,x=10,y=34)],'up':[dict(part=skirt_front,x=10,y=34)]}
cls.cfg['mid']={'left':[dict(part=skirt_side,x=12,y=34)],'right':[dict(part=skirt_side,x=12,y=34)]}
# bone shoulder plate (viewer-left shoulder) with spikes; plain tattered cloth on the other shoulder
P('bone_L',["..y.....","..xyO...",".OzzyO..","OzyyxxO.",".OxxxO.."])
P('bone_s',["..y...",".OzyO.","OzyxxO",".OxxO."])
mirror_pair(cls,'bone_s','bone_r')
cls.cfg['post_arm']={'down':[dict(part='bone_L',x=8,y=21)],'up':[dict(part='bone_L',x=8,y=21)],'left':[dict(part='hold_s',x=3,y=24,flip=False),dict(part='bone_s',x=17,y=21)],'right':[dict(part='hold_r',x=19,y=24,flip=False),dict(part='bone_r',x=17,y=21)]}

# ---------------- tattered hood overlays ----------------
NW=dict(W=26,H=26,ox=-2,oy=-1)
HOOD_TOP={-1:[(10,"OO")],0:[(8,"OLJHHO")],1:[(6,"OLJJHHHGGO")],2:[(3,"OLJJJJHHHHHHHGGO")],3:[(1,"OLJJJJJHHHHHHHHHGGGO")]}
side=lambda l,r:[(-1,"O"),(0,l),(19,r),(22,"O")]
P('ov_down',box(NW['W'],NW['H'],NW['ox'],NW['oy'],{**HOOD_TOP,
  4:[(0,"O"),(1,"LJJJJHHHHHHHHHHHGGGG"),(21,"O")],5:[(0,"O"),(1,"LJJJHHHHHHHHHHHHGGGG"),(21,"O")],6:[(0,"O"),(1,"JJHHHHHHHHHHHHHHHGGG"),(21,"O")],
  7:[(0,"O"),(1,"JHHG"),(17,"HGGG"),(21,"O"),(5,"GGGGGGGGGGGG")],8:[(0,"O"),(1,"JHHG"),(17,"HGGG"),(21,"O"),(4,"UTUTUTUTUTUTUT")],
  9:side("JHG","HGG")+[(3,"T"),(18,"T")],10:side("JHG","HGG")+[(3,"T"),(18,"T")],
  11:side("JHG","HGG")+[(3,"T"),(18,"T")],12:side("JHG","HGG")+[(3,"T"),(18,"T")],13:side("JHG","HGG")+[(3,"T"),(18,"T")],
  14:side("JHG","HGG")+[(3,"T"),(18,"T")],15:side("JHG","HGG"),16:side("JHG","HGG"),17:side("HHG","HGG"),
  18:[(-1,"O"),(0,"HGO"),(2,"OHG"),(19,"OGO"),(21,"GO")],19:[(0,"OGO"),(3,"O"),(19,"O")]}))
P('ov_up',box(NW['W'],NW['H'],NW['ox'],NW['oy'],{**HOOD_TOP,
  4:[(0,"O"),(1,"LJJJJHHHHHHHHHHHGGGG"),(21,"O")],5:[(0,"O"),(1,"LJJJHHHHHHHHHHHHGGGG"),(21,"O")],6:[(0,"O"),(1,"LJJHHHHGHHHHHHHHGGGG"),(21,"O")],
  7:[(0,"O"),(1,"JJHHHHHGHHHHHHHHHGGG"),(21,"O")],8:[(0,"O"),(1,"JHHHHHHGHHHHHHHHHGGG"),(21,"O")],9:[(0,"O"),(1,"JHHHHHHGHHHHHHHHHGGG"),(21,"O")],
  10:[(0,"O"),(1,"JHHHHHHGHHHHHHHHHGGG"),(21,"O")],11:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],12:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],
  13:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],14:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],15:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],
  16:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],17:[(0,"O"),(1,"HHHHHGGGGGGGGGGGHGG"),(20,"O")],
  18:[(0,"O"),(1,"HHGGGGGGGGGGGGGGGG"),(19,"O")],19:[(0,"OJHOHGOHHOHGOHHOGO")],20:[(1,"OOJO.OGO.OJO.OGOO")]}))
NL=dict(W=30,H=26,ox=-3,oy=-1)
P('ov_left',box(NL['W'],NL['H'],NL['ox'],NL['oy'],{**HOOD_TOP,
  4:[(0,"O"),(1,"LJJJHHHHHHHHHHHHGGGG"),(21,"O")],5:[(0,"O"),(1,"JJHHHHHHHHHHHHHHGGGG"),(21,"O")],6:[(1,"O"),(2,"JHHHHHHHHHHHHHHGGGG"),(21,"O")],
  7:[(2,"O"),(3,"JHHHHHHHHHHHHHGGG"),(20,"G"),(21,"O"),(1,"UUUUU")],8:[(2,"O"),(3,"JHHHHHHHHHHHHHGGG"),(20,"G"),(21,"O"),(1,"UTUT")],
  9:[(6,"O"),(7,"JHHHHHHHHHHHGG"),(21,"O")],10:[(8,"O"),(9,"JHHHHHHHHHHHG"),(21,"O")],
  11:[(8,"JGGHHHHHHHHGG"),(21,"O")],12:[(8,"JGGHHHHHHHHGG"),(21,"O")],13:[(8,"JGGHHHHHHHHGG"),(21,"O")],14:[(8,"HGGHHHHHHHHGG"),(21,"O")],
  15:[(8,"HGGHHHHHHHGGG"),(21,"O")],16:[(8,"HGGHHHHHHGGGG"),(21,"O")],17:[(8,"OHGGHHHGGGGGO")],18:[(8,"OHGOHHGOHGO")],19:[(9,"OG.OGO.OG")]}))
cls.cfg['head_over']={'down':('ov_down',-2,-1),'up':('ov_up',-2,-1),'left':('ov_left',-3,-1)}
mirror_overlay(cls,'ov_left','ov_right')
def skullstaff():
    top=["..p.p..",".pqpqp.","pqrqrqp",".pqrqp.","..pqp..",".OzzzO.","OzpzqzO","OzzzzzO",".OzxzO.","..OxO.."]
    rows=[r for r in top]+(["..OyO..","..OyO..","..OyO..","..OyO..","..OyO..","..OxO.."]*5)[:28]+["..OyO..","...O..."]
    return [r.ljust(7,'.')[:7] for r in rows]
cls.part('staff_down',skullstaff(),grip=(3,26))
# side views: staff held out in front of the hood and body by a forward forearm (same device as the Mage), so the skull no longer sits on the face
cls.part('staff_s',skullstaff())
mirror_pair(cls,'staff_s','staff_r')
P('hold_s',["..............OOO.",".............OLLLO",".............OLJJO","......OOOOOOOOJHHO",".OOOOOLLJJJJJJHHHO",".OSSTyJJJJHHHHHGGO",".OSTUyHHHHHGGGGGGO",".OOOOOOOOOOOOOOOOO"])
mirror_pair(cls,'hold_s','hold_r')
for _k in('stand','fwd','back'):
    for _f in('s','r'):
        cls.P[f'arm_{_f}_{_k}']=['.'*len(r) for r in cls.P[f'arm_{_f}_{_k}']]
cls.cfg['weapon']={'down':[dict(part='staff_down',hand='a',plant=True,dx=-3)],'up':[dict(part='staff_down',hand='a',plant=True,dx=-3)]}
cls.cfg['far_weapon']={'left':[dict(part='staff_s',x=2,y=5,follow=None,flip=False)],'right':[dict(part='staff_r',x=31,y=5,follow=None,flip=False)]}
cls.cfg['front']={}

fx(cls,'ov_up',-2,-1,[('L',4,6,8,[0]),('L',10,8,8,[0]),('L',14,6,6,[0]),('G',9,9,8,[0]),('G',13,9,8,[0]),('G',17,8,8,[0]),('J',3,5,4,[1])],'GHJL')
fx(cls,'ov_left',-3,-1,[('L',6,6,5,[1]),('L',12,8,6,[0]),('G',14,9,7,[0]),('G',18,8,8,[0])],'GHJL')
mirror_overlay(cls,'ov_left','ov_right')
