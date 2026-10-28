"""Assassin: charcoal-teal-and-crimson shade. Pointed hood, crimson scarf mask over the mouth (eyes stay visible), fitted dark jacket with a leather harness,
wrapped forearms and shins, low boots, two reverse-grip daggers pointing down at the hands. Scarf tails trail behind."""
from classlib import *
PAL={'G':'#1d2428','H':'#2c3a40','J':'#44585f','L':'#6f8c94',      # charcoal teal cloth
     'r':'#6e1830','s':'#b8344c','t':'#e0607a',                    # crimson scarf
     'l':'#2a1c18','m':'#52362a','n':'#84583a',                    # leather
     'e':'#3b4458','g':'#9ca9bf','h':'#e6eef8',                    # steel
     'k':'#5f594f','y':'#9d9385','z':'#cfc4b3'}                                  # wraps
cls=Cls('assassin','Assassin',PAL,['UTS','GHJL','rst','lmn','egh','kyz'],'#d23a5a')
cls.cfg['face_map']={'b':'G'}
cls.cfg['mask_covers']='K'
P=cls.part
P('torso_down',[
"..OOrsssstOO..",
".OLJrssttsrHO.",
"OLJlHHHHHHlGGO",
"OLJHlHHHHlHGGO",
"OLJHHlHHlHHGGO",
"OLJHHHnnHHHGGO",
"OLJHHHllHHHGGO",
"OLJHHHllHHHGGO",
"OllllllnnllllO",
"OmmmmmmmmmmmmO",
"OJHHHHHHHHGGGO",
"OOOOOOOOOOOOOO"])
P('torso_up',[
"..OOrsssstOO..",
".OLJrssttsrHO.",
"OLJJJJHHHHHGGO",
"OLJJJHHHHHHGGO",
"OLJJHHHHHHGGGO",
"OLJHHHHHHHGGGO",
"OJJHHHHHHHGGGO",
"OJHHHHHHHHGGGO",
"OnllllllllllnO",
"OzmmmmmmmmmmzO",
"OJHHHHHHHHGGGO",
"OOOOOOOOOOOOOO"])
P('torso_left',[
"..OTTTO...",
".OLJrsttO.",
"OLJmHHHGGO",
"OLJHmHHGGO",
"OLJHHnHGGO",
"OLJHHmHGGO",
"OJJHHmHGGO",
"OJHHHmHGGO",
"OlllnllllO",
"OmmmzmmmmO",
"OJHHHHHGGO",
"OOOOOOOOOO"])
mirror_pair(cls,'torso_left','torso_right')
# wrapped forearms (pale bandage bands) and shins
standard_limbs(cls,{'r':'H','q':'G','p':'G'},{'w':'n','z':'m','y':'m','x':'l'},{'w':'m','z':'l','y':'l','x':'l'},{'w':'l','z':'l','y':'l','x':'l'},
               {'3':'J','2':'H','1':'G'},ext=3,emap={'S':'y','T':'k','U':'k'})

# ---------------- hood + scarf mask overlays ----------------
HW=dict(W=26,H=24,ox=-2,oy=-1)
HOOD_TOP={-1:[(10,"OO")],0:[(8,"OLJHHO")],1:[(6,"OLJJHHHGGO")],2:[(3,"OLJJJJHHHHHHHGGO")],3:[(1,"OLJJJJJHHHHHHHHHGGGO")]}
side=lambda y,l,r:[(-1,"O"),(0,l),(19,r),(22,"O")]
P('ov_down',box(HW['W'],HW['H'],HW['ox'],HW['oy'],{**HOOD_TOP,
  4:[(0,"O"),(1,"LJJJJHHHHHHHHHHHGGGG"),(21,"O")],5:[(0,"O"),(1,"LJJJHHHHHHHHHHHHGGGG"),(21,"O")],6:[(0,"O"),(1,"JJHHHHHHHHHHHHHHHGGG"),(21,"O")],
  7:[(0,"O"),(1,"JHHG"),(17,"HGGG"),(21,"O"),(5,"UUUUUUUUUUUU")],8:[(0,"O"),(1,"JHHG"),(17,"HGGG"),(21,"O"),(5,"TTTTTTTTTTTT")],
  9:side(9,"JHG","HGG")+[(3,"TTTTTTTTTTTTTTTT")],10:side(10,"JHG","HGG"),11:side(11,"JHG","HGG"),12:side(12,"JHG","HGG"),
  13:side(13,"JHG","HGG"),14:side(14,"JHG","HGG"),15:side(15,"JHG","HGG"),
  16:[(0,"O"),(1,"tttttssssssssssssrrr"),(21,"O")],17:[(2,"O"),(3,"sttsssssssssssrr"),(19,"O")],18:[(3,"O"),(4,"rsssssssssssrr"),(18,"O")]}))
