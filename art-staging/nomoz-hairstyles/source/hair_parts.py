# Nomoz hairstyle set v1: hand-typed part art for three styles x four directions (+ sway variants).
# Coordinates are WINDOW columns/rows of the humanoid base head window (22x20, origin = head anchor). A part box may extend
# beyond the window (negative ox/oy, larger W/H); build_hairstyles.py places box (0,0) at head_origin + (ox,oy).
# '.' transparent, 'O' = shared outline #17121f.
PAL={'short':{'i':'#1b1a22','v':'#2f2d3c','G':'#4d4960','H':'#77718f'},          # ink-black / blue-grey: dark practical cut
     'medium':{'J':'#4a1f1a','L':'#7a3524','Q':'#b0552d','R':'#dc8d4c'},         # auburn / copper: layered cut
     'long':{'V':'#5a4a2e','X':'#977f47','Y':'#cfb46f','Z':'#f3e6ae'}}           # pale gold: long cut
RAMP={'short':'ivGH','medium':'JLQR','long':'VXYZ'}      # dark -> light
BOX={'short':dict(W=22,H=20,ox=0,oy=0),'medium':dict(W=26,H=24,ox=-2,oy=-2),'long':dict(W=26,H=31,ox=-2,oy=-1)}
PARTS={}
def mk(style,name,spec):
    b=BOX[style];rows=[]
    for y in range(b['oy'],b['oy']+b['H']):
        cells=['.']*b['W']
        for wx,t in spec.get(y,[]):
            for i,ch in enumerate(t):
                bx=wx-b['ox']+i
                assert 0<=bx<b['W'],(style,name,y,wx,t)
                cells[bx]=ch
        rows.append(''.join(cells))
    PARTS[(style,name)]=rows
def cap(top,hl='H',mid='G'):
    pass

# ===================================================== SHORT (ink / blue-grey) =====================================================
S_CAP={0:[(6,"OOOOOOOOOO")],1:[(3,"OOO"),(6,"GHHGvvvvii"),(16,"OOO")],2:[(1,"OO"),(3,"GHHHHGGvvvvvvvvi"),(19,"OO")],
       3:[(0,"OO"),(2,"GHHGGGvvvvvvvvvvii"),(20,"OO")],4:[(0,"O"),(1,"GHGGGvvvvvvvvvvvviii"),(21,"O")]}
mk('short','down',{**S_CAP,5:[(0,"O"),(1,"GGGvvviiiiiiiiivvii"+"i"),(21,"O")],6:[(0,"OGGvvv"),(16,"vviiiO")],7:[(0,"OGvv"),(18,"viiO")],
   8:[(0,"OGv"),(19,"viO")],9:[(0,"OG"),(20,"iO")],10:[(0,"Ov"),(20,"iO")]})
mk('short','up',{**S_CAP,5:[(0,"O"),(1,"GGHGvvvvvvvvvvvvvvii"),(21,"O")],6:[(0,"O"),(1,"GGvvvvvHvvvvvvvvvvii"),(21,"O")],
   7:[(0,"O"),(1,"GvvvvvvHHvvvvvvviiii"),(21,"O")],8:[(0,"O"),(1,"GvvvvvvvvHvvvvvvvvii"),(21,"O")],
   9:[(0,"O"),(1,"Gvvvvvvvvvvvvvvvvvii"),(21,"O")],10:[(0,"O"),(1,"vvvvvvvvvvvvvvvviiii"),(21,"O")],
   11:[(3,"Gvvvvvvvvvvvvvvi")],12:[(3,"Gvvvvvvvvvvvvvvi")],13:[(3,"Gvvvvvvvvvvvvvvi")],14:[(4,"Gvvvvvvvvvvvvi")],
   15:[(5,"Gvvvvvvvvvii")],16:[(7,"vvvvvvii")]})
