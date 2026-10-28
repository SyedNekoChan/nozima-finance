# Nomoz "Basic Adventurer" outfit v1: hand-typed part art. '.' is transparent. Geometry follows the humanoid base v2 cloth
# silhouette exactly (the base underlayer mask is the coverage contract); colours/folds/trim are authored here.
import os, sys
HERE=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,os.path.join(os.path.dirname(os.path.dirname(HERE)),'nomoz-humanoid-sheet','source'))
import parts_v2 as BASE

# outfit palette (new characters only; 'O' = shared base outline #17121f). Ramps are listed dark -> light.
PAL_O={'g':'#1d3a2e','h':'#2f5a3e','j':'#4a8049','k':'#74a95a',      # tunic green
       'm':'#7a6a4c','n':'#b5a47e','o':'#e6d9b4',                      # linen trim (collar, cuffs, hem)
       'e':'#2b1a12','f':'#5a3a22','l':'#8b5e32',                      # belt leather / boot cuff
       'M':'#8a6420','N':'#d3a33f','P':'#f4d98a',                      # brass buckle
       's':'#3d3629','t':'#62573b','u':'#8a7a52',                      # trousers
       'A':'#1e1416','B':'#34231f','C':'#54382b','D':'#7c5740'}        # boots
RAMPS={'tunic':'ghjk','trim':'mno','leather':'efl','brass':'MNP','trousers':'stu','boots':'ABCD'}
FAM={}
for fam,chars in RAMPS.items():
    for c in chars: FAM[c]=fam
DARK={'k':'j','j':'h','h':'g','o':'n','n':'m','u':'t','t':'s','l':'f','f':'e','P':'N','N':'M','D':'C','C':'B','B':'A'}

PARTS={}
def part(name,rows):
    assert len({len(r) for r in rows})==1,(name,[(i,len(r)) for i,r in enumerate(rows)])
    PARTS[name]=rows
def darker(rows,n=1):
    out=[]
    for r in rows:
        s=''
        for ch in r:
            for _ in range(n): ch=DARK.get(ch,ch)
            s+=ch
        out.append(s)
    return out
def relight_mirror(rows):
    """mirror, then restore dark->light order inside each same-ramp run so light stays on the left"""
    out=[]
    for r in rows:
        m=list(r[::-1]);i=0
        while i<len(m):
            f=FAM.get(m[i])
            if f is None: i+=1;continue
            j=i
            while j<len(m) and FAM.get(m[j])==f: j+=1
            order=RAMPS[f]
            idx=list(range(i,j));vals=sorted((m[k] for k in idx),key=order.index,reverse=True)
            for k,v in zip(idx,vals): m[k]=v
            i=j
        out.append(''.join(m))
    return out

# ---------------- front / back ----------------
part('c_torso_down',[
"..OO......OO..",
".Okjoo..onhgO.",
"OjkkkkonhhhggO",
"OjkkjjnohhhggO",
"OjjjjjonhhgggO",
"OjjjhhnnhggggO",
"OjjhhhmnhhgggO",
"OjhhhhhhhhgggO",
"OlllllPNfffffO",
"OfffffMMeeeeeO",
"OhhhhhhhhggggO",
"OOOOOOOOOOOOOO"])
part('c_torso_up',[
"..OOon..nmOO..",
".OkkoooonnhgO.",
"OjkkkkkkhhhggO",
"OjkkkkjjhhhggO",
"OjjjjjhjhhhggO",
"OjjjjjhjhhhggO",
"OjjjjhhjhhhggO",
"OjjjhhhjhhhggO",
"OllllllffffffO",
"OffffffeeeeeeO",
"OhhhhhhhhggggO",
"OOOOOOOOOOOOOO"])
part('c_sleeve_L',[".Okk","Okkj","Ojjh","Oonn"])
part('c_sleeve_R',["jhO.","jhgO","hggO","nmmO"])
part('c_leg_down',["OuuttO","OuuttO","OuttsO","OuttsO","OttssO","OlllfO","ODCBBO","OCCBBO","OffeeO","OOOOOO"])
part('c_leg_down_R',["OutssO","OttssO","OttssO","OtsssO","OtsssO","OllffO","OCBBAO","OBBBAO","OfeeeO","OOOOOO"])

# ---------------- side (left-facing) ----------------
part('c_torso_left',[
"..O...O...",
".OookhhgO.",
"OnkjjhhggO",
"OkjjhhhggO",
"OjjjhhhggO",
"OjjhhhhggO",
"OjhhhhgggO",
"OhhhhhgggO",
"OPNlllfffO",
"OMMffffeeO",
"OhhhhhgggO",
"OOOOOOOOOO"])
part('c_arm_s_stand',[".OOO.","OkjhO","OjhgO","OonmO"])
part('c_arm_s_fwd',["...OOO..","..OkjhO.","..OjhgO.",".OonnmO."])
part('c_arm_s_back',["..OOOO..","..OkjhO.","..OjhgO.","..OonmO."])
def leg_from_base(rows):
    """role-based recolour of a base leg pose: trousers r/q/p -> u/t/s; first boot row = cuff; last boot row = sole band."""
    boot=[i for i,r in enumerate(rows) if any(c in r for c in 'wzyx')]
    cuff,sole=boot[0],boot[-1]
    out=[]
    for i,r in enumerate(rows):
        s=''
        for ch in r:
            if ch in 'rqp': ch={'r':'u','q':'t','p':'s'}[ch]
            elif ch in 'wzyx':
                if i==cuff: ch={'w':'l','z':'f','y':'e','x':'e'}[ch]
                elif i==sole: ch={'w':'l','z':'f','y':'f','x':'e'}[ch]
                else: ch={'w':'D','z':'C','y':'B','x':'A'}[ch]
            s+=ch
        out.append(s)
    return out
for pose in('stand','fwd','back','lift'):
    part('c_leg_s_'+pose,leg_from_base(BASE.PARTS['leg_s_'+pose]))

# ---------------- side (right-facing): torso/sleeves hand-authored, legs mirrored drafts then re-lit ----------------
part('c_torso_right',[
"...O...O..",
".OkjhhnmO.",
"OkkjjhhgmO",
"OkkjjhhggO",
"OkjjhhhggO",
"OjjjhhhggO",
"OjjhhhgggO",
"OjhhhhgggO",
"OllllffPNO",
"OffffeeMMO",
"OhhhhhgggO",
"OOOOOOOOOO"])
part('c_arm_r_stand',[".OOO.","OkjhO","OjhgO","OonmO"])
part('c_arm_r_fwd',["..OOO...",".OkjhO..",".OjhgO..",".OonnmO."])
part('c_arm_r_back',["..OOOO..",".OkjhO..",".OjhgO..",".OonmO.."])
for pose in('stand','fwd','back','lift'):
    part('c_leg_r_'+pose,relight_mirror(PARTS['c_leg_s_'+pose]))
