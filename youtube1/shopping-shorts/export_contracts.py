import json
from pathlib import Path
from packages.contracts.models import STAGE_MODELS, RenderManifest, YouTubeDiscoveryRequest

if __name__ == '__main__':
    root = Path(__file__).parent / 'packages' / 'contracts' / 'schemas'
    root.mkdir(exist_ok=True)
    models = {**STAGE_MODELS, 'youtube-discovery': YouTubeDiscoveryRequest, 'render-manifest-v2': RenderManifest}
    for name, model in models.items():
        (root / (name + '.json')).write_text(json.dumps(model.model_json_schema(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Exported {len(models)} schemas from executable Pydantic contracts.')
