"""Swordsman: steel-and-crimson vanguard. Spiky chestnut hair with red headband, steel pauldrons + breastplate over crimson, short crimson cape,
charcoal trousers with steel greaves, upright longsword at the screen-right hand."""
from classlib import *
PAL={'A':'#2c1b14','B':'#4f3020','C':'#7e4e2c','D':'#b07a46',          # hair
     'e':'#2c3442','f':'#55627a','g':'#8b9ab3','h':'#d2deee',          # steel
     'r':'#561425','s':'#8c2035','t':'#c23c40',                         # crimson
     'l':'#36241a','m':'#62402a','n':'#946a3e',                         # leather
     'p':'#262c3b','q':'#3f475c',                                       # trousers
     'x':'#8a6422','y':'#dba843'}                                       # gold
cls=Cls('swordsman','Swordsman',PAL,['UTS','ABCD','efgh','rst','lmn','pq','xy'],'#3f8fb5')
cls.cfg['face_map']={'b':'B'}
P=cls.part
# ---------------- torso ----------------
P('torso_down',[
"..OOtTTTTtOO..",
".OfgtsTTrsgfO.",
"OhgetttsrrenmO",
"OhhehhgggnmgfO",
"OhgeghhhnmefeO",
"OhgeggnmgfefeO",
"OffegnmhgfefeO",
"OfenmfggffeeeO",
"OllllllyyllllO",
"OmmmmmmxxmmmmO",
"OtttsssssssrrO",
"OOOOOOOOOOOOOO"])
P('torso_up',[
"..OOtTTTTtOO..",
".OtttttTTsssO.",
"OsttttsssssrrO",
"OstttttsssrrrO",
"OsttttssserrrO",
"OsttsssssrrrrO",
"OstsssrsrrrrrO",
"OsssssrsrrrrrO",
"OllllllllllfeO",
"OmmmmmmmmmnnmO",
"OsssssrrrrrrrO",
"OOOOOOOOOOOOOO"])
P('torso_left',[
"..OTTTO...",
".OhhgssrO.",
"OhhggfssrO",
"OhgggfssrO",
"OhgggfssrO",
"OhgggfssrO",
"OhggffssrO",
"OfggffssrO",
"OyylllllfO",
"OxmmmmmnmO",
"OtttssssrO",
"OOOOOOOOOO"])
# ---------------- head overlays (spiky chestnut hair + crimson headband); window coordinates, face stays visible ----------------
HC={'down':dict(W=26,H=22,ox=-2,oy=-1),'up':dict(W=26,H=22,ox=-2,oy=-1),'left':dict(W=28,H=22,ox=-2,oy=-1)}
def cap(extra):
    d={-1:[(5,"O"),(10,"OO"),(15,"O")],0:[(4,"OCDO"),(9,"OCDDO"),(14,"OCDO")],
       1:[(3,"OOO"),(6,"CDDCBBBBBA"),(16,"OOO")],2:[(1,"OO"),(3,"CDDDDCCBBBBBBBBA"),(19,"OO")],
       3:[(0,"OO"),(2,"CDDCCCBBBBBBBBBBAA"),(20,"OO")],4:[(0,"O"),(1,"CDCCCBBBBBBBBBBBBAAA"),(21,"O")]}
    d.update(extra);return d
band=lambda y,s: [(0,"O"),(1,s),(21,"O")]
P('ov_down',box(HC['down']['W'],HC['down']['H'],HC['down']['ox'],HC['down']['oy'],cap({
  5:band(5,"ttttttttttsssssssrrr"),6:band(6,"stttttttttssssssrrrr"),
  7:[(-1,"OtsO"),(4,"CBB"),(9,"CCBB"),(15,"BBA"),(19,"BA"),(21,"O")],8:[(-1,"OtsO"),(5,"BA"),(10,"BBA"),(16,"BA"),(19,"BA"),(21,"O")],
  9:[(-1,"OstO"),(5,"A"),(16,"A"),(20,"A"),(21,"O")],10:[(-1,"OssO"),(20,"A"),(21,"O")],11:[(0,"OsO")],12:[(0,"OO")]})))
