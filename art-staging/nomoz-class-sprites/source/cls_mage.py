"""Mage: royal-blue and gold arcanist. Floppy pointed hat with gold band and star, long lilac hair, V-neck robe with gold trim and sash,
bell hem with feet peeking out, tall crystal staff planted at the screen-right hand."""
from classlib import *
PAL={'G':'#1b2a57','H':'#2d4a96','J':'#4d78cb','L':'#88b4ee',      # robe blues
     'x':'#8a6420','y':'#e0b64a','z':'#fff1b8',                    # gold
     'A':'#5b5278','B':'#8d83b3','C':'#c2b8df','D':'#efe9ff',      # lilac hair / inner collar
     'l':'#3a2616','m':'#6a4528','n':'#9a6a3c',                    # staff wood, slippers
     'p':'#1d6f98','q':'#4cc3e8','r':'#c9f6ff'}                    # crystal
cls=Cls('mage','Mage',PAL,['UTS','GHJL','xyz','ABCD','lmn','pqr'],'#8a63d8')
cls.cfg['face_map']={'b':'A'};cls.cfg['legs']='boots'
P=cls.part
P('torso_down',[
"..OOGTTTTGOO..",
".OLJHyTTyHGGO.",
"OLJJyDDDDyHGGO",
"OLJJHyDDyHHGGO",
"OLJJHHyyHHHGGO",
"OLJHHHHHHHHGGO",
"OLJHHGHHHHGHGO",
"OJJHHGHHHHGHGO",
"OxyyyyyzzyyyyO",
"OxxxxxyzzyxxxO",
"OJHHHHHHHHHGGO",
"OOOOOOOOOOOOOO"])
P('torso_up',[
"..OOGTTTTGOO..",
".OLJJJTTJJHGO.",
"OLJJJHHHHHHGGO",
"OLJJHHHHHHHGGO",
"OLJJHHGHHHHGGO",
"OLJHHHGHHHGGGO",
"OJJHHHGHHHGGGO",
"OJHHHHGHHHGGGO",
"OxyyyyyzzyyyyO",
"OxxxxxzzzxxxxO",
"OJHHHHHHHHHGGO",
"OOOOOOOOOOOOOO"])
P('torso_left',[
"..OTTTO...",
".OLJyDHHO.",
"OLJyDHHGGO",
"OLJHyHHGGO",
"OLJHHHHGGO",
"OLJHHGHGGO",
"OJJHHGHGGO",
"OJHHHGHGGO",
"OyyyyzyxxO",
"OxxxxyxxxO",
"OJHHHHHGGO",
"OOOOOOOOOO"])
mirror_pair(cls,'torso_left','torso_right')
standard_limbs(cls,{'r':'H','q':'G','p':'G'},{'w':'z','z':'y','y':'y','x':'x'},{'w':'z','z':'y','y':'y','x':'x'},{'w':'y','z':'x','y':'x','x':'l'},
               {'3':'L','2':'J','1':'H'},ext=3,emap={'S':'J','T':'H','U':'G'},boots_only=True)
# long robe sleeve cuffs: gold trim at the wrist (last bracer row) is left to the arm part; bell hem below
SK=["...OLJHHHHHHHHGGO...","...OLJJHHGHHHHGGO...","..OLJJHHHGHHHHGGGO..",".OLJJHHHHGHHHHHGGGO.",".OLJJHHHHGHHHHHGGGO.",
    "Oxyyxyyxyyxyyxyyxyy"[:19]+"O","OOOOOOOOOOOOOOOOOOOO"]
SK[5]="O"+"xyy"*6+"O"
P('skirt_0',SK)
P('skirt_L',lift_side(SK,'L',5));P('skirt_R',lift_side(SK,'R',5))
SS=["...OJHHHHHGGO...","...OJHHHHHGGO...","..OJJHHHHHHGGO..",".OJJHHHHGHHHGGO.",".OJJHHHHGHHHGGO.",".O"+"xyy"*4+"O..","."+"O"*14+"."]
SS[5]="."+"O"+"xyyxyyxyyxyy"+"O"+"."
P('skirt_s0',SS)
P('skirt_sfwd',shift_rows(SS,4,-1));P('skirt_sback',shift_rows(SS,4,1))
P('skirt_slift',lift_side(SS,'L',5))
mirror_pair(cls,'skirt_s0','skirt_r0');mirror_pair(cls,'skirt_sfwd','skirt_rfwd');mirror_pair(cls,'skirt_sback','skirt_rback');mirror_pair(cls,'skirt_slift','skirt_rlift')
def skirt_front(ctx): return 'skirt_L' if ctx.ll<0 else ('skirt_R' if ctx.lr<0 else 'skirt_0')
def skirt_side(ctx):
    p='fwd' if ctx.nl=='fwd' else ('back' if ctx.nl=='back' else ('lift' if 'lift' in (ctx.nl,ctx.fl) else '0'))
    return f"skirt_{'r' if ctx.k=='r' else 's'}{p}"
