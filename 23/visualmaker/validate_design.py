"""Reference validator for a PROPOSED contract; not an application or legal verifier.

Validates JSON structure, source integrity, references, template props, and a
publication-readiness gate. It does not read actual media, call providers, verify
copyright permissions, run renderers, or implement persistent transactions.
"""
from __future__ import annotations
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from typing import Any
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
SCHEMA = json.loads((ROOT / 'contracts/scene-plan.schema.json').read_text(encoding='utf-8'))
REGISTRY = json.loads((ROOT / 'contracts/template-registry.json').read_text(encoding='utf-8'))
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())

class ContractError(ValueError):
    """The proposed planning contract or an application invariant is invalid."""

def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractError(message)

def digest(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def unique_map(items: list[dict[str, Any]], label: str) -> dict[str, dict[str, Any]]:
    ids = [item['id'] for item in items]
    require(len(ids) == len(set(ids)), f'duplicate {label} id')
    return {item['id']: item for item in items}

def validate(plan: dict[str, Any], *, publish: bool = False) -> None:
    """Raise ContractError for malformed structure or a violated invariant."""
    errors = sorted(VALIDATOR.iter_errors(plan), key=lambda e: str(list(e.path)))
    if errors:
        e = errors[0]
        raise ContractError(f'schema {list(e.path)}: {e.message}')
    script = plan['script']
    segments = unique_map(script['segments'], 'segment')
    beats = unique_map(plan['beats'], 'beat')
    claims = unique_map(plan['claims'], 'claim')
    evidence = unique_map(plan['evidence'], 'evidence')
    assets = unique_map(plan['assets'], 'asset')
    reqs = unique_map(plan['requirements'], 'requirement')
    scenes = unique_map(plan['scenes'], 'scene')
    require(digest(script['rawText']) == script['rawSha256'], 'raw script hash mismatch')
    require(digest(script['spokenText']) == script['spokenSha256'], 'spoken script hash mismatch')
    require(script['spokenText'] == '\n'.join(s['text'] for s in script['segments']),
            'spoken text differs from ordered source segments; create a new script revision for edits')
    end = 0
    for segment in script['segments']:
        require(end <= segment['start'] < segment['end'] <= len(script['rawText']), 'overlap or invalid source span')
        require(script['rawText'][segment['start']:segment['end']] == segment['text'], 'source span text mismatch')
        end = segment['end']
    coverage = [sid for beat in plan['beats'] for sid in beat['segmentIds']]
    require(coverage == list(segments), 'narration coverage/order mismatch')
    for beat in plan['beats']:
        require(set(beat['claimIds']) <= claims.keys(), 'unknown claim reference')
    for claim in plan['claims']:
        require(set(claim['evidenceIds']) <= evidence.keys(), 'unknown evidence reference')
        if claim['status'] == 'supported':
            require(bool(claim['evidenceIds']), 'supported claim without evidence')
            require(all(evidence[eid]['reviewStatus'] == 'checked' for eid in claim['evidenceIds']), 'unchecked evidence')
    for r in plan['requirements']:
        require(r['assetId'] is None or r['assetId'] in assets, 'unknown requirement asset')
        if r['assetId']:
            require(assets[r['assetId']]['mediaType'] == r['mediaType'], 'requirement asset media type mismatch')
    scene_beats = [bid for scene in plan['scenes'] for bid in scene['beatIds']]
    require(Counter(scene_beats) == Counter(beats.keys()), 'scene beat coverage mismatch')
    require(sorted(s['order'] for s in plan['scenes']) == list(range(len(scenes))), 'scene order must be unique and contiguous')
    global_candidate_ids: set[str] = set()
    for scene in plan['scenes']:
        require(set(scene['beatIds']) <= beats.keys(), 'unknown scene beat')
        candidate_map = unique_map(scene['candidates'], 'candidate')
        require(not (candidate_map.keys() & global_candidate_ids), 'candidate id reused across scenes')
        global_candidate_ids.update(candidate_map)
        require(scene['selectedCandidateId'] is None or scene['selectedCandidateId'] in candidate_map,
                'selected candidate is not part of scene')
        if scene['approval'] == 'approved':
            require(scene['selectedCandidateId'] is not None, 'approved scene must select a candidate')
        source_ids = {sid for bid in scene['beatIds'] for sid in beats[bid]['segmentIds']}
        for candidate in scene['candidates']:
            layers = unique_map(candidate['layers'], 'layer')
            require(len({x['zIndex'] for x in candidate['layers']}) == len(layers), 'ambiguous layer order')
            for layer in candidate['layers']:
                require(layer['assetId'] is None or layer['assetId'] in assets, 'unknown layer asset')
                require(layer['requirementId'] is None or layer['requirementId'] in reqs, 'unknown layer requirement')
                require(not (layer['assetId'] and layer['requirementId']), 'use assetId OR requirementId, not both')
                if layer['kind'] == 'media':
                    require(bool(layer['assetId'] or layer['requirementId']), 'media layer has no acquisition plan')
                    require(layer['templateId'] is None and layer['templateVersion'] is None and not layer['props'], 'media layer must not contain executable or template properties')
                else:
                    key = f"{layer['templateId']}@{layer['templateVersion']}"
                    require(key in REGISTRY, f'unknown template {key}')
                    prop_errors = list(Draft202012Validator(REGISTRY[key]).iter_errors(layer['props']))
                    require(not prop_errors, f'invalid template props for {key}')
                    if layer['templateId'] == 'card-stack':
                        require(layer['props']['highlightIndex'] < len(layer['props']['cards']), 'card highlight outside list')
                    if layer['templateId'] == 'process':
                        require(layer['props']['activeStep'] < len(layer['props']['steps']), 'process index outside list')
            for cue in candidate['cues']:
                require(cue['targetLayerId'] in layers, 'unknown motion target')
                require(cue['segmentId'] in source_ids, 'motion cue is anchored outside the scene')
                require(segments[cue['segmentId']]['text'].count(cue['phrase']) >= cue['occurrence'], 'motion phrase not in source')
    timeline = plan['compiledTimeline']
    if timeline:
        require(timeline['sourceSpokenSha256'] == script['spokenSha256'], 'timing belongs to stale narration')
        require([c['sceneId'] for c in timeline['clips']] == [s['id'] for s in sorted(plan['scenes'], key=lambda s:s['order'])], 'compiled scene ordering mismatch')
        pos = 0
        for clip in timeline['clips']:
            require(clip['startFrame'] == pos, 'timeline gap or overlap in v0.2 sequential timeline')
            pos += clip['durationFrames']
        require(pos == timeline['totalFrames'], 'timeline total differs from clips')
    if publish:
        require(script['spokenApproval'] == 'approved', 'spoken script needs approval')
        require(timeline is not None and timeline['status'] == 'reviewed', 'final audio timing must be reviewed')
        for claim in plan['claims']:
            if claim['kind'] == 'factual':
                require(claim['status'] == 'supported', 'unverified factual claim blocks publish')
        for scene in plan['scenes']:
            require(scene['approval'] == 'approved', 'scene requires approval')
            selected = next(c for c in scene['candidates'] if c['id'] == scene['selectedCandidateId'])
            for layer in selected['layers']:
                aid = layer['assetId']
                if layer['requirementId']:
                    aid = reqs[layer['requirementId']]['assetId']
                    require(aid is not None, 'selected media requirement unresolved')
                if aid:
                    asset = assets[aid]
                    require(asset['availability'] == 'available', 'selected asset unavailable')
                    require(bool(asset['localPath']) and bool(asset['contentSha256']), 'selected asset not ingested')
                    rights = asset['rights']
                    require(rights['status'] == 'approved_for_use' and bool(rights['decisionId']) and bool(rights['basis']), 'selected asset requires recorded rights decision')

def apply_selection_patch(plan: dict[str, Any], *, base_revision: int, scene_id: str, candidate_id: str) -> dict[str, Any]:
    """In-memory demonstration of optimistic revision and field-lock guards only.
    A real API must perform these checks atomically in a database transaction.
    """
    validate(plan)
    require(base_revision == plan['revision'], 'stale revision (API should return 409)')
    copy = deepcopy(plan)
    scene = next((s for s in copy['scenes'] if s['id'] == scene_id), None)
    require(scene is not None, 'unknown scene')
    require('selectedCandidateId' not in scene['lockedFields'], 'selected candidate is locked')
    require(candidate_id in {c['id'] for c in scene['candidates']}, 'unknown candidate')
    scene['selectedCandidateId'] = candidate_id
    scene['approval'] = 'draft'
    copy['revision'] += 1
    # Conservative sample policy: selection edits require timing/composition re-review.
    if copy['compiledTimeline']:
        copy['compiledTimeline']['status'] = 'aligned'
    validate(copy)
    return copy

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', nargs='?', default=str(ROOT/'examples/scene-plan.json'))
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    try:
        document = json.loads(Path(args.plan).read_text(encoding='utf-8'))
        validate(document, publish=args.publish)
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        parser.exit(1, f'INVALID: {exc}\n')
    print('VALID: proposed contract' + ('; publishing-state records checked (not real asset/legal verification)' if args.publish else '; draft planning mode'))