P('ov_up',box(HC['up']['W'],HC['up']['H'],HC['up']['ox'],HC['up']['oy'],cap({
  5:band(5,"ttttttttttsssssssrrr"),6:band(6,"stttttttttssssssrrrr"),
  7:[(0,"O"),(1,"CDCCBBBBBBBBBBBBBAAA"),(21,"O")],8:[(0,"O"),(1,"CCCBBBBBBBBBBBBBBBAA"),(21,"O")],
  9:[(0,"O"),(1,"CCBBBBBBBBBBBBBBBBAA"),(21,"O")],10:[(0,"O"),(1,"CBBBBBBBBBBBBBBBBBAA"),(21,"O")],
  11:[(3,"CBBBBBBBBBBBBBBA")],12:[(3,"BBBBBBBBBBBBBBBA")],13:[(3,"BBBBBBBBBBBBBBBA")],14:[(4,"BBBBBBBBBBBBA")],15:[(6,"BBBBBBBBAA")],16:[(8,"BBBBAA")],
  # headband knot and two tails hanging down the back (drawn over the cape)
  6:band(6,"stttttttOttOsssssrrrr")[:2]+[(9,"OttO")]+[(21,"O")],
  7:[(0,"O"),(1,"CDCCBBB"),(8,"OtsO"),(12,"BBBBBBBAAA"),(21,"O")],8:[(0,"O"),(1,"CCCBBBB"),(8,"OtsO"),(12,"BBBBBBBBAA"),(21,"O")],
  9:[(0,"O"),(1,"CCBBBBB"),(8,"OssO"),(12,"BBBBBBBBAA"),(21,"O")],10:[(0,"O"),(1,"CBBBBBB"),(8,"OssO"),(12,"BBBBBBBBAA"),(21,"O")]})))
P('ov_left',box(HC['left']['W'],HC['left']['H'],HC['left']['ox'],HC['left']['oy'],{
  -1:[(5,"O"),(10,"OO"),(15,"O")],0:[(4,"OCDO"),(9,"OCDDO"),(14,"OCDO")],1:[(3,"OOO"),(6,"CDDCBBBBBA"),(16,"OOO")],
  2:[(1,"OO"),(3,"CDDDDCCBBBBBBBBA"),(19,"OO")],3:[(0,"OO"),(2,"CDDCCCBBBBBBBBBBAA"),(20,"OO")],4:[(0,"O"),(1,"CDCCCBBBBBBBBBBBBAAA"),(21,"O")],
  5:[(0,"O"),(1,"ttttttttttttsssssrrr"),(21,"O")],6:[(0,"O"),(1,"tttttttttttssssssrrr"),(21,"OOO"),(24,"O")],
  7:[(3,"CBBBBBBBBBBBBBBBBAA"),(21,"O"),(22,"tsO")],8:[(5,"CBBBBBBBBBBBBBBBAA"),(21,"O"),(23,"tsO")],
  9:[(7,"CBBBBBBBBBBBBBAA"),(21,"O"),(23,"tO")],10:[(8,"CBBBBBBBBBBBBAA"),(21,"O")],
  11:[(8,"CB"),(13,"BBBBBBBA"),(21,"O")],12:[(8,"BA"),(13,"BBBBBBAA"),(21,"O")],13:[(13,"BBBBBBAA")],14:[(14,"BBBBBA")],15:[(15,"BBBBA")],16:[(16,"BBA")]}))

# ---------------- derived limbs (base v2 geometry, class finish) ----------------
TM={'r':'q','q':'q','p':'p'}
LEG=lambda rows:derive_leg(rows,TM,{'w':'h','z':'g','y':'f','x':'e'},{'w':'n','z':'m','y':'m','x':'l'},{'w':'m','z':'l','y':'l','x':'l'})
P('leg_down',LEG(BP['leg_down']));P('leg_down_R',cls.darker(LEG(BP['leg_down_R'])))
for pose in('stand','fwd','back','lift'):
    P('leg_s_'+pose,LEG(BP['leg_s_'+pose]));P('leg_r_'+pose,LEG(BP['leg_r_'+pose]))
SM={'3':'t','2':'s','1':'r'};EM={'S':'g','T':'f','U':'e'}
ARM=lambda rows:derive_arm(rows,SM,ext=3,emap=EM)
P('arm_down_L',ARM(BP['arm_down']));P('arm_down_R',cls.darker(cls.relight_mirror(cls.P['arm_down_L'])))
for pose in('stand','fwd','back'):
    P('arm_s_'+pose,ARM(BP['arm_s_'+pose]));P('arm_r_'+pose,ARM(BP['arm_r_'+pose]))