cls.cfg['under']={'down':[dict(part=skirt_front,x=10,y=34)],'up':[dict(part=skirt_front,x=10,y=34)]}
cls.cfg['mid']={'left':[dict(part=skirt_side,x=12,y=34)],'right':[dict(part=skirt_side,x=12,y=34)]}

# ---------------- hat + long hair overlays ----------------
MW=dict(W=28,H=24,ox=-3,oy=-1)
def hat(extra):
    d={-1:[(12,"OOO")],0:[(8,"OLJJHHGGO")],1:[(3,"OLJJJJHHHHHHHGGO"),(9,"z")],2:[(1,"OLJJJJJHHHHHHHHHGGGO"),(8,"zzz")],
       3:[(0,"O"),(1,"LJJJJJJHHHHHHHHHGGGG"),(21,"O"),(9,"z")],4:[(0,"O"),(1,"yyyyyyyyyzzxxxxxxxxx"),(21,"O")]}
    d.update(extra);return d
lockD=lambda y:[(-1,"O"),(0,"DCB"),(19,"CBA"),(22,"O")]
P('ov_down',box(MW['W'],MW['H'],MW['ox'],MW['oy'],hat({
  5:[(-1,"O"),(0,"JJJHHHHHHHHHHHHHHHGGGG"),(22,"O")],6:[(-2,"O"),(-1,"HHHHHHHHHHHHHHHHHHHHHHHH"),(23,"O")],
  7:[(1,"TTTTTTTTTTTTTTTTTTTT"),(0,"GGGGGGGGGGGGGGGGGGGGGG")],
  8:[(1,"TTTTTTTTTTTTTTTTTTTT")]+lockD(8),9:lockD(9),10:lockD(10),11:lockD(11),12:lockD(12),13:lockD(13),14:lockD(14),15:lockD(15),16:lockD(16),17:lockD(17),18:lockD(18),
  19:[(0,"DCB"),(19,"CBA")],20:[(0,"CB"),(20,"BA")]})))
P('ov_up',box(MW['W'],MW['H'],MW['ox'],MW['oy'],hat({
  5:[(-1,"O"),(0,"JJJHHHHHHHHHHHHHHHGGGG"),(22,"O")],6:[(-2,"O"),(-1,"HHHHHHHHHHHHHHHHHHHHHHHH"),(23,"O")],
  7:[(0,"O"),(1,"DCCBBBBBBBBBBBBBBBAA"),(21,"O")],8:[(0,"O"),(1,"DCCBBBBBBBBBBBBBBBAA"),(21,"O")],9:[(0,"O"),(1,"CCBBBBBBBBBBBBBBBBAA"),(21,"O")],
  10:[(0,"O"),(1,"CBBBBBBBBBBBBBBBBBAA"),(21,"O")],11:[(0,"O"),(1,"CBBBBBBBBBBBBBBBBBAA"),(21,"O")],12:[(1,"O"),(2,"CBBBBBBBBBBBBBBBBAA"),(20,"O")],
  13:[(2,"O"),(3,"CBBBBBBBBBBBBBBAA"),(19,"O")],14:[(3,"O"),(4,"BBBBBBBBBBBBBAA"),(18,"O")],
  15:[(4,"O"),(5,"BBBBBBBBBBBAA"),(17,"O")],16:[(5,"O"),(6,"BBBBBBBBAA"),(16,"O")],17:[(5,"O"),(6,"BBBBBBBBAA"),(16,"O")],
  18:[(6,"O"),(7,"BBBBBBAA"),(15,"O")],19:[(6,"O"),(7,"BBBBBBAA"),(15,"O")],20:[(7,"O"),(8,"BBBBAA"),(14,"O")],21:[(8,"OOOOOO")]})))
