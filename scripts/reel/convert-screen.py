"""
Turns a take of timestamped window captures (from shots/capture-window.sh in the highlight-reel
folder) into a reel scene for the site: a desktop app's window played frame by frame.

  python3 scripts/reel/convert-screen.py <scene.json> --takes <takes-dir> --out demo/public/reel

<scene.json> names the take and how to cut it:
  { "id": "antigravity-ide", "take": "antigravity-ide-2", "first": 1795635206865,
    "label": "Antigravity · editor", "theme": { "id": "onebit", "fg": "#e8e6e1", "bg": "#181818" },
    "crop": [x, y, width, height],   (optional, in capture pixels: keeps a sidebar out of frame)
    "captions": [{ "frame": 1, "title": "…", "body": "…" }], "transcript": "…" }

`first` is the first capture published: nothing before the question (such as the app greeting the
user by name) goes on the site. Repeats and near-repeats (a ticking timer) are dropped, waits are
fast-forwarded to MAX_HOLD_MS, and the frames are written as 1280-wide JPEGs to <out>/<id>/,
with the scene itself at <out>/<id>.json in the shape the reel player loads.
"""
import argparse
import glob
import json
import os

from PIL import Image, ImageChops

WIDTH = 1280
QUALITY = 72
#: Waiting is fast-forwarded: no frame stays up longer than this, like the terminal scenes' thinking time.
MAX_HOLD_MS = 2500
#: Share of the picture that must change for a new frame; a ticking timer or spinner is far less.
MIN_CHANGE = 0.004


def same(a, b):
    """True when two captures differ only in a sliver, such as the agent's elapsed-time counter."""
    small = (320, 200)
    diff = ImageChops.difference(a.convert('L').resize(small), b.convert('L').resize(small))
    changed = sum(1 for value in diff.getdata() if value > 24)
    return changed < MIN_CHANGE * small[0] * small[1]


def frames_of(take, first, last, out_dir, public_dir, crop=None):
    """The take's distinct frames from `first` on, written as JPEGs, with fast-forwarded times."""
    stamps = sorted(int(os.path.basename(p)[:-4]) for p in glob.glob(os.path.join(take, '*.png')))
    stamps = [s for s in stamps if s >= first and (last is None or s <= last)]
    os.makedirs(out_dir, exist_ok=True)
    for old in glob.glob(os.path.join(out_dir, '*.jpg')):
        os.remove(old)
    frames, previous, kept_stamp, clock = [], None, None, 0
    for stamp in stamps:
        image = Image.open(os.path.join(take, f'{stamp}.png')).convert('RGB')
        if crop:
            image = image.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]))
        if previous is not None and same(previous, image):
            continue
        if kept_stamp is not None:
            clock += min(stamp - kept_stamp, MAX_HOLD_MS)
        previous, kept_stamp = image, stamp
        name = f'{len(frames) + 1:02d}.jpg'
        image.resize((WIDTH, round(image.height * WIDTH / image.width)), Image.LANCZOS).save(os.path.join(out_dir, name), quality=QUALITY)
        frames.append({'t': clock, 'src': f'{public_dir}/{name}'})
    return frames, clock + MAX_HOLD_MS * 2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('scene')
    parser.add_argument('--takes', required=True)
    parser.add_argument('--out', default='demo/public/reel')
    args = parser.parse_args()

    scene = json.load(open(args.scene))
    frames, duration = frames_of(os.path.join(args.takes, scene['take']), scene['first'], scene.get('last'), os.path.join(args.out, scene['id']), f"/reel/{scene['id']}", scene.get('crop'))
    captions = [{'t': frames[c['frame'] - 1]['t'], 'title': c['title'], 'body': c['body']} for c in scene['captions']]
    recording = {
        'id': scene['id'], 'cols': 0, 'rows': 0, 'duration': duration, 'theme': scene['theme'],
        'styles': [], 'frames': [], 'captions': captions, 'transcript': scene['transcript'],
        'screen': {'label': scene['label'], 'frames': frames},
    }
    with open(os.path.join(args.out, f"{scene['id']}.json"), 'w') as handle:
        json.dump(recording, handle, separators=(',', ':'))
    print(f"{scene['id']}: {len(frames)} frames, {duration / 1000:.1f}s")


main()
