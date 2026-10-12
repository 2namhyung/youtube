from contextlib import closing
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError
from apps.api.store import Store, Gate
from packages.contracts.story_discovery import NarrativeIntake, StoryCollectionRequest
from workers.discovery.story_intake import submit_intake, reading_queue, narrative_groups, LANES
from workers.discovery.story_topics import recover_search_candidates, collect_topics, search_plan, evaluate_topic
from tests.test_story_discovery import evidence, setup_review, video, metrics, FakeYouTube
from tests.helpers import Studio
from packages.contracts.story_discovery import NarrativeIntakeBatch
from workers.discovery.story_intake import submit_intake_batch


def candidate(store, vid='v1', channel='channel1', title='친구 사이 반전', **extra):
    timestamp=datetime.now(timezone.utc).isoformat()
    return store.record('story-video', dict(video_id=vid,channel_id=channel,title=title,description='',
        channel_title='Fixture',observed_at=timestamp,published_at=timestamp,duration_seconds=60,
        views=100,url=f'https://www.youtube.com/watch?v={vid}',**extra))


def intake(vid='v1', **extra):
    return NarrativeIntake.model_validate(dict(video_id=vid,event_key='one-specific-event',domain='relationships',
        content_kind='fiction',decision='needs_content',summary='Fixture story',reason='Synthetic review only',
        actor='test',model='fixture-no-model') | extra)


def test_no_product_fields_and_no_title_only_candidates(tmp_path):
    with pytest.raises(ValidationError):intake(product='bed')
    with pytest.raises(ValidationError):intake(decision='candidate')
    with closing(Store(tmp_path)) as store:
        candidate(store)
        rid=evidence(store,datetime.now(timezone.utc),surface='search-results')
        body=intake(decision='candidate',hook='Question',change='Change',payoff='Answer',evidence_ids=[rid])
        with pytest.raises(Gate,match='Search titles'):submit_intake(store,body)
        with pytest.raises(Gate,match='collected candidate'):submit_intake(store,intake('missing'))


def test_five_item_batch_validates_before_writing(tmp_path):
    with closing(Store(tmp_path)) as store:
        candidate(store)
        with pytest.raises(Gate):
            submit_intake_batch(store,NarrativeIntakeBatch(items=[intake(),intake('missing')]))
        assert store.list('story-intake')==[]
        result=submit_intake_batch(store,NarrativeIntakeBatch(items=[intake()]))
        assert len(result['saved_ids'])==1
        assert len(result['next_reading_queue'])<=5
        with pytest.raises(ValidationError):NarrativeIntakeBatch(items=[intake(),intake()])
        with pytest.raises(ValidationError):NarrativeIntakeBatch(items=[intake(str(i)) for i in range(6)])


def test_batch_api_idempotency_and_report_download(tmp_path):
    app=Studio(tmp_path)
    try:
        candidate(app.store)
        body={'items':[intake().model_dump(mode='json')]}
        a=app.post('/v1/story-discovery/intake-batches',body,201,key='five-review-batch')
        b=app.post('/v1/story-discovery/intake-batches',body,201,key='five-review-batch')
        assert a==b and len(app.store.list('story-intake'))==1
        packet=app.client.get('/v1/story-discovery/packet').json()
        assert packet['batch_size']==5 and len(packet['reading_queue'])<=5
        report=app.client.get('/v1/story-discovery/planning-report')
        assert report.status_code==200
        assert '1단계에서 활용할 이야기 기획안' in report.text
        assert 'attachment' in report.headers['content-disposition']
    finally:
        app.client.close();app.store.close()


def test_latest_review_controls_queue_group_and_fiction_label(tmp_path):
    with closing(Store(tmp_path)) as store:
        candidate(store)
        rid=evidence(store,datetime.now(timezone.utc))
        body=intake(decision='candidate',hook='Question',change='Change',payoff='Answer',evidence_ids=[rid])
        submit_intake(store,body)
        assert reading_queue(store)==[]
        group=narrative_groups(store)[0]
        assert group['members'][0]['content_kind']=='fiction'
        assert group['trend_status']=='not_evaluated'
        submit_intake(store,intake(decision='reject'))
        assert narrative_groups(store)==[]
        assert reading_queue(store)==[]
        submit_intake(store,intake())
        assert reading_queue(store)[0]['intake_status']=='needs_content'


