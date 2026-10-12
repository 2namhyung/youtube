import os
import runpy
import sys

if len(sys.argv) < 2:
    raise SystemExit("edge_tts bootstrap requires the bundled site-packages path")
site_packages = os.path.realpath(sys.argv.pop(1))
bundle_root = os.path.realpath(os.path.join(os.path.dirname(sys.executable), "Lib", "site-packages"))
if os.path.normcase(site_packages) != os.path.normcase(bundle_root):
    raise SystemExit("edge_tts bootstrap path is outside the mirrored Python bundle")
sys.path[:] = [site_packages] + [entry for entry in sys.path if os.path.normcase(os.path.realpath(entry or os.curdir)) != os.path.normcase(site_packages)]
runpy.run_module("edge_tts", run_name="__main__", alter_sys=True)