mk('short','left',{**S_CAP,5:[(0,"O"),(1,"GGG"+"v"*16+"i"),(21,"O")],6:[(3,"G"+"v"*15+"ii"),(21,"O")],7:[(5,"G"+"v"*14+"i"),(21,"O")],
   8:[(7,"G"+"v"*12+"i"),(21,"O")],9:[(8,"G"+"v"*11+"i"),(21,"O")],10:[(8,"G"+"v"*11+"i"),(21,"O")],
   11:[(8,"Gv"),(13,"vvvvvvvi"),(21,"O")],12:[(8,"vi"),(13,"vvvvvvvi"),(21,"O")],13:[(13,"vvvvvvvi")],14:[(14,"vvvvvvi")],
   15:[(15,"vvvvvi")],16:[(16,"vvvi")]})
mk('short','right',{**S_CAP,5:[(0,"O"),(1,"GGG"+"v"*16+"i"),(21,"O")],6:[(0,"O"),(1,"GGHG"+"v"*13+"i")],7:[(0,"O"),(1,"GGG"+"v"*12+"i")],
   8:[(0,"O"),(1,"GG"+"v"*11+"i")],9:[(0,"O"),(1,"G"+"v"*11+"i")],10:[(0,"O"),(1,"GG"+"v"*10+"i")],
   11:[(1,"Gvvvvvvi"),(12,"vi")],12:[(1,"Gvvvvvvi"),(12,"vi")],13:[(1,"vvvvvvvi")],14:[(1,"vvvvvvi")],15:[(1,"vvvvvi")],16:[(2,"vvvi")]})

def full(y,interior,lo=-1,hi=22):
    assert len(interior)==hi-lo-1,(y,len(interior),hi-lo-1)
    return [(lo,'O'),(lo+1,interior),(hi,'O')]

# ===================================================== MEDIUM (auburn, layered) =====================================================
M_CAP={-1:[(5,"O"*12)],0:[(3,"OORRRQQQQQQQQJOO")],1:[(1,"OORRRRQQQQQQQQQQJJOO")],2:[(0,"OORRRRRQQQQQQQQQQQJJOO")],
       3:full(3,"RRRRQQLLQQQQQQQQQQJJJJ"),4:full(4,"RRRQQQLLQQQQQLQQQQQJJJ")}
mk('medium','down',{**M_CAP,5:full(5,"RRQQQLLLQQQQQQQQQLLJJJ"),
  6:[(-1,"ORQQL"),(6,"QQQLLQQQQQQQLJJJ"),(22,"O")],7:[(-1,"ORQQL"),(8,"QQLLQQQQQQQQLJ"),(22,"O")],
  8:[(-1,"ORQQL"),(10,"QLLQQQQQQQLJ"),(22,"O")],9:[(-1,"ORQQL"),(13,"LLQQQQQLJ"),(22,"O")],
  10:[(-1,"ORQLL"),(16,"LQQLJJ"),(22,"O")],
  11:[(-1,"ORQLL"),(18,"QLJJ"),(22,"O")],12:[(-1,"ORQLL"),(18,"QLJJ"),(22,"O")],
  13:[(-1,"ORQLL"),(18,"LLJJ"),(22,"O")],14:[(-1,"ORQLL"),(18,"LLJJ"),(22,"O")],
  15:[(-2,"ORQQL"),(18,"QLLJJ"),(23,"O")],16:[(-2,"ORQQL"),(18,"LLLJJ"),(23,"O")],
  17:[(-2,"ORQLL"),(18,"LLJJJ"),(23,"O")],18:[(-2,"ORQLL"),(19,"LLJJ"),(23,"O")],
  19:[(-2,"OQQL"),(19,"LJJJ"),(23,"O")],20:[(-2,"OQLO"),(20,"JJJ"),(23,"O")],21:[(-2,"OOO"),(20,"OOOO")]})
