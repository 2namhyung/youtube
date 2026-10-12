import Link from 'next/link';
import { reviewQueueForm } from '@/app/actions';
import { getReviewQueue } from '@/lib/graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function ReviewPage() {
  const queue = getReviewQueue('pending');
  return <main className="data-page"><div className="data-page-inner">
    <div className="data-nav"><Link href="/">← 스토리보드</Link><Link href="/sources">수집원 상태 →</Link></div>
    <h1 className="data-title">검토 큐</h1>
    <p className="data-lead">자동 수집 결과는 여기서 보류·승인·반려를 선택해야 영상용 사실이나 시각 자료로 사용할 수 있습니다.</p>
    <section className="data-panel"><h2>대기 중인 항목 {queue.length}건</h2>{queue.length ? <div className="path-list">{queue.map((item) => {
      const media = item.entity_type === 'media_asset';
      return <article className="path-card" key={item.id}>
        <strong>{media ? `${item.media_title ?? '수집 미디어'} · ${item.media_type ?? '형식 미확인'} #${item.entity_id}` : `${item.entity_type} #${item.entity_id}`}</strong>
        {media
          ? <><small>라이선스: {item.media_license ?? '확인 필요'} · 크레딧: {item.media_attribution ?? '없음'}</small><small>SHA-256 {item.media_hash ?? '없음'} · 로컬 파일 {item.media_path ?? '없음'}</small>{item.media_url ? <small><a href={item.media_url} target="_blank" rel="noreferrer">미디어 원본 열기 ↗</a></small> : null}</>
          : <><small>{item.person_name ?? '인물 미확정'} · NAAS_CD {item.naas_cd ?? '미확정'} · {item.party ?? '정당 미확정'} · {item.district ?? '선거구 미확정'} · {item.assembly_term ? `${item.assembly_term}대 후보` : ''}</small><small>출처: {item.evidence_title ?? '원문 provenance 없음'} · 수집원 {item.evidence_source_name ?? '미등록'} · SHA-256 {item.evidence_hash ?? '없음'} · 수집 {item.evidence_retrieved_at ?? '미확인'}</small>{item.evidence_url ? <small><a href={item.evidence_url} target="_blank" rel="noreferrer">원문 열기 ↗</a></small> : item.evidence_raw_path ? <small>원문 파일: {item.evidence_raw_path}</small> : null}</>}
        <form className="note-form" action={reviewQueueForm}><input type="hidden" name="id" value={item.id} /><input name="note" placeholder={media ? '권리·출처·허용 사용 범위 검토 메모(승인 시 필수)' : '판정 근거·대조한 출처 메모'} maxLength={2000} /><div className="review-actions"><button name="state" value="approved" type="submit">승인</button><button name="state" value="hold" type="submit">보류</button><button name="state" value="rejected" type="submit">반려</button></div></form>
      </article>;
    })}</div> : <p>검토 대기 항목이 없습니다.</p>}</section>
    <section className="data-panel"><h2>검토 상태의 의미</h2><p>승인은 공식 원문 또는 미디어의 URL·권리·크레딧·로컬 해시와 허용 사용 범위가 확인된 항목에만 사용합니다. 보류는 추가 대조가 필요한 항목이고, 반려는 영상 소재로 쓰지 않습니다.</p></section>
  </div></main>;
}