ML=dict(W=32,H=24,ox=-4,oy=-1)
P('ov_left',box(ML['W'],ML['H'],ML['ox'],ML['oy'],{-1:[(12,"OOO")],0:[(8,"OLJJHHGGO")],1:[(3,"OLJJJJHHHHHHHGGO"),(9,"z")],2:[(1,"OLJJJJJHHHHHHHHHGGGO"),(8,"zzz")],
  3:[(0,"O"),(1,"LJJJJJJHHHHHHHHHGGGG"),(21,"O"),(9,"z")],4:[(0,"O"),(1,"yyyyyyyyyzzxxxxxxxxx"),(21,"O")],
  5:[(-4,"O"),(-3,"JJJJHHHHHHHHHHHHHHHHHHGGG"),(23,"O")],6:[(-4,"O"),(-3,"HHHHHHHHHHHHHHHHHHHHHHHHH"),(22,"O")],
  7:[(1,"TTTTTTT"),(0,"GGGGGGGGGGGGGGGGGGGGGGG")],8:[(1,"TTTTTTT"),(8,"DCBBBBBBBBBAA"),(21,"O")],9:[(8,"DCBBBBBBBBBAA"),(21,"O")],
  10:[(8,"DCBBBBBBBBBAA"),(21,"O")],11:[(8,"DCBBBBBBBBAAA"),(21,"O")],12:[(8,"DCBBBBBBBAAAA"),(21,"O")],13:[(8,"CBBBBBBBBBAAA"),(21,"O")],
  14:[(12,"OCBBBBBAAO")],15:[(13,"OCBBBBAAO")],16:[(14,"OBBBBAAO")],17:[(15,"OBBBAO")],18:[(16,"OBBAO")],19:[(17,"OBAO")],20:[(18,"OAO")],21:[(19,"OO")]}))
cls.cfg['head_over']={'down':('ov_down',-3,-1),'up':('ov_up',-3,-1),'left':('ov_left',-4,-1)}
mirror_overlay(cls,'ov_left','ov_right')
cls.part('lock_down_L',["OCBO","OCBO","OBAO",".OBO",".OAO",".OO."]);mirror_pair(cls,'lock_down_L','lock_down_R',darker=True)
def staff_rows():
    top=["O.OOO.O","OyqrqyO",".OqrqpO","OyqqpyO",".OpqpO.","..OyO..",".OyzyO.","..OmO.."]
    rows=[]
    for r in top: rows.append(r.ljust(7,'.')[:7])
    for i in range(29): rows.append("..OnmO.")
    rows+=["..OnlO.","..OllO.","...OO.."]
    return rows
cls.part('staff_down',staff_rows(),grip=(3,20))
# side views: the staff is held out in front of the body (clear of the hat band, face and central torso) by a forward-reaching forearm
cls.part('staff_s',[".OyyO.","OqrqqO","OqrqpO",".OpqO.",".OyzO."]+[".OnmO."]*25+[".OnlO.",".OllO.","..OO.."])
mirror_pair(cls,'staff_s','staff_r')
P('hold_s',["..............OOO.",".............OLLLO",".............OLJJO","......OOOOOOOOJHHO",".OOOOOLLJJJJJJHHHO",".OSSTyJJJJHHHHHGGO",".OSTUyHHHHHGGGGGGO",".OOOOOOOOOOOOOOOOO"])
mirror_pair(cls,'hold_s','hold_r')
for _k in('stand','fwd','back'):
    for _f in('s','r'):
        cls.P[f'arm_{_f}_{_k}']=['.'*len(r) for r in cls.P[f'arm_{_f}_{_k}']]
cls.cfg['front']={'down':[dict(part='lock_down_L',x=9,y=22,follow='head'),dict(part='lock_down_R',x=27,y=22,follow='head')],
                  'up':[]}
cls.cfg['weapon']={'down':[dict(part='staff_down',hand='b',plant=True,dx=2)],'up':[dict(part='staff_down',hand='b',plant=True,dx=2)]}
cls.cfg['far_weapon']={'left':[dict(part='staff_s',x=4,y=12,follow=None,flip=False)],'right':[dict(part='staff_r',x=30,y=12,follow=None,flip=False)]}
cls.cfg['post_arm']={'left':[dict(part='hold_s',x=5,y=24,flip=False)],'right':[dict(part='hold_r',x=17,y=24,flip=False)]}

fx(cls,'ov_up',-3,-1,[('D',3,8,9,[0]),('D',6,9,8,[0]),('D',9,8,9,[0]),('A',14,9,10,[0]),('A',17,8,11,[0]),('A',19,10,8,[0])],'ABCD')
fx(cls,'ov_left',-4,-1,[('D',9,8,6,[0,1]),('D',11,9,7,[0]),('A',15,9,8,[0]),('A',18,10,8,[0])],'ABCD')
mirror_overlay(cls,'ov_left','ov_right')