def test_queue_balances_domains_limits_channel_and_excludes_known_inactive(tmp_path):
    titles=['친구 반전','회사 생긴 일','자취 이야기','러닝 이야기','음식 문화','몰랐던 사실']
    with closing(Store(tmp_path)) as store:
        for index,title in enumerate(titles):candidate(store,f'v{index}',f'c{index}',title)
        for index in range(6):candidate(store,f'same{index}','same-channel','친구 사연')
        candidate(store,'inactive','inactive-channel')
        store.record('story-channel',dict(channel_id='inactive-channel',status='below_minimum',observed_at=datetime.now(timezone.utc).isoformat()))
        queue=reading_queue(store,20)
        assert len({r['domain_hint'] for r in queue[:6]})==6
        assert sum(r['channel_id']=='same-channel' for r in queue)==2
        assert all(r['video_id']!='inactive' for r in queue)
        assert all(r['semantic_status']=='metadata_only' for r in queue)
        assert all(r['activity_status']=='activity_unknown' for r in queue)
        store.record('story-channel',dict(channel_id='inactive-channel',status='below_minimum',observed_at=(datetime.now(timezone.utc)-timedelta(days=8)).isoformat()))
        assert any(r['video_id']=='inactive' for r in reading_queue(store,20))


def test_balanced_search_rotates_exploration_and_anchors_expansion(tmp_path):
    with closing(Store(tmp_path)) as store:
        candidate(store)
        rid=evidence(store,datetime.now(timezone.utc))
        submit_intake(store,intake(decision='candidate',hook='Question',change='Change',payoff='Answer',
            evidence_ids=[rid],followup_queries=['observed event context','observed event followup']))
        plan=search_plan(store,StoryCollectionRequest())
        assert [p['origin'] for p in plan[:3]]==['bootstrap','bootstrap','observed-story-expansion']
        assert plan[2]['evidence_ids']==[rid]
        assert set(p['lane'] for p in plan if p['origin']=='bootstrap')==set(LANES)
        for p in plan[:2]:store.record('story-search',dict(query=p['query'],observed_at=datetime.now(timezone.utc).isoformat(),response={'items':[]}))
        next_plan=search_plan(store,StoryCollectionRequest())
        assert not {p['query'] for p in plan[:2]} & {p['query'] for p in next_plan[:2]}
        assert [p['lane'] for p in next_plan[:2]]==['daily_life','hobbies']


def test_search_failure_preserves_candidates_and_later_hydrates(tmp_path):
    class Partial(FakeYouTube):
        fail=True
        def get(self,endpoint,params,bucket='read'):
            if endpoint=='channels':return {'items':[]}
            if endpoint=='search':
                return {'items':[{'id':{'videoId':'test-video'},'snippet':{'title':'친구 반전','channelId':'test-channel','publishedAt':'2026-09-20T00:00:00Z'}}]}
            if endpoint=='videos' and self.fail:raise RuntimeError('Synthetic metadata quota exhausted')
            return super().get(endpoint,params,bucket)
    with closing(Store(tmp_path)) as store:
        api=Partial()
        result=collect_topics(store,api,StoryCollectionRequest(search_budget=1))
        assert result['search_candidates_added']==1
        assert result['videos_hydrated']==0
        queue=reading_queue(store)
        assert queue[0]['video_id']=='test-video'
        assert queue[0]['shorts_status']=='unknown'
        assert 'duration_unknown' in queue[0]['flags']
        assert queue[0]['views']==3000
        api.fail=False
        result=collect_topics(store,api,StoryCollectionRequest(search_budget=0))
        assert result['videos_hydrated']==1
        assert recover_search_candidates(store)==0
        assert store.list('story-video')[0]['data']['metadata_state']=='hydrated'


def test_fiction_intake_cannot_lose_disclosure_at_topic_stage(tmp_path):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed);video(store,observed);metrics(store,observed)
        submit_intake(store,intake('test-video',decision='candidate',hook='Question',change='Change',payoff='Answer',evidence_ids=review.evidence_ids))
        result=evaluate_topic(store,review)
        assert result['status']=='needs_observation'
        assert result['fiction_label_mismatch']
        review.story.content_kind='fiction'
        assert evaluate_topic(store,review)['status']=='ready_for_product_research'


def test_api_intake_idempotency_and_safe_credential_status(tmp_path,monkeypatch):
    monkeypatch.setenv('YOUTUBE_API_KEY','first-secret')
    monkeypatch.setenv('YOUTUBE_API_KEY_2','second-secret')
    app=Studio(tmp_path)
    candidate(app.store)
    body=intake().model_dump(mode='json')
    a=app.post('/v1/story-discovery/intakes',body,201,key='intake-one')
    b=app.post('/v1/story-discovery/intakes',body,201,key='intake-one')
    assert a['id']==b['id']
    assert app.client.get('/v1/story-discovery').json()['intake_counts']=={'needs_content':1}
    response=app.client.get('/v1/story-discovery/credentials')
    assert response.json()['configured']==2
    assert response.json()['quota_rotation'] is False
    assert 'secret' not in response.text
    assert 'narrative-intake' in app.client.get('/v1/contracts').json()
