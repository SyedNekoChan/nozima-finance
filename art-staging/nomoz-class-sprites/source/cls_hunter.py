"""Hunter: forest-green and leather ranger. Feathered peaked cap, copper hair with a side braid, leather vest over a green tunic, green shoulder mantle,
tall cuffed boots, quiver on the back, recurve bow held at the screen-left hand."""
from classlib import *
PAL={'A':'#3a2316','B':'#6a3f20','C':'#a0622c','D':'#d19348',      # copper hair
     'G':'#1f3d2a','H':'#2f5f3c','J':'#4b8a4a','L':'#7cba66',      # greens
     'l':'#3b2a14','m':'#6b4a22','n':'#a07c38',                    # leather
     'r':'#7e2a1c','s':'#cf5a2a','z':'#d8d0b0'}                    # feather, cord
cls=Cls('hunter','Hunter',PAL,['UTS','ABCD','GHJL','lmn','rs'],'#6ea84a')
cls.cfg['face_map']={'b':'B'}
P=cls.part
P('torso_down',[
"..OOHTTTTHOO..",
".OLJmlTTlmHHO.",
"OLJmnnzlnmmHGO",
"OLJmnnlznmmHGO",
"OLJmnnzlnmmHGO",
"OJJmnnlznmmHGO",
"OJHmnnzlnmlGGO",
"OJHmnmllmllGGO",
"OlllllnnlllllO",
"OmmmmmzzmmmmmO",
"OJJHHHHHHHGGGO",
"OOOOOOOOOOOOOO"])
P('torso_up',[
"..OOHTTTTHOO..",
".OLJJJTTJJHHO.",
"OLJJJJJHHHHGGO",
"OLJJJJHHHHlGGO",
"OLJJJHHHHllHGO",
"OJJJHHHHllHHGO",
"OJJHHHHllHHGGO",
"OJHHHHllHHGGGO",
"OllllllllllllO",
"OmmmmmmmmmmmmO",
"OJHHHHHHHHHGGO",
"OOOOOOOOOOOOOO"])
P('torso_left',[
"..OTTTO...",
".OLJmHHHO.",
"OLJmnlHGGO",
"OLJmnzHGGO",
"OLJmnlHGGO",
"OJJmnzHGGO",
"OJHmnlHGGO",
"OJHmmlGGGO",
"OlllnllllO",
"OmmmzmmmmO",
"OJJHHHHGGO",
"OOOOOOOOOO"])
mirror_pair(cls,'torso_left','torso_right')
standard_limbs(cls,{'r':'H','q':'G','p':'G'},{'w':'n','z':'n','y':'m','x':'l'},{'w':'n','z':'m','y':'m','x':'l'},{'w':'m','z':'l','y':'l','x':'l'},
               {'3':'L','2':'J','1':'H'},ext=3,emap={'S':'n','T':'m','U':'l'})
# mantle (shoulder cape) over the sleeve tops; side version over the near shoulder
P('mant_L',["....OLLO.","..OLJJJHO",".OLJJJHHO","OLJJJHHGO","OJJHHGGO.","OOJOOGOO."])
mirror_pair(cls,'mant_L','mant_R',darker=True)
P('mant_s',[".OLJJHO","OLJJHHO","OJJHHGO","OJHHGGO","OOJOGOO"])
mirror_pair(cls,'mant_s','mant_r')
cls.padpart('quiver_down',["..OsOrO","..OrOsO","..OzOzO","..OzOzO",".OmmmmmO",".OmnnnmO",".OmnnnmO",".OmlnnmO",".OmllllO","..OmllO.","...OOO.."])
cls.padpart('quiver_up',["..OsOrO..","..OzOzO..","..OzOzO..",".OmmmmmO.",".OmnnnmO.",".OmnnnmO.",".OmnnnmO.",".OmlnnmO.",".OmlnlmO.",".OmllllO.",".OmllllO.","..OmllO..","...OOOO.."])
cls.padpart('quiver_s',[".OsOrO",".OzOzO",".OzOzO","OmmmmO","OmnnmO","OmnnmO","OmnlmO","OmnlmO","OmllmO","OmllmO",".OllO.",".OOOO."])
mirror_pair(cls,'quiver_s','quiver_r')
# bow: explicit wood-column lists per row (hand-chosen curvature), outline left of the wood, light left / dark right
def bow_rows(cols,W,string=None):
    rows=[]
    for i,c in enumerate(cols):
        r=['.']*W;r[c-1]='O';r[c]='n';r[c+1]='m' if c+1<W else r[c+1];r[c+2]='O' if c+2<W else r[c+2]
        if string is not None and i not in(0,len(cols)-1): r[string]='z'
        rows.append(''.join(r))
    return rows