mk('medium','up',{**M_CAP,5:full(5,"RRQQQLQQQQQQQLQQQQLJJJ"),6:full(6,"RQQQLQQQQQQQQQLQQQLLJJ"),7:full(7,"RQQLQQQQQLLQQQQQQQLLJJ"),
  8:full(8,"RQLQQQQQQQLQQQQQQLLJJJ"),9:full(9,"QQLQQQQQQQQLQQQQQLLJJJ"),10:full(10,"QQL"+"Q"*14+"LLJJJ"),
  11:full(11,"QLQQQQQQQQQQQLQQQLLJJJ"),12:full(12,"QLQQQQQLQQQQQQQQQLLJJJ"),13:full(13,"QLQQQQQQQQLQQQQQQQLLJJ"),
  14:full(14,"QQLQQQQQQQQQQQQLQQLLJJ"),15:full(15,"QQLQQQLQQQQQQQQQQQLJJJ"),16:full(16,"QQQLQQQQQQQLQQQQQQLLJJ"),
  17:full(17,"QLQQQQQQQQQQQQQQQQLLJJ"),
  18:[(-1,"O"),(0,"RQQQQL"),(6,"QQQQQQQQQL"),(16,"LLLJJJ"),(22,"O")],
  19:[(-1,"OOOOOOO"),(6,"QQQLQQQLQQ"),(16,"LLJJJ"),(21,"JO"),(22,"O")],
  20:[(5,"O"),(6,"QQQLQQQQLJ"),(16,"OOOOOOO")],21:[(5,"O"*12)]})
mk('medium','left',{**M_CAP,5:full(5,"RRQQLLLQQQQQQQQQQLLJJJ"),6:full(6,"RQQLQQQQQQQQQQQQQLLJJJ"),7:full(7,"RQQLLQQQQQQQQQQQQLLJJJ"),
  8:full(8,"RQQLQQQQQQQQQQQQQLLJJJ"),
  9:[(-1,"ORQQL"),(8,"QQQQQQQQQQLLJJ"),(22,"O")],10:[(-1,"ORQL"),(8,"QQQLQQQQQQQLJJ"),(22,"O")],
  11:[(-2,"OQLO"),(8,"RQQQLQQLQQQLJJ"),(22,"O")],12:[(8,"RQQQLQQLQQQLJJ"),(22,"O")],13:[(8,"RQQQLQQLQQQLJJ"),(22,"O")],
  14:[(8,"RQQLQQLQQQLQJJ"),(22,"O")],15:[(8,"RQQQLQQLQQQLJJ"),(22,"O")],16:[(8,"RQQLLQQQQLQQJJ"),(22,"O")],
  17:[(8,"RQLL"),(12,"QQQQLQQLJJ"),(22,"O")],18:[(8,"OOOO"),(12,"QQQLQQLQJJ"),(22,"O")],
  19:[(12,"QQLQQ"),(17,"LQQJJ"),(22,"O")],20:[(12,"OOOOO"),(17,"QLQJJ"),(22,"O")],21:[(17,"OOOOOO")]})
mk('medium','right',{**M_CAP,5:full(5,"RRQQQLLLQQQQQQQQQLLJJJ"),6:full(6,"RQQLQQQQQQQQQQQQQLLJJJ"),7:full(7,"RQQQLLQQQQQQQQQQQLLJJJ"),
  8:full(8,"RQQQQLQQQQQQQQQQQLLJJJ"),
  9:[(-1,"O"),(0,"RQQQQQQLQQQQQQ"),(18,"QQLJ"),(22,"O")],10:[(-1,"O"),(0,"RQQQQQQLQQQQQQ"),(19,"QLJ"),(22,"O")],
  11:[(-1,"O"),(0,"RQQQQLQQLQQQQQ"),(21,"OJO")],12:[(-1,"O"),(0,"RQQQQLQQLQQQQQ")],13:[(-1,"O"),(0,"RQQQLQQLQQQQQQ")],
  14:[(-1,"O"),(0,"RQQQLQQQQLQQQQ")],15:[(-1,"O"),(0,"RQQQLQQLQQQQQQ")],16:[(-1,"O"),(0,"RQQQQLQQQQLQQQ")],
  17:[(-1,"O"),(0,"RRQQQQ"),(6,"LQQQQQ"),(10,"QQQQ")],18:[(-1,"O"),(0,"RQQQQL"),(10,"QQQQ"),(14,"OOOO")],
  19:[(-1,"O"),(0,"RQQQQL"),(5,"O"),(6,"OOOOOO")],20:[(-1,"O"),(0,"RQQQL"),(5,"OOOOO")],21:[(-2,"OOOOOO")]})

