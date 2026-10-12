import json
import httpx
import pytest
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
from scripts.discover_shopping_channels import YouTube, RemoteQuotaStop, BudgetStop
from scripts.discover_shopping_channels import next_quota_reset


@pytest.mark.parametrize('at,expected',[
    ('2026-09-23T01:00:00+00:00','2026-09-23T07:01:00+00:00'),
    ('2026-01-23T01:00:00+00:00','2026-01-23T08:01:00+00:00'),
    ('2026-03-08T09:00:00+00:00','2026-03-09T07:01:00+00:00'),
    ('2026-11-01T08:30:00+00:00','2026-11-02T08:01:00+00:00')])
def test_daily_reset_observes_pacific_dst(at,expected):
    assert next_quota_reset(datetime.fromisoformat(at)).isoformat()==expected


def test_legacy_cooldown_migrates_without_another_request(tmp_path):
    failed=datetime(2026,9,22,19,tzinfo=timezone.utc)
    path=tmp_path/'cooldowns.json'
    path.write_text(json.dumps({'read':{'until':(failed+timedelta(days=1)).isoformat(),'reason':'daily_quota_exhausted'}}))
    with client(lambda req:pytest.fail('network must not run'),tmp_path) as api:
        block=api._blocks()['read']
        assert block['until']=='2026-09-23T07:01:00+00:00'
        assert block['reset_policy']=='pacific_midnight_plus_60s'


def test_retry_after_http_date_is_respected(tmp_path):
    target=datetime.now(timezone.utc)+timedelta(minutes=30)
    with client(lambda req:httpx.Response(429,headers={'Retry-After':format_datetime(target)},json={}),tmp_path) as api:
        with pytest.raises(RemoteQuotaStop):api.get('search',{},bucket='search')
        remaining=(datetime.fromisoformat(api._blocks()['search']['until'])-datetime.now(timezone.utc)).total_seconds()
        assert 1795<=remaining<=1801

def client(handler, root=None, budget=10):
    return YouTube('first-secret',budget,budget,budget,backup_key='second-secret',
                   state_path=root / 'cooldowns.json' if root else None,transport=httpx.MockTransport(handler))

def error(status,reason):
    return httpx.Response(status,json={'error':{'errors':[{'reason':reason}], 'message':'sensitive provider text first-secret'}})

def test_invalid_key_fails_over_and_keeps_successful_key():
    calls=[]
    def request(req):
        calls.append(req.url.params['key'])
        return error(400,'keyInvalid') if calls[-1]=='first-secret' else httpx.Response(200,json={'items':[]})
    with client(request) as api:
        api.get('videos',{});api.get('videos',{})
        assert calls==['first-secret','second-secret','second-secret']
        assert api.used['read']==3
        assert api.credential_status()['active']=='backup'

@pytest.mark.parametrize('status,reason',[(403,'quotaExceeded'),(403,'dailyLimitExceeded'),(429,'rateLimitExceeded')])
def test_exhaustion_never_rotates_and_persists_cooldown(tmp_path,status,reason):
    calls=[]
    def request(req):
        calls.append(req.url.params['key']);return error(status,reason)
    with client(request,tmp_path) as api:
        with pytest.raises(RemoteQuotaStop):api.get('search',{},bucket='search')
    with client(request,tmp_path) as api:
        with pytest.raises(RemoteQuotaStop,match='cooldown'):api.get('search',{},bucket='search')
        assert api.used['search']==0
    assert calls==['first-secret']
    assert 'secret' not in (tmp_path / 'cooldowns.json').read_text()

def test_permission_error_does_not_rotate_or_leak_secret():
    calls=[]
    def request(req):
        calls.append(req);return error(403,'forbidden')
    with client(request) as api:
        with pytest.raises(RuntimeError) as e:api.get('channels',{})
        assert 'secret' not in str(e.value)
        assert 'permission_or_request_error' in str(e.value)
    assert len(calls)==1

def test_budget_counts_each_attempt_before_backup_request():
    with client(lambda req:error(400,'keyExpired'),budget=1) as api:
        with pytest.raises(BudgetStop):api.get('videos',{})
        assert api.used['read']==1

def test_separate_statistics_bucket_remains_available(tmp_path):
    def request(req):
        return error(403,'quotaExceeded') if req.url.path.endswith('/search') else httpx.Response(200,json={'items':[]})
    with client(request,tmp_path) as api:
        with pytest.raises(RemoteQuotaStop):api.get('search',{},bucket='search')
        assert api.get('videos:batchGetStats',{},bucket='stats')=={'items':[]}
        assert api.credential_status()['active']=='primary'

def test_network_exception_suppresses_secret_context():
    def request(req):raise httpx.NetworkError('first-secret',request=req)
    with client(request) as api:
        with pytest.raises(RuntimeError) as e:api.get('videos',{})
        assert str(e.value)=='YouTube Data API network failure'
        assert e.value.__suppress_context__
