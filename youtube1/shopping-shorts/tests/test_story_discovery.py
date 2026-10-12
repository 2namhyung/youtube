from datetime import datetime, timedelta, timezone
from copy import deepcopy
from contextlib import closing

import pytest
from pydantic import ValidationError
from apps.api.store import Store, Gate
from packages.contracts.story_discovery import StoryEvidence, StoryTopicReview, StoryCollectionRequest
from workers.discovery.story_topics import (register_evidence, evaluate_topic, submit_review, collect_topics,
    search_plan, dashboard, DEFINITION)
from scripts.discover_shopping_channels import RemoteQuotaStop
from workers.discovery.story_topics import apply_stats_response, verify_channel_activity
from workers.discovery.story_topics import register_channel_observation, write_report
from packages.contracts.story_discovery import StoryChannelObservation
from tests.helpers import Studio


def evidence(store, observed, family='one', surface='web-article', published=True, **extra):
    body = dict(url=f'https://example.com/{family}', title='Synthetic evidence', summary='Fixture, not real research.',
                surface=surface, observed_at=observed.isoformat(), source_family=family,
                actor='test', model='fixture-no-model', observation_scope='synthetic text')
    if published:
        body['published_at'] = (observed-timedelta(days=1)).isoformat()
    return register_evidence(store, StoryEvidence.model_validate(body | extra))['id']


def setup_review(store, observed):
    ids = [evidence(store, observed, family=f) for f in ('one','two')]
    return StoryTopicReview.model_validate(dict(topic_id='test-topic', topic='Synthetic story', angle='A surprising change',
        why_now='Needs measured interest', evidence_ids=ids, independent_source_ids=ids,
        independence_reason='Fixture represents two distinct originals', video_ids=['test-video'],
        story=dict(hook='A question',setup='A situation',turn='A discovery',payoff='An answer',
                   survives_without_sales_pitch=True, content_review_complete=True, claims=[dict(text='Fixture claim',evidence_ids=[ids[0]])]),
        bridges=[dict(category='Story object',role='story_object',reason='It is the object in the story',
                      placement='In the discovery',evidence_ids=[ids[0]],unrelated_product_would_be_awkward=True)],
        followup_queries=['observed entity story'],actor='test',model='fixture-no-model'))


def video(store, observed, active=True):
    store.record('story-video',dict(video_id='test-video',channel_id='test-channel',title='Fixture',views=100,
                                  url='https://www.youtube.com/watch?v=test-video',observed_at=observed.isoformat()))
    if active:
        store.record('story-channel',dict(channel_id='test-channel',observed_at=observed.isoformat(),status='active'))


def metrics(store, observed, values=(1000,2000,4000)):
    for offset, views in zip((24,12,0), values):
        store.record('story-metric',dict(video_id='test-video',views=views,definition=DEFINITION,
                                       observed_at=(observed-timedelta(hours=offset)).isoformat()))


def test_story_bridge_and_activity_are_required_but_trend_is_optional(tmp_path):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed)
        video(store,observed,active=False)
        metrics(store,observed)
        assert evaluate_topic(store,review)['status']=='activity_unknown'
        video(store,observed)
        assert evaluate_topic(store,review)['status']=='ready_for_product_research'
        weak=deepcopy(review);weak.story.survives_without_sales_pitch=False
        assert evaluate_topic(store,weak)['status']=='story_not_primary'
        weak=deepcopy(review);weak.bridges=[]
        assert evaluate_topic(store,weak)['status']=='no_natural_bridge'
        weak=deepcopy(review);weak.independent_source_ids=weak.independent_source_ids[:1]
        assert evaluate_topic(store,weak)['status']=='ready_for_product_research'
        assert evaluate_topic(store,weak)['planning_status']=='planning_candidate'
        assert evaluate_topic(store,weak)['gates']['trend']=='unknown'


@pytest.mark.parametrize('details,expected', [({'duration':'47.5s'},47.5),({'duration':'PT2M3S'},123),
    ({'durationMillis':'190000'},190),({'duration':'NaNs'},0),({'duration':'-1s'},0)])
