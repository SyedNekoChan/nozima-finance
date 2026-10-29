import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_lib import *
from PIL import ImageDraw
def sheet(root, names, out, Z=6, boost=3.4, cols=None):
    rows=[]
    for n in names:
        fr=[np.array(Image.open(p).convert('RGBA')) for p in sorted(Path(root,n).glob('*.png'))]
        rows.append((n,fr))
    wmax=max(len(f) for _,f in rows)
    im=Image.new('RGBA',(wmax*(W*Z+8)+8, len(rows)*(H*Z+22)+8),(66,70,80,255)); d=ImageDraw.Draw(im)
    for r,(n,fr) in enumerate(rows):
        d.text((8,8+r*(H*Z+22)),n,fill=(255,233,168,255))
        for i,a in enumerate(fr):
            x0=8+i*(W*Z+8); y0=20+r*(H*Z+22)
            for y in range(H):
                for x in range(W):
                    if a[y,x,3]:
                        c=a[y,x,:3].astype(float); k=boost if c.max()<110 else 1
                        d.rectangle([x0+x*Z,y0+y*Z,x0+x*Z+Z-1,y0+y*Z+Z-1],fill=tuple(int(min(255,v*k)) for v in c)+(255,))
    im.save(out)
if __name__=='__main__':
    root=sys.argv[1]; out=sys.argv[2]; names=sys.argv[3:]
    sheet(root,names,out)