P('bow_down',bow_rows([3,3,2,2,1,1,1,1,1,1,1,1,1,1,2,2,3,3],6),grip=(2,9))
P('bow_s',bow_rows([3,3,2,2,1,1,1,1,1,1,1,1,1,1,2,2,3,3],8,string=5),grip=(2,9))
mirror_pair(cls,'bow_s','bow_r')
# side views: the bow is held out in front of the body by a forward forearm (same device as the Mage/Necromancer) so its string no longer crosses the torso
P('hold_s',["..............OOO.",".............OLLLO",".............OLJJO","......OOOOOOOOJHHO",".OOOOOLLJJJJJJHHHO",".OSSTnJJJJHHHHHGGO",".OSTUnHHHHHGGGGGGO",".OOOOOOOOOOOOOOOOO"])
mirror_pair(cls,'hold_s','hold_r')
for _k in('stand','fwd','back'):
    for _f in('s','r'):
        cls.P[f'arm_{_f}_{_k}']=['.'*len(r) for r in cls.P[f'arm_{_f}_{_k}']]

# ---------------- head overlays: peaked cap with leather band and feather, copper hair under it ----------------
CAPW=dict(W=28,H=24,ox=-2,oy=-1)
def cap_rows(extra,brow=None):
    d={-1:[(6,"OOOOOOOOOO")],0:[(3,"OOO"),(6,"LJJJHHHHGG"),(16,"OOO")],1:[(1,"OO"),(3,"LJJJJJHHHHHHHHGG"),(19,"OO")],
       2:[(0,"OO"),(2,"LJJJJJHHHHHHHHHHGG"),(20,"OO")],3:[(0,"O"),(1,"LJJJJHHHHHHHHHHHHGGG"),(21,"O")],
       4:[(0,"O"),(1,"nnnnnnnnnnnnmmmmmmml"),(21,"O")]}
    d.update(extra);return d
FEATHER={-1:[(23,"OO")],0:[(21,"OsrO")],1:[(19,"OsrO")],2:[(17,"OsrO")],3:[(16,"OsO")]}
def merge(*ds):
    out={}
    for d in ds:
        for y,segs in d.items(): out.setdefault(y,[]).extend(segs)
    return out
P('ov_down',box(CAPW['W'],CAPW['H'],CAPW['ox'],CAPW['oy'],merge(cap_rows({
  5:[(-1,"O"),(0,"JJJJHHHHHHHHHHHHHHGGGG"),(22,"O")],6:[(-1,"O"),(0,"GGGGGGGGGGGGGGGGGGGGGG"),(22,"O")],
  7:[(1,"TTTTTTTTTTTTTTTTTTTT"),(-1,"O"),(0,"DCB"),(19,"CBA"),(22,"O"),(9,"GG")],
  8:[(1,"TTTTTTTTTTTTTTTTTTTT"),(-1,"O"),(0,"DCB"),(19,"CBA"),(22,"O")],
  9:[(-1,"O"),(0,"DCB"),(19,"CBA"),(22,"O")],10:[(-1,"O"),(0,"DCB"),(19,"CBA"),(22,"O")],
  11:[(-1,"O"),(0,"DC"),(20,"BA"),(22,"O")],12:[(-1,"O"),(0,"DC"),(20,"BA"),(22,"O")],13:[(0,"CB"),(20,"BA")],14:[(0,"B"),(21,"A")]}),FEATHER)))
P('ov_up',box(CAPW['W'],CAPW['H'],CAPW['ox'],CAPW['oy'],merge(cap_rows({
  5:[(-1,"O"),(0,"JJJJHHHHHHHHHHHHHHGGGG"),(22,"O")],
  6:[(0,"O"),(1,"DCCBBBBBBBBBBBBBBBAA"),(21,"O")],7:[(0,"O"),(1,"DCCBBBBBBBBBBBBBBBAA"),(21,"O")],
  8:[(0,"O"),(1,"CCBBBBBBBBBBBBBBBBAA"),(21,"O")],9:[(0,"O"),(1,"CBBBBBBBBBBBBBBBBBAA"),(21,"O")],10:[(0,"O"),(1,"CBBBBBBBBBBBBBBBBBAA"),(21,"O")],
  11:[(3,"CBBBBBBBBBBBBBBA")],12:[(3,"BBBBBBBBBBBBBBBA")],13:[(3,"BBBBBBBBBBBBBBBA")],14:[(4,"BBBBBBBBBBBBA")],15:[(6,"BBBBBBBBAA")],16:[(8,"BBBBAA")]}),FEATHER)))