def test_stats_replay_enriches_unknown_duration_without_fabricating_time(tmp_path,details,expected):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc).isoformat()
        store.record('story-video',dict(video_id='v',channel_id='c',duration_seconds=0,metadata_state='search_only'))
        raw={'items':[{'id':'v','contentDetails':details,'snippet':{'publishTime':'2026-09-01T01:00:00Z'},'statistics':{'viewCount':'123'}}]}
        counts=apply_stats_response(store,raw,observed)
        assert counts=={'stats_refreshed':1,'metadata_enriched':int(expected>0)}
        assert store.list('story-video')[0]['data']['duration_seconds']==expected
        assert store.list('story-metric')[0]['data']['observed_at']==observed
        assert apply_stats_response(store,raw,observed)=={'stats_refreshed':0,'metadata_enriched':0}


@pytest.mark.parametrize('count,status',[(4,'activity_unknown'),(5,'active')])
def test_activity_search_only_proves_positive_threshold(tmp_path,count,status):
    class Api:
        def get(self, method, params, bucket):
            assert method=='search' and params['channelId']=='c' and params['maxResults']==5
            rows=[{'id':{'videoId':str(i)},'snippet':{'channelId':'c','publishedAt':datetime.now(timezone.utc).isoformat()}} for i in range(count)]
            return {'items':rows+[rows[0],{'id':{'videoId':'wrong-channel'},'snippet':{'channelId':'other','publishedAt':rows[0]['snippet']['publishedAt']}}]}
    with closing(Store(tmp_path)) as store:
        result=verify_channel_activity(store,Api(),['c'])
        assert result['checked'][0]['status']==status
        assert result['checked'][0]['recent_90d_count_lower_bound']==count
        assert result['checked'][0]['coverage_complete'] is False


def test_chrome_upload_evidence_uses_conservative_age_and_distinct_ids(tmp_path):
    cid='UC'+'a'*22
    data=dict(channel_id=cid,source_url=f'https://www.youtube.com/channel/{cid}/videos',
        observed_at=datetime.now(timezone.utc),actor='test',model='fixture',
        uploads=[dict(video_id=str(i).zfill(11),title='Fixture',age_text='1일 전') for i in range(5)])
    with closing(Store(tmp_path)) as store:
        result=register_channel_observation(store,StoryChannelObservation.model_validate(data))
        assert result['data']['status']=='active'
        assert result['data']['proof_uploads'][0]['publication_age_upper_days']==2
        data['uploads'][0]['age_text']='13주 전'
        with pytest.raises(Gate,match='five distinct'):register_channel_observation(store,StoryChannelObservation.model_validate(data))
        data['uploads'][0]['video_id']=data['uploads'][1]['video_id']
        with pytest.raises(ValidationError):StoryChannelObservation.model_validate(data)
        data['source_url']='https://www.youtube.com/results?search_query=test'
        with pytest.raises(ValidationError):StoryChannelObservation.model_validate(data)


def test_frequent_polls_do_not_destroy_spaced_growth_baseline(tmp_path):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed);video(store,observed);metrics(store,observed)
        store.record('story-metric',dict(video_id='test-video',views=4001,definition=DEFINITION,
                                       observed_at=(observed+timedelta(seconds=5)).isoformat()))
        result=evaluate_topic(store,review,(observed+timedelta(seconds=10)).isoformat())
        assert result['status']=='ready_for_product_research'
        assert result['growth_evidence'][0]['elapsed_hours']>12


@pytest.mark.parametrize('values',[(1000,2000,3000),(4000,5000,4500),(1,100,150)])
def test_absolute_growth_or_corrections_are_not_acceleration(tmp_path,values):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed);video(store,observed);metrics(store,observed,values)
        result=evaluate_topic(store,review)
        assert result['status']=='ready_for_product_research'
        assert result['gates']['trend']=='unknown'
        if values[-1]<values[-2]:
            assert result['growth_evidence'][0]['status']=='CORRECTION'


