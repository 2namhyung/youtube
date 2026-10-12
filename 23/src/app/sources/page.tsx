import Link from 'next/link';
import {
  runAssemblyBillsCollectionAction,
  runAssemblyMediaBatchAction,
  runAssemblyRosterSyncAction,
  runComplaintCollectionAction,
  runNamInsunPilotAction,
  runPexelsPhotoBatchAction,
  runPexelsVideoBatchAction,
  runWikimediaBatchAction,
  runNasaBatchAction,
  runLocBatchAction,
  runWikimediaVideoBatchAction,
  runNasaVideoBatchAction,
  runLocVideoBatchAction,
  runKoglMediaBatchAction,
  runKoglPhotoBatchAction,
  runKoglVideoBatchAction,
  runDigitalCultureBatchAction,
  runEp001KoreanRouteAction,
  runAssemblyPlenaryMinutesBatchAction,
  runAssemblyCommitteeMinutesBatchAction,
  runPolicyCollectionAction,
  runSourceDryRunAction,
} from '@/app/actions';
import { getSourceRegistry } from '@/lib/sources';
import { getEp001KoreanMediaRoutes } from '@/lib/ep001-korean-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function SourcesPage() {
  const sources = getSourceRegistry();
  const koreanRoutes = getEp001KoreanMediaRoutes();
  return <main className="data-page"><div className="data-page-inner">
    <div className="data-nav"><Link href="/">← 스토리보드</Link><Link href="/review">검토 큐 →</Link></div>
    <h1 className="data-title">수집원 상태</h1>
    <p className="data-lead">원문 우선 수집 루트와 발견 전용 경로를 분리해 관리합니다. 외부 키가 없거나 endpoint가 허용 목록 밖이면 차단 상태로 남깁니다.</p>
    <section className="data-panel"><h2>EP001 한국 맥락 자료 route registry</h2>
      <p>한국 기관·업무·생활 일반 맥락 B-roll을 국내 공식·공공·국내 라이선스 route부터 찾습니다. 아래 상태는 수집 준비도일 뿐, 권리·의미 검토 또는 production 승인이 아닙니다.</p>
      <table className="data-table"><thead><tr><th>우선</th><th>route</th><th>상태·권리</th><th>안전한 실행</th></tr></thead><tbody>
        {koreanRoutes.map((route) => <tr key={route.id}><td>{route.priority}</td><td><strong>{route.label}</strong><br /><small>{route.semanticRole}</small></td><td><span className={`status-pill ${route.status === 'live-operational' ? '' : 'warn'}`}>{route.status}</span><br /><small>{route.rights}</small>{route.blocker && <><br /><small>{route.blocker}</small></>}</td><td><div className="data-actions">
          <form action={runEp001KoreanRouteAction}><input type="hidden" name="routeId" value={route.id} /><input type="hidden" name="mode" value="dry-run" /><button type="submit">dry-run</button></form>
          {route.modes.includes('search') && <form action={runEp001KoreanRouteAction}><input type="hidden" name="routeId" value={route.id} /><input type="hidden" name="mode" value="search" /><button type="submit">검색 준비도</button></form>}
          {route.modes.includes('acquire') && <form action={runEp001KoreanRouteAction}><input type="hidden" name="routeId" value={route.id} /><input type="hidden" name="mode" value="acquire" /><button className="primary" type="submit">제한 수집</button></form>}
          {route.modes.includes('manual-registration') && <form action={runEp001KoreanRouteAction}><input type="hidden" name="routeId" value={route.id} /><input type="hidden" name="mode" value="manual-registration" /><button type="submit">수동 등록 template</button></form>}
        </div></td></tr>)}
      </tbody></table>
    </section>
    <section className="data-panel"><table className="data-table"><thead><tr><th>수집원</th><th>신뢰 등급</th><th>역할</th><th>최근 실행</th><th>작업</th></tr></thead><tbody>
      {sources.map((source) => <tr key={source.slug}>
        <td><strong>{source.name}</strong><br /><small>{source.base_url}</small></td>
        <td><span className="status-pill">T{source.trust_tier}</span></td>
        <td>{source.discovery_only ? <span className="status-pill discovery">탐색 전용</span> : <span className="status-pill">원문 수집</span>}<br /><small>{source.license_notes}</small></td>
        <td>{source.last_run ? <><span className={`status-pill ${source.last_run.status === 'blocked' || source.last_run.status === 'partial' ? 'warn' : ''}`}>{source.last_run.status}</span><br /><small>{source.last_run.error ?? `${source.last_run.rows_staged}건 staged`}</small></> : <small>아직 실행 없음</small>}</td>
        <td><div className="data-actions">
          {source.slug === 'assembly-bills-live' && <form action={runAssemblyBillsCollectionAction}><button className="primary" type="submit">최근 의안 수집</button></form>}
          {source.slug === 'lawmaking' && <form action={runPolicyCollectionAction}><button className="primary" type="submit">공식 정책 수집</button></form>}
          {source.slug === 'epeople-complaints' && <form action={runComplaintCollectionAction}><button className="primary" type="submit">민원 신호 수집</button></form>}
          {source.slug === 'assembly-members' && <form action={runAssemblyRosterSyncAction}><button className="primary" type="submit">현직 후보 동기화</button></form>}
          {source.slug === 'assembly-media' && <form action={runAssemblyMediaBatchAction}><button className="primary" type="submit">사진 10명 수집</button></form>}
          {source.slug === 'pilot-nam-insun' && <form action={runNamInsunPilotAction}><button className="primary" type="submit">남인순 파일럿 수집·구성</button></form>}
          {source.slug === 'pexels-media' && <><form action={runPexelsPhotoBatchAction}><button className="primary" type="submit">사진 3건 수집</button></form><form action={runPexelsVideoBatchAction}><button className="primary" type="submit">영상 2건 수집</button></form></>}
          {source.slug === 'wikimedia-commons' && <><form action={runWikimediaBatchAction}><button className="primary" type="submit">Commons 사진 2건</button></form><form action={runWikimediaVideoBatchAction}><button className="primary" type="submit">Commons 영상 1건</button></form></>}
          {source.slug === 'nasa-images' && <><form action={runNasaBatchAction}><button className="primary" type="submit">NASA 사진 2건</button></form><form action={runNasaVideoBatchAction}><button className="primary" type="submit">NASA 영상 1건</button></form></>}
          {source.slug === 'loc-media' && <><form action={runLocBatchAction}><button className="primary" type="submit">LOC 사진 2건</button></form><form action={runLocVideoBatchAction}><button className="primary" type="submit">LOC 영상 1건</button></form></>}
          {source.slug === 'kogl-media' && <><form action={runKoglPhotoBatchAction}><button className="primary" type="submit">KOGL 사진 1건</button></form><form action={runKoglVideoBatchAction}><button className="primary" type="submit">KOGL 영상 1건</button></form></>}
          {source.slug === 'digital-culture-api' && <form action={runDigitalCultureBatchAction}><button className="primary" type="submit">디지털문화 메타 10건</button></form>}
          {source.slug === 'assembly-minutes' && <><form action={runAssemblyPlenaryMinutesBatchAction}><button className="primary" type="submit">최근 본회의 회의록 1건</button></form><form action={runAssemblyCommitteeMinutesBatchAction}><button className="primary" type="submit">최근 위원회 회의록 1건</button></form></>}
          <form action={runSourceDryRunAction}><input type="hidden" name="slug" value={source.slug} /><button type="submit">차단 실행 기록</button></form>
        </div></td>
      </tr>)}
    </tbody></table></section>
    <section className="data-panel"><h2>키와 판정 규칙</h2>
      <p>국회 최근 의안 수집은 `ASSEMBLY_API_KEY`, 정책 수집은 `LAWMAKING_OC`, 민원 수집은 `DATA_GO_KR_SERVICE_KEY`가 없으면 호출하지 않고 blocked로 기록합니다. Pexels는 `PEXELS_API_KEY`를 우선 읽고, 로컬 호환용 `pixel.txt`를 보조로 사용합니다. Wikimedia Commons·NASA·Library of Congress는 키 없이 제한된 배치로 검색합니다. 키는 URL·오류·메타데이터에 저장하지 않습니다.</p>
      <p>정책·민원·의안·미디어 수집 결과는 모두 staged/review 상태입니다. Commons·NASA·LOC 자료도 자동으로 퍼블릭 도메인으로 확정하지 않으며, 파일별 라이선스·Rights and Access·제3자·초상·상표 조건을 공개 전 확인해야 합니다. KOGL CSV 자료는 파일별 공공누리 유형을 자동 확정하지 않고 상세 페이지 확인 대기 상태로 둡니다.</p>
    </section>
  </div></main>;
}