# ===================================================== LONG (pale gold) =====================================================
L_CAP={0:[(6,"OOOOOOOOOO")],1:[(3,"OOO"),(6,"ZYYZXXXXVV"),(16,"OOO")],2:[(1,"OO"),(3,"ZYYYYZZXXXXXXXXV"),(19,"OO")],
       3:[(0,"OO"),(2,"ZYYZZZXXXXXXXXXXVV"),(20,"OO")],4:[(0,"O"),(1,"ZYZZZXXXXXXXXXXXXVVV"),(21,"O")]}
def lock_l(y,a,w=4):   # hanging lock below the head: outline both sides
    return [(a-1,'O'),(a,'XXXX'[:w] if False else ''),(a+w,'O')]
mk('long','down',{**L_CAP,
  5:[(0,"O"),(1,"ZYZZZXXXX"),(12,"XXXXXXVVV"),(21,"O")],6:[(0,"O"),(1,"ZYZZXXXX"),(13,"XXXXXVVV"),(21,"O")],
  7:[(0,"O"),(1,"ZYZZXXX"),(14,"XXXXVVV"),(21,"O")],8:[(0,"O"),(1,"ZYZXXX"),(15,"XXXVVV"),(21,"O")],
  9:[(0,"O"),(1,"ZYZXX"),(16,"XXVVV"),(21,"O")],10:[(0,"O"),(1,"ZYXX"),(17,"XVVV"),(21,"O")],
  11:[(-1,"O"),(0,"ZYXX"),(18,"XXVV"),(22,"O")],12:[(-1,"O"),(0,"ZYXX"),(18,"XVVV"),(22,"O")],
  13:[(-1,"O"),(0,"ZYXV"),(18,"XVVV"),(22,"O")],14:[(-1,"O"),(0,"ZYXX"),(18,"XXVV"),(22,"O")],
  15:[(-1,"O"),(0,"YYXV"),(18,"XXVV"),(22,"O")],16:[(-1,"O"),(0,"ZYXV"),(18,"XVVV"),(22,"O")],
  17:[(-1,"O"),(0,"YXXV"),(18,"XXVV"),(22,"O")],18:[(-1,"O"),(0,"YXXV"),(18,"XVVV"),(22,"O")],
  19:[(-1,"O"),(0,"YXXV"),(18,"XXVV"),(22,"O")],
  20:[(0,"O"),(1,"YXXV"),(17,"XXVV"),(21,"O")],21:[(1,"O"),(2,"YXXV"),(16,"XXVV"),(20,"O")],
  22:[(2,"O"),(3,"YXXV"),(15,"XXVV"),(19,"O")],23:[(3,"O"),(4,"YXXV"),(8,"O"),(13,"O"),(14,"XXVV"),(18,"O")],
  24:[(3,"O"),(4,"YXXV"),(8,"O"),(13,"O"),(14,"XXVV"),(18,"O")],25:[(3,"O"),(4,"ZXXV"),(8,"O"),(13,"O"),(14,"XXVV"),(18,"O")],
  26:[(3,"O"),(4,"YXXV"),(8,"O"),(13,"O"),(14,"XXVV"),(18,"O")],27:[(4,"O"),(5,"XV"),(7,"O"),(14,"O"),(15,"XV"),(17,"O")],
  28:[(5,"OO"),(15,"OO")]})