def test_undated_article_is_not_recent_and_sources_are_deduplicated(tmp_path):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed);video(store,observed);metrics(store,observed)
        undated=evidence(store,observed,'old',published=False)
        review.evidence_ids.append(undated)
        review.independent_source_ids=[review.evidence_ids[0],undated]
        assert evaluate_topic(store,review)['independent_recent_families']==1
        duplicate=evidence(store,observed,'one',summary='Another article, same original source')
        review.evidence_ids.append(duplicate);review.independent_source_ids=[review.evidence_ids[0],duplicate]
        assert evaluate_topic(store,review)['gates']['trend']=='unknown'


def test_search_snippets_do_not_prove_story_claims(tmp_path):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed);video(store,observed);metrics(store,observed)
        snippet=evidence(store,observed,'snippet',surface='search-results')
        review.evidence_ids.append(snippet);review.story.claims[0].evidence_ids=[snippet]
        assert evaluate_topic(store,review)['status']=='needs_observation'
        data=review.model_dump();data['story']['claims'][0]['evidence_ids']=['invented']
        with pytest.raises(ValidationError):StoryTopicReview.model_validate(data)


def test_activity_expires_and_inactive_is_excluded(tmp_path):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed);video(store,observed);metrics(store,observed)
        store.record('story-channel',dict(channel_id='test-channel',observed_at=(observed-timedelta(days=8)).isoformat(),status='active'))
        assert evaluate_topic(store,review)['status']=='activity_unknown'
        assert dashboard(store)['candidates'][0]['activity_status']=='activity_unknown'
        store.record('story-channel',dict(channel_id='test-channel',observed_at=observed.isoformat(),status='below_minimum'))
        assert evaluate_topic(store,review)['status']=='channel_inactive'


def test_observed_topics_drive_expansion_without_rejected_stories(tmp_path):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed);video(store,observed)
        submit_review(store,review)
        plan=search_plan(store,StoryCollectionRequest())
        assert plan[0]['origin']=='bootstrap'
        assert plan[2]['origin']=='observed-topic-expansion'
        assert plan[2]['evidence_ids']==review.evidence_ids
        review.story.survives_without_sales_pitch=False;submit_review(store,review)
        assert search_plan(store,StoryCollectionRequest())[0]['origin']=='bootstrap'


class FakeYouTube:
    def __init__(self,blocked=False,dates=5,incomplete=False):
        self.used=dict(read=0,search=0,stats=0);self.budgets=dict(read=100,search=6,stats=20)
        self.blocked=blocked;self.dates=dates;self.incomplete=incomplete;self.calls=[]
    def get(self,endpoint,params,bucket='read'):
        self.calls.append((endpoint,params,bucket));self.used[bucket]+=1
        if self.blocked and bucket!='stats':raise RemoteQuotaStop('Synthetic HTTP 403')
        if endpoint=='search':return dict(items=[{'id':{'videoId':'test-video'}}])
        if endpoint=='videos':return dict(items=[dict(id='test-video',snippet=dict(channelId='test-channel',publishedAt='2026-01-01T00:00:00Z',title='A story with no product words'),contentDetails={'duration':'PT9M'},statistics={'viewCount':'2000'})])
        if endpoint=='channels':return dict(items=[dict(id='test-channel',contentDetails={'relatedPlaylists':{'uploads':'uploads'}})])
        if endpoint=='playlistItems':return dict(items=[{'contentDetails':{'videoPublishedAt':datetime.now(timezone.utc).isoformat()}} for _ in range(self.dates)],**({'nextPageToken':'more'} if self.incomplete else {}))
        return dict(items=[dict(id='test-video',statistics={'viewCount':'3000'})])


def test_read_search_failure_still_refreshes_existing_statistics(tmp_path):
    with closing(Store(tmp_path)) as store:
        video(store,datetime.now(timezone.utc),active=False)
        result=collect_topics(store,FakeYouTube(blocked=True),StoryCollectionRequest())
        assert result['stats_refreshed']==1
        assert {s['stage'] for s in result['stops']}=={'search','channel_activity'}