P('torso_right',cls.relight_mirror(cls.P['torso_left']))
# ---------------- pauldrons, cape, sword ----------------
P('paul_L',["..OOOO..",".OhhhgfO","OhhgggfO","OgggffeO",".OefeeO."])
P('paul_R',cls.darker(cls.relight_mirror(cls.P['paul_L'])))
P('paul_s',[".OOOO.","OhhgfO","OhgffO",".Oeee."])
P('paul_r',cls.relight_mirror(cls.P['paul_s']))
P('cape_s',["OttsO...","OtttsO..","OttsrO..","OtssrO..","OtssrO..","OssrrO..",".OsrrO..",".OsrrO..","..OsrrO.","..OrrrO.",".OrrrrO.",".OrOrrO.",".OOO.OO."])
P('cape_r',cls.relight_mirror(cls.P['cape_s']))
P('cape_hem_up',[".OttttttttttttO.","OsttttsssrrrrrrO","OsssrOssrrrOrrrO","OrsrO.OrrrO.OrrO",".OrO..OrO..OrO..","..O....O....O..."])
P('hilt_down',["..OO..",".OyyO.",".OxyO.","..OmO.",".OmnO.",".OmlO.",".OmnO.",".OmlO.",".OllO.","OyyyyO","OxyxxO",".OgfO.",".OhfO."])
cls.padpart('sword_up',[
"................OO",
"...............OyyO",
"..............OxyyO",
".............OOxxO.",
"............OhgmO..",
"...........OhgfO...",
"..........OhgfO....",
".........OhgfO.....",
"........OhgfO......",
".......OhgfO.......",
"......OhgfO........",
".....OhgfO.........",
"....OhgfO..........",
"...OhgfO...........",
"..OhgfO............",
"..OgfeO............",
"...OeO.............",
"....O.............."])
P('tip_down',["..OhO",".OhgO",".OgfO","OgfeO","OfeO.","OeO..","OO..."])
P('sword_s',["..OyO.","..OxO.",".OmnO.","OyyyyO","OxyxxO",".OhgO.",".OhgO.",".OhfO.",".OhgO.",".OhgO.",".OhfO.",".OgeO.","..OeO.","..OO.."])
def back_sword():
    pad=lambda t,p:('.'*p+t).ljust(8,'.')
    rows=[pad("OyyO",3),pad("OxyO",3),pad("OmnO",3),pad("OmlO",3),pad("OyyyyO",2),pad("OxyxxO",2)]
    for i in range(12): rows.append(pad("OhfO",3-i//4))
    rows+=[pad("OgeO",1),pad("OO",2)]
    return rows
P('sword_bs',back_sword());P('sword_br',cls.relight_mirror(cls.P['sword_bs']))
P('sword_up_m',cls.relight_mirror(cls.P['sword_up']));P('hilt_up_m',cls.relight_mirror(cls.P['hilt_down']))
cls.cfg['head_over']={'down':('ov_down',-2,-1),'up':('ov_up',-2,-1),'left':('ov_left',-2,-1)}
# right-facing overlay: mirrored draft of the left overlay (re-lit), face-side hand-checked in validation
mirror_overlay(cls,'ov_left','ov_right')
cls.cfg['items']=None
cls.cfg['back']={'down':[dict(part='hilt_down',x=29,y=11),dict(part='tip_down',x=7,y=33)],'left':[dict(part='cape_s',x=22,y=24,sway=(7,{'walk0':1,'walk2':1})),dict(part='sword_bs',x=25,y=22)],
                 'right':[dict(part='cape_r',x=22,y=24,sway=(7,{'walk0':-1,'walk2':-1}),flip=True),dict(part='sword_br',x=25,y=22)]}
cls.cfg['back']['up']=[dict(part='hilt_up_m',x=5,y=11,flip=False)]
cls.cfg['mid']={'up':[dict(part='cape_hem_up',x=12,y=34),dict(part='sword_up_m',x=9,y=21)]}
cls.cfg['post_arm']={'down':[dict(part='paul_L',x=7,y=23),dict(part='paul_R',x=25,y=23)],'up':[dict(part='paul_L',x=7,y=23),dict(part='paul_R',x=25,y=23)],
  'left':[dict(part='paul_s',x=17,y=23)],'right':[dict(part='paul_r',x=17,y=23)]}

# ---- texture strokes (hand-placed strands) and final overlay mirroring ----
fx(cls,'ov_up',-2,-1,[('D',3,7,4,[0]),('D',8,8,5,[0]),('D',13,8,5,[0]),('A',6,8,4,[0]),('A',11,8,5,[0]),('A',16,8,4,[0])],'ABCD')
fx(cls,'ov_left',-2,-1,[('D',8,8,4,[1]),('D',12,9,4,[0]),('A',10,9,4,[0]),('A',15,10,5,[0])],'ABCD')
mirror_overlay(cls,'ov_left','ov_right')
