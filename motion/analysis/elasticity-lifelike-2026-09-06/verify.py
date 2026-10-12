"""Focused audit checks; does not claim human/reference-fidelity approval."""
from pathlib import Path
import subprocess, json, hashlib, re, ast
from PIL import Image

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[1]
lock=json.loads((OUT/'source-lock.json').read_text(encoding='utf-8'))
checks={}
for key,item in lock.items():
    path=ROOT/item['path']
    checks['source_unchanged_'+key]=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==item['sha256']
for path in OUT.glob('*.py'):
    ast.parse(path.read_text(encoding='utf-8'))
checks['script_syntax']=True
bad=[]
for path in OUT.glob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)',path.read_text(encoding='utf-8')):
        if '://' in target: continue
        if not (path.parent/target.split('#')[0]).exists(): bad.append([path.name,target])
checks['local_links']=not bad
images=list(OUT.glob('*.jpg'))+list(OUT.glob('*.png'))
for path in images:
    with Image.open(path) as pic: pic.verify()
checks['images_decode']=True
videos={}
for path in OUT.glob('*.mp4'):
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True)
    videos[path.name]=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,avg_frame_rate,duration','-of','json',str(path)]))['streams'][0]
checks['videos_full_decode']=True
samples=json.loads((OUT/'ticket-edge-candidate.json').read_text())['samples']
ys=[row['edge_y_at_540x1080'] for row in samples if 130<=row['frame']<=152]
checks['selected_edge_monotonic']=all(a>=b for a,b in zip(ys,ys[1:]))
trials=json.loads((OUT/'edge-sensitivity.json').read_text())
maxspread=max(max(t['y'][i] for t in trials)-min(t['y'][i] for t in trials) for i in range(len(trials[0]['frames'])))
checks['edge_sensitivity_max3px']=maxspread<=3
subprocess.run(['ffmpeg','-v','error','-y','-i',str(OUT/'transition-comparison.mp4'),'-vf',"select='eq(n,40)'",'-frames:v','1',str(OUT/'comparison-check.jpg')],check=True)
result={'checks':checks,'all_pass':all(checks.values()),'image_count':len(images),'video_metadata':videos,'bad_links':bad,'max_roi_threshold_spread_px':maxspread,'limits':'Technical artifact integrity only; no full source reconstruction, perceptual PASS or new generation approval.'}
(OUT/'verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
assert result['all_pass'],result
