import json
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from apps.api.main import create_app


class Studio:
    def __init__(self, root):
        self.app = create_app(root, start_worker=False)
        self.client = TestClient(self.app)
        self.store = self.app.state.store
        self.pipeline = self.app.state.pipeline
        self.token = self.client.get('/v1/session').json()['token']
        self.pid = None

    def headers(self, key=None):
        return {'X-Studio-Token': self.token, 'Idempotency-Key': key or uuid.uuid4().hex}

    def post(self, url, data, expected=200, key=None):
        response = self.client.post(url, json=data, headers=self.headers(key))
        assert response.status_code == expected, response.text
        return response.json()

    def create(self, mode='synthetic-test', name='합성 검증 · 수납함 이야기'):
        p = self.post('/v1/projects', {'name': name, 'mode': mode, 'desired_seconds': 3}, 201)
        self.pid = p['id']
        return p

    def upload(self, path):
        with open(path, 'rb') as source:
            response = self.client.post('/v1/uploads', files={'file': (path.name, source)}, headers=self.headers())
        assert response.status_code == 201, response.text
        return response.json()['id']

    def evidence(self):
        path = self.store.root / 'work' / 'fixture-evidence.txt'
        path.write_text('SYNTHETIC TEST EVIDENCE ONLY. Generated test sources, not a real product or voice review.', encoding='utf-8')
        blob = self.upload(path)
        record = self.post(f'/v1/projects/{self.pid}/receipts', {'blob_id': blob, 'url': 'fixture://shopping-tests',
                           'observed_at': datetime.now(timezone.utc).isoformat(), 'surface': 'fixture',
                           'note': '합성 데이터 계약·렌더 테스트 전용 근거'}, 201)
        self.receipt = record['id']
        self.att = {'actor': 'integration-test', 'model': 'fixture-no-model-executed', 'surface': 'fixture',
                    'receipt_ids': [self.receipt], 'notes': 'Synthetic contract fixture. No real semantic or listening evaluation.'}
        return self.receipt

    def stage(self, name, payload, state='SUCCEEDED'):
        p = self.store.project(self.pid)
        r = self.post(f'/v1/projects/{self.pid}/stages/{name}', {'expected_revision': p['revision'], 'payload': payload}, 202)
        self.pipeline.execute(r['job_id'])
        j = self.pipeline.job(r['job_id'])
        assert j['state'] == state, json.dumps(j['error'], ensure_ascii=False)
        return j

    def product(self):
        return self.stage('product', {'name': '합성 테스트 수납함', 'brand': 'TEST', 'model': 'BOX-TEST-01', 'variant': 'white-10L',
                          'url': 'https://example.com/product/1?itemId=2&vendorItemId=3&utm_source=test',
                          'claims': [{'id': 'folds', 'text': '접을 수 있는 합성 테스트 상품', 'level': 'independently_observed',
                                      'receipt_ids': [self.receipt], 'expires_at': None}], 'attestation': self.att})

    def review(self, subject_id):
        return self.stage('review', {'subject_id': subject_id, 'verdict': 'pass', 'facts': True, 'product': True,
                                    'visual': True, 'audio': True, 'captions': True, 'attestation': self.att})
