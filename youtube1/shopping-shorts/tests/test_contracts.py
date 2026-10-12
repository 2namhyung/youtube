import copy
import json
from datetime import datetime, timedelta, timezone
import pytest
from pydantic import ValidationError
from packages.contracts.models import Product, Snapshot, QueryPlan, Discovery
from apps.api.store import Gate, digest
from workers.discovery.outliers import analyze
from tests.helpers import Studio


@pytest.fixture
def studio(tmp_path):
    s = Studio(tmp_path / 'store')
    yield s
    s.store.close()


def test_http_boundaries(studio):
    assert studio.client.post('/v1/projects', json={'name': 'bad'}).status_code == 403
    assert studio.client.get('/v1/projects', headers={'Host': 'attacker.example'}).status_code == 403
    assert studio.client.get('/v1/session', headers={'Origin': 'https://attacker.example'}).status_code == 403
    assert studio.client.post('/v1/projects', json={'name': 'bad'}, headers={'X-Studio-Token': studio.token}).status_code == 400


def test_idempotency_and_revision(studio):
    body = {'name': 'one'}
    a = studio.post('/v1/projects', body, 201, key='same')
    b = studio.post('/v1/projects', body, 201, key='same')
    assert a['id'] == b['id']
    assert studio.post('/v1/projects', {'name': 'two'}, 409, key='same')['code'] == 'IDEMPOTENCY_CONFLICT'
    studio.pid = a['id']
    assert studio.post(f'/v1/projects/{a["id"]}/stages/product', {'expected_revision': 99, 'payload': {}}, 409)['code'] == 'REVISION_CONFLICT'


def test_operator_bridge_binding_cancel_and_no_jev(studio):
    studio.create()
    j = studio.stage('product', {}, 'WAITING_INPUT')
    p = studio.client.get(f'/v1/jobs/{j["id"]}/packet').json()
    assert p['model_preference'] == 'gpt-5.6-luna'
    assert p['transport'] == 'current-codex-task'
    assert p['result_schema']['additionalProperties'] is False
    assert studio.post(f'/v1/jobs/{j["id"]}/inputs', {'binding': 'wrong', 'result': {}}, 409)['code'] == 'BINDING_MISMATCH'
    studio.post(f'/v1/jobs/{j["id"]}/cancel', {})
    assert studio.pipeline.job(j['id'])['state'] == 'CANCELLED'
    assert studio.post(f'/v1/jobs/{j["id"]}/inputs', {'binding': p['binding'], 'result': {}}, 409)['code'] == 'NOT_WAITING'
    caps = studio.client.get('/v1/capabilities').json()
    assert caps['required_external_api_keys'] == []
    assert next(c for c in caps['capabilities'] if c['name'] == 'jev')['status'] == 'DISABLED_UNVERIFIED'


def test_evidence_drift_and_revoke(studio):
    studio.create(); studio.evidence(); studio.product()
    product = studio.store.get(studio.store.project(studio.pid)['state']['product_id'])
    assert product['data']['url'] == 'https://example.com/product/1?itemId=2&vendorItemId=3'
    studio.post('/v1/revocations', {'subject_id': studio.receipt, 'reason': 'withdrawn'})
    with pytest.raises(Gate, match='unavailable'):
        studio.pipeline.receipts([studio.receipt], studio.pid)
    receipt = studio.store.get(studio.receipt)
    blob = studio.store.blob(receipt['data']['blob_id'])
    blob.write_text('changed')
    with pytest.raises(Gate) as error:
        studio.store.blob(receipt['data']['blob_id'])
    assert error.value.code == 'BLOB_DRIFT'


def test_secret_upload_rejected_without_read(studio):
    response = studio.client.post('/v1/uploads', files={'file': ('api.txt', b'non-secret dummy')}, headers=studio.headers())
    assert response.status_code == 422
    assert response.json()['code'] == 'SECRET_FILE_DENIED'


