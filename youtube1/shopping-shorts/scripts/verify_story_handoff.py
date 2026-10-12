"""Verify generated Stage 1 handoff lineage and record exact delivered file hashes."""
from pathlib import Path
import hashlib
import json
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from apps.api.store import Store, digest, now, require


def verify(store):
    folder = store.root / 'reports/story-discovery'
    document = json.loads((folder / 'planning-briefs.json').read_text(encoding='utf-8'))
    creator = store.list('story-planning-handoff')[0]
    require(digest(document) == creator['data']['content_hash'], 'HANDOFF_DRIFT', 'Generated document changed')
    for topic in document['topics']:
        review = store.get(topic['review_id'], 'story-review')
        require(all(topic.get(k) == value for k, value in review['data'].items()),
                'REVIEW_DRIFT', 'Handoff differs from the immutable reviewed proposal')
        for evidence_id in topic['evidence_ids']:
            store.get(evidence_id, 'story-evidence')
        if topic['planning_status'] == 'planning_candidate':
            require(topic['gates']['story'] == topic['gates']['bridge'] == 'pass'
                    and not topic['activity_unknown'] and not topic['activity_excluded'],
                    'INELIGIBLE_PLANNING', 'Planning candidate is missing a required gate')
    files = [{"path": name, "sha256": hashlib.sha256((folder / name).read_bytes()).hexdigest(),
              "bytes": (folder / name).stat().st_size}
             for name in ('planning-briefs.json', 'planning-briefs.md')]
    rid = store.record('story-planning-verification', dict(schema='story-planning-verification-v1',
        observed_at=now(), creator_id=creator['id'], content_hash=digest(document), files=files,
        result='pass', scope='file integrity, immutable review/evidence lineage and planning eligibility; not independent semantic QA'))
    return dict(record_id=rid, result='pass', topics=len(document['topics']), files=files)


if __name__ == '__main__':
    store = Store(Path(__file__).resolve().parents[1] / 'data')
    try: print(json.dumps(verify(store), ensure_ascii=False))
    finally: store.close()