mk('long','up',{**L_CAP,
  5:full(5,"ZYZZXXXXXXXXXXXXXVVV"[:20]+"VV",lo=-1,hi=22) if False else [(0,"O"),(1,"ZYZZXXXXXXXXXXXXXVVV"),(21,"O")],
  6:[(0,"O"),(1,"ZYZXXXXXXXYXXXXXXVVV"),(21,"O")],7:[(0,"O"),(1,"YZXXXXXXXXYYXXXXXVVV"),(21,"O")],
  8:[(0,"O"),(1,"YXXXXXXXXXXYXXXXXVVV"),(21,"O")],9:[(0,"O"),(1,"YXXXXXXXXXXXYXXXXVVV"),(21,"O")],
  10:[(0,"O"),(1,"YXXXXXXXXXXXXXXXXVVV"),(21,"O")],
  11:[(0,"O"),(1,"YXXXXYXXXXXXXXXXXVVV"),(21,"O")],12:[(0,"O"),(1,"YXXXXXXXXYXXXXXXXVVV"),(21,"O")],
  13:[(0,"O"),(1,"YXXXXXXXXXXXXYXXXVVV"),(21,"O")],14:[(0,"O"),(1,"XXXXYXXXXXXXXXXXXVVV"),(21,"O")],
  15:[(0,"O"),(1,"XXXXXXXXXXYXXXXXXVVV"),(21,"O")],
  16:[(0,"OO"),(2,"XXXXXXXXXXXXXXXXVV"),(20,"OO")],17:[(1,"OO"),(3,"XXXXXXXYXXXXXXVV"),(19,"OO")],
  18:[(2,"OO"),(4,"XXXXXXXXXXXXVV"),(18,"OO")],19:[(3,"OO"),(5,"XXXXXXXXXVV"),(18,"O")],
  20:[(4,"O"),(5,"YXXXXXXXXXXV"),(17,"O")],21:[(4,"O"),(5,"YXXXYXXXXXXV"),(17,"O")],
  22:[(4,"O"),(5,"YXXXXXXXXYXV"),(17,"O")],23:[(4,"O"),(5,"XXXXYXXXXXXV"),(17,"O")],
  24:[(4,"O"),(5,"XXXXXXXXXYXV"),(17,"O")],25:[(4,"O"),(5,"XXXYXXXXXXXV"),(17,"O")],
  26:[(4,"O"),(5,"XXXXXXXXXXXV"),(17,"O")],27:[(4,"O"),(5,"XXXXVXXXXXVV"),(17,"O")],
  28:[(5,"OOOOO"),(10,"XXX"),(13,"OO")]})
mk('long','left',{**L_CAP,
  5:[(0,"O"),(1,"ZYZZXXXXXXXXXXXXXVVV"),(21,"O")],6:[(3,"ZYZXXXXXXXXXXXXXVV"),(21,"O")],
  7:[(5,"ZYZXXXXXXXXXXXXVV"),(21,"O")],8:[(7,"YZXXXXXXXXXXXVV"),(21,"O")],
  9:[(8,"YZXXXXXXXXXXXVV"),(21,"O")],10:[(8,"YXXXXXXXXXXXVV"),(21,"O")],
  11:[(7,"ZYXX"),(11,"XXXXXXXXXVV"),(21,"O")],12:[(7,"ZYXX"),(11,"XXXXXXXXXVV"),(21,"O")],
  13:[(7,"YXXX"),(11,"XXXXXXXXXVV"),(21,"O")],14:[(8,"YXXX"),(12,"XXXXXXXXVV"),(21,"O")],
  15:[(8,"YXXV"),(12,"XXXXXXXXVV"),(21,"O")],16:[(8,"YXXV"),(12,"XXXXXXXVV"),(21,"O")],
  17:[(9,"XXV"),(12,"XXXXXXXVV"),(21,"O")],18:[(9,"XV"),(12,"XXXXXXVV"),(21,"O")],
  19:[(9,"OO"),(13,"XXXXXXVV"),(21,"O")],
  20:[(14,"O"),(15,"YXXXXV"),(21,"O")],21:[(13,"O"),(14,"YXXXXV"),(20,"O")],
  22:[(13,"O"),(14,"YXXXXV"),(20,"O")],23:[(13,"O"),(14,"YXXXXV"),(20,"O")],
  24:[(13,"O"),(14,"YXXXV"),(19,"O")],25:[(13,"O"),(14,"XXXXV"),(19,"O")],
  26:[(13,"O"),(14,"XXXV"),(18,"O")],27:[(14,"OOOOO")]})
