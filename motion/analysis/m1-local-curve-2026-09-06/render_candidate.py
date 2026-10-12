"""Isolated translation-only curve candidate. Never modifies production modules."""
import importlib.util
import json
import hashlib
import subprocess
from pathlib import Path

import numpy as np
from scipy.interpolate import PchipInterpolator
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
spec = importlib.util.spec_from_file_location('base', HERE.parent / 't3-all-city-2026-09-06/render_t3_all_city.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.SOURCE_STARTS = dict(seoul=2.5, tokyo=1.625, shanghai=2.75, hanoi=6.0)
v1 = base.v1
baseline = HERE.parent / 't3-joint-windows-2026-09-06/joint-windows-1.80x-13s.mp4'
expected = 'e1d929d60550d4c5cc3e5c72ae6bb621047c07c0ff12aeb2bc22123b7c768fe3'
samples = json.loads((HERE.parent / 'elasticity-lifelike-2026-09-06/ticket-edge-candidate.json').read_text())['samples']
samples = [s for s in samples if 130 <= s['frame'] <= 144]
x = np.array([(s['frame']-130)/14 for s in samples])
y = np.array([(1073-s['edge_y_at_540x1080'])/1054 for s in samples])
curve = PchipInterpolator(x, y)

def transition(old_card, incoming_card, old_frame, new_frame, t, body, old_branch, new_branch, old_index=None, new_index=None, hanoi_greenscreen=False):
    old_rgb, old_a = v1._actor_matte(old_frame, old_branch, old_index, hanoi_greenscreen)
    new_rgb, new_a = v1._actor_matte(new_frame, new_branch, new_index, hanoi_greenscreen)
    p = min(1.0, max(0.0, t / base.TRANSITION_DURATION))
    if p >= 1:
        return v1._static(incoming_card, new_frame, new_branch, new_index, hanoi_greenscreen)
    original = 1-(1-p)**3
    offset = round((1-float(curve(p)))*base.SIZE[1])
    angle = v1.v2.INITIAL_TILT_DEG*(1-original)
    blur = round(v1.v2.MAX_DIRECTIONAL_BLUR_PX*(1-p))
    canvas = old_card.copy()
    if p > 0:
        canvas = v1.v2._backing(canvas, body, offset, angle, blur)
        rgb, alpha = v1.v2._directional_card(incoming_card, body, offset, angle, blur)
        canvas = v1._blend(canvas, rgb, alpha)
        _, geometry = v1.v2._rotated_card(incoming_card, body, offset, angle)
        old_region, new_region = v1.v2._complementary_person_regions(geometry)
    else:
        old_region = np.ones(base.SIZE[::-1], dtype=np.float32)
        new_region = np.zeros(base.SIZE[::-1], dtype=np.float32)
    canvas = v1._blend(canvas, old_rgb, old_a*old_region)
    return v1._blend(canvas, new_rgb, new_a*new_region)

def run(*args):
    subprocess.run([base.FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', *map(str,args)], check=True)

def main():
    assert base.sha256(baseline) == expected
    dense = curve(np.linspace(0,1,1001))
    assert np.all(np.diff(dense) >= -1e-12) and abs(dense[0]) < 1e-9 and abs(dense[-1]-1) < 1e-9
    v1._transition = transition
    silent = HERE / 'candidate-silent.mp4'
    output = HERE / 'card-curve-candidate-13s.mp4'
    timing = base.render_silent(silent)
    base.mux_audio(silent, output)
    compare = HERE / 'before-after-seoul-tokyo-4s.mp4'
    run('-ss',5,'-i',baseline,'-ss',5,'-i',output,'-filter_complex','[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]hstack=inputs=2[v]','-map','[v]','-t',4,'-an','-c:v','libx264','-crf',18,'-pix_fmt','yuv420p',compare)
    for path in [output,compare]:
        base.decode_check(path)
    meta=base.probe(output)
    assert (meta['width'],meta['height'],meta['r_frame_rate'],meta['frames']) == (720,1280,'24/1','312')
    assert abs(float(meta['duration'])-13)<0.001
    assert base.sha256(baseline)==expected
    # Compact full-body comparison at the same output instants.
    times=[6.5,6.583333,6.666667,6.75,6.833333,7.0]
    sheet=Image.new('RGB',(6*216,2*408),'#222222'); d=ImageDraw.Draw(sheet)
    for row,path in enumerate([baseline,output]):
        for col,t in enumerate(times):
            raw=subprocess.run([base.FFMPEG,'-v','error','-ss',str(t),'-i',str(path),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True,check=True).stdout
            im=Image.fromarray(np.frombuffer(raw,dtype=np.uint8).reshape(1280,720,3)).resize((216,384))
            sheet.paste(im,(col*216,row*408));d.text((col*216+4,row*408+387),f"{'BEFORE' if row==0 else 'AFTER'} {t:.3f}s",fill='white')
    sheet.save(HERE/'transition-contact.jpg',quality=94)
    report=dict(status='candidate awaiting visual/user review',baseline_sha256=expected,output_sha256=base.sha256(output),probe=meta,decode='PASS',source_starts=base.SOURCE_STARTS,person_factor=1.8,intro_factor=1,changed='card vertical translation curve and corresponding edge-reveal timing only',preserved=['person source frames','rotation time curve','blur time curve','transition duration 0.5s','card assets','matting','audio'],curve=dict(method='monotone PCHIP',warning='normalized measured visible left edge proxy, not recovered authoring keyframes',x=x.tolist(),y=y.tolist()),timing=timing)
    (HERE/'metadata.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(output=str(output),compare=str(compare),probe=meta)))

if __name__=='__main__':
    main()
