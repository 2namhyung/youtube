const ROUTES = Object.freeze({
  assembly: {route_id:'assembly-image-attachments', hosts:['www.assembly.go.kr','assembly.go.kr','img.assembly.go.kr'], media_types:['photo','video']},
  police: {route_id:'national-police-official', hosts:['www.police.go.kr','police.go.kr'], media_types:['photo','video']},
  prosecution: {route_id:'prosecution-official', hosts:['www.spo.go.kr','spo.go.kr'], media_types:['photo','video']},
  justice: {route_id:'moj-official', hosts:['www.moj.go.kr','moj.go.kr'], media_types:['photo','video']},
  briefing: {route_id:'policy-briefing-official', hosts:['www.korea.kr','korea.kr'], media_types:['photo','video']},
});

function normalized(value) { return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR'); }

export function planKoreanOfficialRoute(brief, mediaType) {
  const text = normalized([brief.subject, brief.action, brief.place_context, brief.required_view, ...(brief.queries ?? [])].join(' '));
  const key = /국회|본회의|의원|assembly|parliament/.test(text) ? 'assembly'
    : /경찰|수사관|police/.test(text) ? 'police'
    : /검찰|검사|prosecut/.test(text) ? 'prosecution'
    : /법무부|justice ministry/.test(text) ? 'justice'
    : /정부|브리핑|government|briefing/.test(text) ? 'briefing'
    : null;
  if (!key) return {status:'unresolved-official-route', production_authority:false, reason:'기관을 특정할 수 없어 공식 첨부 호스트를 선택하지 않았다.'};
  const route = ROUTES[key];
  if (!route.media_types.includes(mediaType)) return {status:'unsupported-media-type', production_authority:false, route_id:route.route_id, reason:'선택한 공식 경로가 요청 미디어 유형을 지원하지 않는다.'};
  return {
    status:'manual-official-item-discovery-required',
    production_authority:false,
    route_id:route.route_id,
    allowed_hosts:route.hosts,
    media_type:mediaType,
    query:[brief.subject,brief.action,brief.place_context,brief.viewpoint].map((value)=>String(value??'').trim()).filter(Boolean).join(' '),
    required_evidence:['official_item_url','original_attachment_url','creator_or_publisher','item_level_rights','local_original_sha256','decoded_media','brief_specific_visual_observation'],
    reason:'공식 사이트의 페이지 구조와 항목별 권리가 달라 허용 호스트의 원문·첨부를 확인한 뒤 수동 등록한다.',
  };
}

export function officialRouteIds() { return Object.values(ROUTES).map((route)=>route.route_id); }