mk('long','right',{**L_CAP,
  5:[(0,"O"),(1,"ZYZZXXXXXXXXXXXXXVVV"),(21,"O")],6:[(0,"O"),(1,"ZYZXXXXXXXXXXXXXVV")],
  7:[(0,"O"),(1,"ZYZXXXXXXXXXXXXVV")],8:[(0,"O"),(1,"YZXXXXXXXXXXXVV")],
  9:[(0,"O"),(1,"YZXXXXXXXXXXXVV")],10:[(0,"O"),(1,"YXXXXXXXXXXXVV")],
  11:[(0,"O"),(1,"YXXXXXXXXXVV"),(14,"XXVV")],12:[(0,"O"),(1,"YXXXXXXXXXVV"),(14,"XXV")],
  13:[(0,"O"),(1,"YXXXXXXXXXVV"),(14,"XXV")],14:[(0,"O"),(1,"YXXXXXXXXVV"),(13,"XXV")],
  15:[(0,"O"),(1,"YXXXXXXXXVV"),(13,"XXV")],16:[(0,"O"),(1,"YXXXXXXXVV"),(13,"XXV")],
  17:[(0,"O"),(1,"YXXXXXXXVV"),(12,"XV")],18:[(0,"O"),(1,"YXXXXXXVV"),(12,"V")],
  19:[(0,"O"),(1,"YXXXXXXVV")],
  20:[(14,"")] and [(0,"O")] and [(1,"O"),(2,"YXXXXV"),(8,"O")],
  21:[(1,"O"),(2,"YXXXXV"),(8,"O")],22:[(1,"O"),(2,"YXXXXV"),(8,"O")],23:[(1,"O"),(2,"YXXXXV"),(8,"O")],
  24:[(1,"O"),(2,"YXXXV"),(7,"O")],25:[(1,"O"),(2,"XXXXV"),(7,"O")],26:[(1,"O"),(2,"XXXV"),(6,"O")],27:[(1,"OOOOO")]})

# ===================================================== hand patches / texture strokes =====================================================
def patch(style,name,spec):
    b=BOX[style];rows=list(PARTS[(style,name)])
    for y,segs in spec.items():
        cells=['.']*b['W']
        for wx,t in segs:
            for i,ch in enumerate(t):
                bx=wx-b['ox']+i;assert 0<=bx<b['W'],(style,name,y,wx,t);cells[bx]=ch
        rows[y-b['oy']]=''.join(cells)
    PARTS[(style,name)]=rows
def addcells(style,name,spec):
    b=BOX[style];rows=[list(r) for r in PARTS[(style,name)]]
    for y,segs in spec.items():
        for wx,t in segs:
            for i,ch in enumerate(t):
                bx=wx-b['ox']+i;assert 0<=bx<b['W'],(style,name,y,wx,t);rows[y-b['oy']][bx]=ch
    PARTS[(style,name)]=[''.join(r) for r in rows]
def despeckle(style,name):
    base={'medium':'Q','long':'X'}[style];rows=[list(r) for r in PARTS[(style,name)]]
    for k,r in enumerate(rows):
        for x in range(1,len(r)-1):
            if r[x] in RAMP[style] and r[x]!=base and r[x-1]==base and r[x+1]==base: r[x]=base
    PARTS[(style,name)]=[''.join(r) for r in rows]
def stroke(style,name,ch,wx,y,n,dxs):
    b=BOX[style];rows=[list(r) for r in PARTS[(style,name)]];x=wx
    for i in range(n):
        yy=y+i-b['oy'];xx=x-b['ox']
        if 0<=yy<len(rows) and 0<=xx<b['W'] and rows[yy][xx] in RAMP[style]: rows[yy][xx]=ch
        x+=dxs[i%len(dxs)]
    PARTS[(style,name)]=[''.join(r) for r in rows]

# --- short: palette lifted slightly for readable texture; jagged fringe edge; jagged nape; highlight clusters
PAL['short']={'i':'#232131','v':'#3b384f','G':'#5f5a78','H':'#9089ae'}
patch('short','down',{6:[(0,"OGGvvv"),(8,"vi"),(12,"iv"),(16,"vviiiO")],7:[(0,"OGvv"),(10,"i"),(18,"viiO")]})
patch('short','up',{15:[(5,"Gvvv"),(10,"vv"),(13,"vii")],16:[(7,"vv"),(11,"v"),(13,"vi")]})
for n,s in(('down',[('H',4,3,3,[1]),('H',9,2,3,[1]),('G',2,5,2,[0])]),('up',[('H',3,4,4,[1]),('H',8,3,3,[1]),('G',12,7,3,[0])]),
           ('left',[('H',4,3,3,[1]),('H',9,2,3,[1]),('i',15,9,3,[0]),('G',12,6,3,[1])]),('right',[('H',4,3,3,[1]),('H',9,2,3,[1]),('i',9,11,3,[0]),('G',3,7,3,[1])])):
    for t in s: stroke('short',n,*t)
