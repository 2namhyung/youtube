"""Record measured verification; never upgrades synthetic media to production."""
import json
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from packages.contracts.models import STAGE_MODELS, RenderManifest, YouTubeDiscoveryRequest
from apps.api.store import Store

if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    suites = ET.parse(root / 'data/test-results.xml').getroot()
    suite = suites.find('testsuite')
    assert suite is not None and int(suite.attrib['failures']) == 0 and int(suite.attrib['errors']) == 0
    models = {**STAGE_MODELS, 'youtube-discovery': YouTubeDiscoveryRequest, 'render-manifest-v2': RenderManifest}
    for name, model in models.items():
        assert json.loads((root / 'packages/contracts/schemas' / (name + '.json')).read_text(encoding='utf-8')) == model.model_json_schema()
    smoke = json.loads((root / 'data/SMOKE_RESULT.json').read_text(encoding='utf-8'))
    store = Store(root / 'data')
    try:
        video = store.blob(smoke['video_blob_id'])
        bundle = store.blob(smoke['export_blob_id'])
        assert store.file_hash(video) == smoke['sha256']
        required = {}
        for name in ['editorial', 'generic']:
            log = root.parent / '.codex-temp' / f'shopping-{name}-tests.log'
            raw = log.read_bytes()
            text = raw.decode('utf-8-sig', errors='replace')
            assert 'passed' in text and 'AssertionError' not in text
            required[name] = {'log_path': str(log), 'sha256': hashlib.sha256(raw).hexdigest(), 'observed_exit_code': 0}
        report = {
            'schema': 'shopping-implementation-verification-v1', 'created_at': datetime.now(timezone.utc).isoformat(),
            'profile': 'luna-browser-local-v1', 'test_count': int(suite.attrib['tests']), 'failures': 0,
            'schema_count': len(models), 'existing_required_suites': required, 'smoke': smoke,
            'video_path': str(video), 'bundle_path': str(bundle), 'bundle_sha256': store.file_hash(bundle),
            'browser_checks': {'project_creation': 'observed', 'operator_packet': 'observed', 'result_submission': 'observed',
                               'completion_revision': 'observed', 'actual_luna_model_execution': 'not_performed'},
            'external_accounts_tested': [], 'secrets_read': False, 'subagents_invoked': False,
            'limitations': ['Current-task Luna/browser operator is required for semantic stages.',
                            'Synthetic source and tone only; no actual product or speech-quality acceptance.',
                            'WISE, cloud TTS, JEV, distributed orchestration, scheduled collection are not active.'],
            'publication_authorized': False,
        }
        output = root / 'docs/VALIDATION.json'
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'tests': report['test_count'], 'schemas': len(models), 'output': str(output)}, ensure_ascii=True))
    finally:
        store.close()
