#!/bin/bash
# 一次跑完：合成歌声测试 + 手机走查（需要先 python3 -m http.server 8765 &）
cd "$(dirname "$0")/.." || exit 1
set -e
node tools/mkwav.js >/dev/null
for t in test test2 test3 test4 test5 test6; do node tools/$t.js >/dev/null && echo "✓ $t"; done
python3 tools/walk.py shots >/dev/null && echo "✓ 竖屏走查"
W=844 H=390 python3 tools/walk.py shots_land >/dev/null && echo "✓ 横屏走查"
python3 tools/walk_intr.py shots | tail -3
python3 tools/walk_mp3.py shots | tail -1
python3 tools/walk_own.py shots | tail -1
python3 tools/walk_again.py shots | tail -1
python3 tools/walk_noyt.py shots | tail -1
python3 tools/walk_mic.py shots | tail -1
python3 tools/walk_hit.py shots | tail -1
python3 tools/walk_ver.py | tail -1
ACAP=1 TAKES=2 SING=10 W=844 H=390 python3 tools/walk_again.py shots_land | tail -1 | sed "s/^/横屏清唱：/"