# --- long fixes
patch('long','down',{20:[(0,"O"),(1,"YXXV"),(5,"O"),(16,"O"),(17,"XXVV"),(21,"O")],21:[(1,"O"),(2,"YXXV"),(6,"O"),(15,"O"),(16,"XXVV"),(20,"O")],
  22:[(3,"O"),(4,"YXV"),(7,"O"),(14,"O"),(15,"XVV"),(18,"O")],
  23:[(4,"O"),(5,"YXV"),(8,"O"),(13,"O"),(14,"XVV"),(17,"O")],24:[(4,"O"),(5,"YXV"),(8,"O"),(13,"O"),(14,"XVV"),(17,"O")],
  25:[(4,"O"),(5,"ZXV"),(8,"O"),(13,"O"),(14,"XVV"),(17,"O")],26:[(4,"O"),(5,"YXV"),(8,"O"),(13,"O"),(14,"XVV"),(17,"O")],
  27:[(5,"O"),(6,"X"),(7,"O"),(14,"O"),(15,"V"),(16,"O")],28:[(5,"OOO"),(14,"OOO")]})
patch('long','left',{9:[(8,"YZXXXXXXXXXVV"),(21,"O")],10:[(8,"YXXXXXXXXXXVV"),(21,"O")]})
patch('long','right',{6:[(0,"O"),(1,"ZYZXXXXXXXXXXXXXVV")],7:[(0,"O"),(1,"ZYZXXXXXXXXXXXVV")],8:[(0,"O"),(1,"YZXXXXXXXXXXVV")],
  9:[(0,"O"),(1,"YZXXXXXXXXXVV")],10:[(0,"O"),(1,"YXXXXXXXXXXVV")],
  11:[(0,"O"),(1,"YXXXXXXXXXXXVV")],12:[(0,"O"),(1,"YXXXXXXXXXXXVV")],13:[(0,"O"),(1,"YXXXXXXXXXXXVV")],
  14:[(0,"O"),(1,"YXXXXXXXXXXVV")],15:[(0,"O"),(1,"YXXXXXXXXXXVV")],16:[(0,"O"),(1,"YXXXXXXXXXVV")],
  17:[(0,"O"),(1,"YXXXXXXXXVV")],18:[(0,"O"),(1,"YXXXXXXXVV")],19:[(0,"O"),(1,"YXXXXXXVV")],
  20:[(1,"O"),(2,"YXXXXV"),(8,"O")]})
# --- medium fixes: scalloped hem (up), mirrored three-tip hem (right)
patch('medium','up',{16:full(16,"QQQLQQQQQQQLQQQQQQLLJJ"),
  17:[(0,"O"),(1,"RQQQQQQQQQLQQQQQQLLJ"),(21,"O")],18:[(1,"O"),(2,"RQQQQQQLQQQQQQQQLJ"),(20,"O")],
  19:[(1,"O"),(2,"RQQL"),(6,"OO"),(8,"QQQLQQ"),(14,"OO"),(16,"QQLJ"),(20,"O")],
  20:[(2,"OOOO"),(7,"O"),(8,"QQQLQQ"),(14,"O"),(16,"OOOO")],21:[(7,"OOOOOOOO")]})
patch('medium','right',{11:[(-1,"O"),(0,"RQQQQLQQLQQQQQ"),(20,"QL"),(22,"O")],12:[(-1,"O"),(0,"RQQQQLQQLQQQQQ")],
  17:[(-1,"O"),(0,"RQQQQLQQQQQLQQ")],18:[(-1,"O"),(0,"RQQQQLQQQQ"),(10,"OOOO")],19:[(-1,"O"),(0,"RQQQQLQQQQ"),(10,"O")],
  20:[(-1,"O"),(0,"RQQQQ"),(5,"OOOOO"),(10,"O")],21:[(-1,"OOOOOO")]})