@pytest.mark.parametrize('count,incomplete,status',[(5,False,'active'),(4,False,'below_minimum'),(4,True,'activity_unknown')])
def test_collection_activity_coverage_and_no_shopping_gate(tmp_path,count,incomplete,status):
    with closing(Store(tmp_path)) as store:
        api=FakeYouTube(dates=count,incomplete=incomplete)
        # Dates slightly before collection start, as real already-published videos are.
        original_get=api.get
        def get(endpoint,params,bucket='read'):
            result=original_get(endpoint,params,bucket)
            if endpoint=='playlistItems':
                for item in result['items']:item['contentDetails']['videoPublishedAt']=(datetime.now(timezone.utc)-timedelta(days=1)).isoformat()
            return result
        api.get=get
        result=collect_topics(store,api,StoryCollectionRequest(search_budget=1))
        assert result['videos_hydrated']==1
        assert store.list('story-channel')[0]['data']['status']==status
        assert store.list('story-video')[0]['data']['shorts_status']=='not_short'
        assert 'videoDuration' not in api.calls[0][1]


def test_api_gates_idempotency_and_topic_handoff(tmp_path):
    app=Studio(tmp_path)
    observed=datetime.now(timezone.utc)
    review=setup_review(app.store,observed);video(app.store,observed,active=False)
    body=review.model_dump(mode='json')
    a=app.post('/v1/story-discovery/reviews',body,201,key='same-review')
    b=app.post('/v1/story-discovery/reviews',body,201,key='same-review')
    assert a['review_id']==b['review_id']
    project=app.create()
    path=f'/v1/projects/{project["id"]}/story-opportunity'
    selection=dict(topic_id=review.topic_id,expected_revision=1)
    result=app.post(path,selection,422)
    assert result['code']=='TOPIC_NOT_READY'
    video(app.store,observed,active=True)
    selected=app.post(path,selection)
    assert selected['revision']==2
    assert app.pipeline.context(project['id'])['records']['story_topic_id']['data']['topic_id']=='test-topic'
    assert app.post(path,selection,409)['code']=='REVISION_CONFLICT'


@pytest.mark.parametrize('baseline_days,expected',[(7,'pass'),(40,'unknown')])
def test_search_interest_requires_recent_comparable_window(tmp_path,baseline_days,expected):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        review=setup_review(store,observed);video(store,observed)
        trend=evidence(store,observed,'trend',surface='search-trend',published=False,
            series=[dict(at=(observed-timedelta(days=baseline_days)).isoformat(),value=40),dict(at=observed.isoformat(),value=60)],
            series_basis='SYNTHETIC: same request, query, KR geography, fixed time range, same normalization')
        review.evidence_ids.append(trend)
        assert evaluate_topic(store,review)['gates']['trend']==expected
        assert evaluate_topic(store,review)['status']=='ready_for_product_research'
        review.story.content_review_complete=False
        assert evaluate_topic(store,review)['status']=='needs_observation'


def test_future_evidence_and_unbound_series_are_rejected(tmp_path):
    with closing(Store(tmp_path)) as store:
        observed=datetime.now(timezone.utc)
        with pytest.raises(Gate) as error:evidence(store,observed+timedelta(days=1))
        assert error.value.code=='FUTURE_EVIDENCE'
        with pytest.raises(ValidationError):
            evidence(store,observed,surface='search-trend',series=[dict(at=observed.isoformat(),value=5)])


def test_topic_selection_rejects_pending_product_job(tmp_path):
    app=Studio(tmp_path)
    observed=datetime.now(timezone.utc)
    review=setup_review(app.store,observed);video(app.store,observed);metrics(app.store,observed)
    submit_review(app.store,review)
    project=app.create()
    app.post(f'/v1/projects/{project["id"]}/stages/product',dict(expected_revision=1,payload={}),202)
    revision=app.store.project(project['id'])['revision']
    result=app.post(f'/v1/projects/{project["id"]}/story-opportunity',dict(topic_id=review.topic_id,expected_revision=revision),409)
    assert result['code']=='PROJECT_BUSY'
    assert not app.store.project(project['id'])['state'].get('story_topic_id')