def snapshots():
    base = datetime(2026, 9, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(11):
        pub = base + timedelta(days=i)
        rows.append({'video_id': f'video{i}', 'channel_id': 'channel', 'published_at': pub.isoformat(),
                     'observed_at': (pub + timedelta(hours=72)).isoformat(), 'views': 1000 if i < 10 else 50000,
                     'provider': 'fixture', 'definition': 'v1', 'shorts_status': 'confirmed', 'commerce_type': 'demo',
                     'shopping_tag_status': 'unknown', 'receipt_id': 'receipt'})
    return {'candidate_id': 'video10', 'age_hours': 72, 'snapshots': rows}


def test_outlier_exact_and_self_exclusion():
    data = snapshots()
    data['snapshots'].append(copy.deepcopy(data['snapshots'][0]))
    r = analyze(data)
    assert r['status'] == 'CONFIRMED_OUTLIER' and r['lift'] == 50 and r['sample_count'] == 10
    assert 'video10' not in r['cohort_ids']


@pytest.mark.parametrize('mutation', ['missing', 'wrong_provider', 'wrong_definition', 'late', 'future', 'not_short'])
def test_bad_cohorts_never_confirm(mutation):
    data = snapshots()
    row = data['snapshots'][0]
    if mutation == 'missing': row['views'] = None
    if mutation == 'wrong_provider': row['provider'] = 'other'
    if mutation == 'wrong_definition': row['definition'] = 'v0'
    if mutation == 'late': row['observed_at'] = (datetime.fromisoformat(row['published_at']) + timedelta(hours=73)).isoformat()
    if mutation == 'future': row['published_at'] = '2026-12-01T00:00:00+00:00'
    if mutation == 'not_short': row['shorts_status'] = 'probable'
    assert analyze(data)['status'] == 'INSUFFICIENT_BASELINE'


def test_baseline_zero_and_correction():
    data = snapshots()
    for row in data['snapshots'][:-1]: row['views'] = 0
    r = analyze(data)
    assert r['baseline_zero'] and r['lift'] is None
    second = copy.deepcopy(data['snapshots'][-1]); second['views'] = 1; second['observed_at'] = '2026-09-15T00:00:00+00:00'
    data['snapshots'].append(second)
    assert any(v['status'] == 'CORRECTION' and v['views_per_hour'] is None for v in analyze(data)['velocity'])


def test_numeric_and_timezone_contract():
    row = snapshots()['snapshots'][0]
    row['views'] = True
    with pytest.raises(ValidationError): Snapshot.model_validate(row)
    row['views'] = 12; row['observed_at'] = '2026-09-04T00:00:00'
    with pytest.raises(ValidationError): Snapshot.model_validate(row)


def test_production_cannot_use_fixture(studio):
    studio.create(mode='production')
    j = studio.stage('product', {'name': 'X','brand':'X','model':'X','variant':'X','url':'https://example.com',
                        'claims':[{'id':'c','text':'x','level':'seller_claim','receipt_ids':['missing']}],
                        'attestation':{'actor':'x','model':'fixture','surface':'fixture','receipt_ids':['missing'],'notes':'x'}}, 'FAILED')
    assert j['error']['code'] in {'NOT_FOUND', 'SYNTHETIC_EVIDENCE'}


def test_product_revisions_are_immutable(studio):
    studio.create(); studio.evidence(); studio.product()
    first = studio.store.project(studio.pid)['state']['product_id']
    studio.product()
    second = studio.store.project(studio.pid)['state']['product_id']
    assert first != second
    assert studio.store.get(first)['hash'] == studio.store.get(second)['hash']


def test_operator_completion_is_replay_safe(studio):
    studio.create(); studio.evidence(); studio.product()
    product = studio.store.get(studio.store.project(studio.pid)['state']['product_id'])['data']
    j = studio.stage('product', {}, 'WAITING_INPUT')
    packet = studio.client.get(f'/v1/jobs/{j["id"]}/packet').json()
    body = {'binding': packet['binding'], 'result': product}
    first = studio.post(f'/v1/jobs/{j["id"]}/inputs', body, 202, key='same-input')
    studio.pipeline.execute(j['id'])
    replay = studio.post(f'/v1/jobs/{j["id"]}/inputs', body, 202, key='same-input')
    assert first == replay
    assert studio.pipeline.job(j['id'])['state'] == 'SUCCEEDED'
    assert len(studio.store.list('submission', studio.pid)) == 1


def test_changed_project_rejects_old_completion(studio):
    studio.create(); studio.evidence(); studio.product()
    product = studio.store.get(studio.store.project(studio.pid)['state']['product_id'])['data']
    j = studio.stage('product', {}, 'WAITING_INPUT')
    packet = studio.client.get(f'/v1/jobs/{j["id"]}/packet').json()
    with studio.store.transaction() as db:
        db.execute('UPDATE projects SET revision=revision+1 WHERE id=?', (studio.pid,))
    result = studio.post(f'/v1/jobs/{j["id"]}/inputs', {'binding': packet['binding'], 'result': product}, 409)
    assert result['code'] == 'REVISION_CONFLICT'


def test_real_analytics_waits_for_evidence(studio):
    studio.create(mode='production')
    path = studio.store.root / 'work' / 'observation.txt'; path.write_text('Observed test data')
    blob = studio.upload(path)
    receipt = studio.post(f'/v1/projects/{studio.pid}/receipts', {'blob_id':blob,'url':'https://example.com',
        'observed_at':'2026-09-22T00:00:00+00:00','surface':'manual','note':'Test scope'},201)['id']
    data = snapshots()
    for row in data['snapshots']: row['receipt_id']=receipt
    data['attestation']={'actor':'test','model':'manual','surface':'manual','receipt_ids':[receipt],'notes':'test'}
    j=studio.stage('discovery',data,'WAITING_INPUT')
    assert j['error']['code']=='ANALYTICS_NOT_AUTHORIZED'
    assert studio.store.list('outlier',studio.pid)==[]


def test_cancelled_worker_cannot_publish_a_result(studio, monkeypatch):
    studio.create()
    p = studio.store.project(studio.pid)
    queued = studio.post(f'/v1/projects/{studio.pid}/stages/timeline', {'expected_revision':p['revision'],'payload':{'lock':False,'layouts':{}}},202)
    def cancelled_dispatch(*args):
        studio.pipeline.cancel(queued['job_id'])
        return {'render_id':'must-not-appear'}, {'finished':True}
    monkeypatch.setattr(studio.pipeline,'dispatch',cancelled_dispatch)
    studio.pipeline.execute(queued['job_id'])
    assert studio.pipeline.job(queued['job_id'])['state']=='CANCELLED'
    assert studio.store.project(studio.pid)['revision']==p['revision']
    assert 'render_id' not in studio.store.project(studio.pid)['state']


def test_conflicting_metric_snapshot_rejected():
    data=snapshots()
    duplicate=copy.deepcopy(data['snapshots'][0]);duplicate['views']=999999
    data['snapshots'].append(duplicate)
    data['attestation']={'actor':'fixture','model':'fixture','surface':'fixture','receipt_ids':['r'],'notes':'test'}
    with pytest.raises(ValidationError,match='Conflicting'):
        Discovery.model_validate(data)