P('ov_up',box(HW['W'],HW['H'],HW['ox'],HW['oy'],{**HOOD_TOP,
  4:[(0,"O"),(1,"LJJJJHHHHHHHHHHHGGGG"),(21,"O")],5:[(0,"O"),(1,"LJJJHHHHHHHHHHHHGGGG"),(21,"O")],6:[(0,"O"),(1,"LJJHHHHGHHHHHHHHGGGG"),(21,"O")],
  7:[(0,"O"),(1,"JJHHHHHGHHHHHHHHHGGG"),(21,"O")],8:[(0,"O"),(1,"JHHHHHHGHHHHHHHHHGGG"),(21,"O")],9:[(0,"O"),(1,"JHHHHHHGHHHHHHHHHGGG"),(21,"O")],
  10:[(0,"O"),(1,"JHHHHHHGHHHHHHHHHGGG"),(21,"O")],11:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],12:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],
  13:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],14:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],15:[(0,"O"),(1,"HHHHHHHGHHHHHHHHHHGG"),(21,"O")],
  16:[(1,"O"),(2,"HHHHHHHGHHHHHHHHGG"),(20,"O")],17:[(3,"O"),(4,"HHHHHGHHHHHGG"),(17,"O")],18:[(4,"O"),(5,"HHHGHHHGG"),(14,"O")],19:[(7,"OHHGHO")],20:[(9,"OGGO")]}))
HL=dict(W=30,H=24,ox=-3,oy=-1)
P('ov_left',box(HL['W'],HL['H'],HL['ox'],HL['oy'],{**HOOD_TOP,
  4:[(0,"O"),(1,"LJJJHHHHHHHHHHHHGGGG"),(21,"O")],5:[(0,"O"),(1,"JJHHHHHHHHHHHHHHGGGG"),(21,"O")],6:[(1,"O"),(2,"JHHHHHHHHHHHHHHGGGG"),(21,"O"),(22,"HHGO")],
  7:[(2,"O"),(3,"JHHHHHHHHHHHHHGGG"),(20,"G"),(21,"O"),(22,"HHGGO")],8:[(2,"O"),(3,"JHHHHHHHHHHHHHGGG"),(20,"G"),(21,"O"),(22,"HGGO")],
  9:[(1,"TTTTT"),(6,"O"),(7,"JHHHHHHHHHHHGG"),(21,"O"),(22,"GGO")],10:[(1,"TTTT"),(8,"O"),(9,"JHHHHHHHHHHHG"),(21,"O"),(23,"GO")],
  11:[(8,"JHHHHHHHHHHGG"),(21,"O")],12:[(8,"JHHHHHHHHHHGG"),(21,"O")],13:[(8,"HHHHHHHHHHHGG"),(21,"O")],14:[(8,"HHHHHHHHHHHGG"),(21,"O")],15:[(9,"HHHHHHHHHGG"),(20,"O")],
  16:[(1,"O"),(2,"ttsssssssr"),(12,"HHHHHHHHG")],17:[(2,"O"),(3,"sttssssrr"),(12,"HHHHHHG")],18:[(3,"O"),(4,"rsssssrr"),(10,"OtssrO")],
  19:[(12,"OtssrO")],20:[(15,"OtssrrO")],21:[(19,"OtsrrO")],22:[(22,"OrrO")]}))
cls.cfg['head_over']={'down':('ov_down',-2,-1),'up':('ov_up',-2,-1),'left':('ov_left',-3,-1)}
mirror_overlay(cls,'ov_left','ov_right')
cls.part('tail_down',["OtsO","OtsO","OssO","OssO","OsrO","OsrO",".OrO",".OrO",".OOO"])
cls.padpart('tail_up',["..OtsO..","..OtsO..","..OssO..","..OssO..","..OsrO..","..OsrO..","..OsrO..","..OsrO..","...OrO..","...OrO..","...OsO..","...OrO..","...OOO.."])
cls.padpart('dagger_d',[".OzO.",".OlO.",".OmO.","OggeO",".OhO.",".OhO.",".OgO.",".OgO.",".OeO.","..O.."],grip=(2,1))
cls.cfg['back']={}
cls.cfg['mid']={'up':[dict(part='tail_up',x=15,y=23,sway=(5,{'walk0':1,'walk2':-1}))]}
cls.cfg['front']={'down':[dict(part='tail_down',x=10,y=21,follow='head')]}
cls.padpart('dagger_a',[".....OzO",".....OlO","....OgeO","....OhO.","...OhgO.","..OhgO..",".OhgO...","OgeO....","OeO.....","OO......"],grip=(6,1))
mirror_pair(cls,'dagger_a','dagger_b');cls.cfg['grips']['dagger_b']=(1,1)
cls.cfg['weapon']={'down':[dict(part='dagger_a',hand='a'),dict(part='dagger_b',hand='b')],'up':[dict(part='dagger_a',hand='a'),dict(part='dagger_b',hand='b')],
  'left':[dict(part='dagger_d',hand='a',dx=-3)],'right':[dict(part='dagger_d',hand='a',dx=3)]}

fx(cls,'ov_up',-2,-1,[('L',4,6,8,[0]),('L',10,8,8,[0]),('L',14,6,6,[0]),('G',9,9,8,[0]),('G',13,9,8,[0]),('G',17,8,8,[0])],'GHJL')
fx(cls,'ov_left',-3,-1,[('L',6,6,5,[1]),('L',12,8,6,[0]),('G',14,9,7,[0]),('G',18,8,8,[0])],'GHJL')
mirror_overlay(cls,'ov_left','ov_right')