P('ov_left',box(CAPW['W']+2,CAPW['H'],-3,-1,merge(
  {-1:[(6,"OOOOOOOOOO")],0:[(3,"OOO"),(6,"LJJJHHHHGG"),(16,"OOO")],1:[(1,"OO"),(3,"LJJJJJHHHHHHHHGG"),(19,"OO")],2:[(0,"OO"),(2,"LJJJJJHHHHHHHHHHGG"),(20,"OO")],
   3:[(0,"O"),(1,"LJJJJHHHHHHHHHHHHGGG"),(21,"O")],4:[(0,"O"),(1,"nnnnnnnnnnnnmmmmmmml"),(21,"O")],
   5:[(-3,"O"),(-2,"JJJHHHHHHHHHHHHHHHHGGGG"),(21,"O")],6:[(-3,"O"),(-2,"GGGGGGGGGGGGGGGGGGGGGGG"),(21,"O")],
   7:[(1,"TTTTTTT"),(8,"CBBBBBBBBBBAA"),(21,"O")],8:[(8,"CBBBBBBBBBBAA"),(21,"O")],9:[(8,"DCBBBBBBBBBAA"),(21,"O")],
   10:[(8,"DCBBBBBBBBBAA"),(21,"O")],11:[(8,"DC"),(13,"BBBBBBBA"),(21,"O")],12:[(8,"CB"),(13,"BBBBBBAA"),(21,"O")],13:[(13,"BBBBBBAA")],14:[(14,"BBBBBA")],15:[(15,"BBBBA")],16:[(16,"BBA")]},
  {-1:[(22,"OO")],0:[(20,"OsrO")],1:[(18,"OsrO")],2:[(16,"OsrO")],3:[(15,"OsO")]})))
cls.cfg['head_over']={'down':('ov_down',-2,-1),'up':('ov_up',-2,-1),'left':('ov_left',-3,-1)}
mirror_overlay(cls,'ov_left','ov_right')
# braids: down (over the left shoulder), up (down the back), side (trailing behind)
cls.part('braid_down',["OCBO","OBAO","OCBO","OBAO","OCBO","OBAO","OCBO",".OAO",".OO."])
cls.part('braid_up',[".OCBO.",".OBAO.",".OCBO.",".OBAO.",".OCBO.",".OBAO.",".OCBO.",".OBAO.",".OCBO.","..OAO.","..OO.."])
cls.padpart('braid_s',["OCBO..","OBAO..","OCBO..","OBAO..","OCBO..","OBAO..","OCBO..",".OAO..",".OO..."])
mirror_pair(cls,'braid_s','braid_r')
cls.cfg['back']={'down':[dict(part='quiver_down',x=29,y=13)],'up':[],
  'left':[dict(part='quiver_s',x=24,y=22),dict(part='braid_s',x=27,y=20,follow='head',sway=(3,{'walk0':1,'walk2':1}))],
  'right':[dict(part='quiver_r',x=24,y=22),dict(part='braid_r',x=27,y=20,follow='head',sway=(3,{'walk0':-1,'walk2':-1}))]}
cls.cfg['mid']={'up':[dict(part='quiver_up',x=23,y=24)]}
cls.cfg['post_arm']={'down':[dict(part='mant_L',x=9,y=23),dict(part='mant_R',x=22,y=23)],'up':[dict(part='mant_L',x=9,y=23),dict(part='mant_R',x=22,y=23)],
  'left':[dict(part='mant_s',x=16,y=23),dict(part='hold_s',x=5,y=24,flip=False)],'right':[dict(part='mant_r',x=16,y=23),dict(part='hold_r',x=17,y=24,flip=False)]}
cls.cfg['front']={'down':[dict(part='braid_down',x=9,y=17,follow='head')],'up':[dict(part='braid_up',x=17,y=18,follow='head')]}
cls.cfg['weapon']={'down':[dict(part='bow_down',hand='a')],'up':[dict(part='bow_down',hand='a')],
  }
cls.cfg['far_weapon']={'left':[dict(part='bow_s',x=6,y=22,follow='body',flip=False)],'right':[dict(part='bow_r',x=26,y=22,follow='body',flip=False)]}

fx(cls,'ov_up',-2,-1,[('D',3,7,5,[0]),('D',8,7,6,[0]),('D',13,7,6,[0]),('A',6,8,5,[0]),('A',11,8,7,[0]),('A',16,8,5,[0])],'ABCD')
fx(cls,'ov_left',-3,-1,[('D',9,8,4,[1]),('D',13,9,5,[0]),('A',11,9,5,[0]),('A',16,10,6,[0])],'ABCD')
mirror_overlay(cls,'ov_left','ov_right')
