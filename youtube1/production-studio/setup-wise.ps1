$ErrorActionPreference = 'Stop'
# Isolated installation. No application secret files or existing media are read.
$wiseSetup = @'
set -euo pipefail
runtime="$HOME/.local/share/production-studio"
mkdir -p "$runtime/tools"
cd "$runtime"
if [ ! -x tools/bin/micromamba ]; then
  curl -fsSL https://micro.mamba.pm/api/micromamba/linux-64/latest -o micromamba.tar.bz2
  tar -xjf micromamba.tar.bz2 -C tools bin/micromamba
fi
if [ ! -x wise-env/bin/python ]; then
  tools/bin/micromamba create -y -p "$runtime/wise-env" -c conda-forge python=3.12 'ffmpeg>=6,<7' libmagic 'sqlite>=3.35' pip
fi
if [ ! -d wise/.git ]; then
  git clone https://gitlab.com/vgg/wise/wise.git wise
  git -C wise checkout --detach e2da814fef8099b9aa6bfb5c10bd959476517da0
fi
actual_commit="$(git -C wise rev-parse HEAD)"
if [ "$actual_commit" != e2da814fef8099b9aa6bfb5c10bd959476517da0 ]; then
  echo 'Existing WISE checkout differs from the validated revision; preserved without modification.' >&2
  exit 1
fi
"$runtime/wise-env/bin/python" -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.8.0 torchaudio==2.8.0 torchvision==0.23.0
"$runtime/wise-env/bin/python" -m pip install ./wise 'transformers<5'
"$runtime/wise-env/bin/python" -m pip freeze > "$runtime/requirements.lock.txt"
echo 'WISE installed. The first library index downloads the SigLIP2 model; subsequent runs reuse its local cache.'
'@
& wsl.exe --distribution Ubuntu -- bash -lc $wiseSetup
if ($LASTEXITCODE -ne 0) { throw 'WISE setup did not complete. The existing installation and media have been preserved.' }