# --- outline closure at exposed hair edges (found by validate_hairstyles.py: exterior hair pixels must touch an outline pixel)
addcells('medium','down',{19:[(2,"O"),(18,"O")],20:[(19,"O")]})
addcells('medium','left',{12:[(-2,"OOO")]})
addcells('medium','right',{12:[(21,"O")]})
addcells('long','down',{19:[(4,"O"),(17,"O")]})
addcells('long','left',{18:[(12,"XXXXXXXVV")],20:[(13,"O")]})
addcells('long','up',{19:[(5,"XXXXXXXXXXXVV")]})
def vshade(style,name,y0):
    base={'medium':'Q','long':'X'}[style];dark={'medium':'L','long':'V'}[style];b=BOX[style]
    rows=[list(r) for r in PARTS[(style,name)]]
    for k,r in enumerate(rows):
        if k+b['oy']>=y0:
            for x in range(len(r)):
                if r[x]==base: r[x]=dark
    PARTS[(style,name)]=[''.join(r) for r in rows]
VS={('medium','down'):16,('medium','up'):15,('medium','left'):15,('medium','right'):15,('long','down'):17,('long','up'):17,('long','left'):17,('long','right'):17}
for s,n in(('medium','down'),('medium','up'),('medium','left'),('medium','right'),('long','down'),('long','up'),('long','left'),('long','right')):
    despeckle(s,n);vshade(s,n,VS[(s,n)])
ST={('medium','down'):[('R',2,3,3,[1]),('R',5,2,3,[1]),('L',16,4,5,[1,0]),('R',0,8,4,[0]),('L',19,12,6,[0])],
    ('medium','up'):[('R',2,4,5,[1]),('R',6,3,4,[1]),('R',10,3,3,[1]),('L',5,10,7,[0]),('L',9,9,8,[0]),('L',14,10,7,[0]),('L',18,11,6,[0]),('R',7,11,5,[0]),('R',12,12,5,[0])],
    ('medium','left'):[('R',2,4,5,[1]),('R',5,3,4,[1]),('L',10,5,7,[0,1]),('L',14,8,7,[0,1]),('L',17,11,7,[0]),('L',12,12,6,[0]),('R',9,12,4,[0]),('R',15,13,4,[0])],
    ('medium','right'):[('R',2,4,5,[1]),('R',6,3,4,[1]),('L',6,6,8,[0,-1]),('L',3,10,8,[0]),('L',8,13,5,[0]),('R',3,12,5,[0]),('R',6,9,4,[0])],
    ('long','down'):[('Y',2,5,5,[0]),('Y',4,12,6,[0]),('V',2,14,7,[0]),('V',19,13,7,[0]),('Y',5,23,4,[0]),('V',7,23,4,[0]),('Y',15,23,4,[0]),('V',17,23,4,[0])],
    ('long','up'):[('Y',2,4,5,[1]),('Y',5,3,4,[1]),('Y',6,20,6,[0]),('Y',10,21,6,[0]),('Y',13,19,6,[0]),('V',8,22,5,[0]),('V',12,22,5,[0]),('V',15,20,6,[0]),
                   ('Y',4,8,6,[0]),('Y',9,9,7,[0]),('Y',13,8,7,[0]),('V',7,10,6,[0]),('V',11,9,7,[0]),('V',16,10,6,[0])],
    ('long','left'):[('Y',2,4,5,[1]),('Y',6,5,5,[1]),('Y',14,10,8,[0]),('Y',17,12,8,[0]),('Y',16,21,5,[0]),('V',12,11,8,[0]),('V',19,13,7,[0]),('V',18,21,5,[0])],
    ('long','right'):[('Y',2,4,5,[1]),('Y',6,5,5,[1]),('Y',4,9,8,[0]),('Y',7,11,8,[0]),('Y',4,21,5,[0]),('V',2,10,8,[0]),('V',9,12,7,[0]),('V',6,21,5,[0])]}
for (s,n),L in ST.items():
    for t in L: stroke(s,n,*t)
