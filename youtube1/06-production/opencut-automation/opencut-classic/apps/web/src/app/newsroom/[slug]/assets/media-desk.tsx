"use client";
/* eslint-disable opencut/prefer-object-params, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @next/next/no-img-element */

import { useEffect, useState } from "react";

type Verdict = "usable" | "conditional" | "not_usable";
type Evidence = {
  license?: string;
  embeddable?: boolean;
  officialUploader?: boolean;
  uploaderChannel?: string;
  source?: string;
  checkedAt?: string;
  licenseSnapshot?: { license?: string; embeddable?: boolean; fetchedAt?: string };
};
type RightsReview = {
  status?: "completed" | "unverified";
  verdict?: Verdict;
  evidence?: Evidence;
  restrictions?: string[];
  attribution?: string;
  recommended?: boolean;
  reviewedAt?: string;
  disclaimer?: string;
};
type Candidate = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail?: string | null;
  url: string;
  duration?: string | null;
  license?: string;
  reviewStatus?: string;
  rightsWarning?: string;
  licenseSnapshot?: Evidence["licenseSnapshot"];
  rightsReview?: RightsReview | string;
};
type State = {
  candidates?: Candidate[];
  clips?: Array<{ path: string; startSeconds: number; endSeconds: number }>;
  status?: string;
  reason?: string;
  bgm?: { status?: string; reason?: string };
  sources?: Array<{ sourcePath?: string; contactSheetPath?: string; durationSeconds?: number; sha256?: string }>;
};

const OFFICIAL_KCTV_SOURCE: Record<string, { articleUrl: string; sourceUrl: string }> = {
  "0l7AwfBJWBE": { articleUrl: "https://www.kctvjeju.com/news/view.kctv?article=k244113", sourceUrl: "https://vod.kctvjeju.com/vclip/260616clip_01.mp4/playlist.m3u8" },
};

const REVIEW_COPY: Record<Verdict, { label: string; color: string; background: string }> = {
  usable: { label: "사용 가능", color: "#8ef0c4", background: "rgba(34,197,94,.15)" },
  conditional: { label: "조건부", color: "#ffd166", background: "rgba(245,158,11,.18)" },
  not_usable: { label: "사용 불가", color: "#ff9c9c", background: "rgba(239,68,68,.16)" },
};

const defaultRestrictions = ["원본 설명·썸네일·음원을 함께 재사용하지 않기", "최종 송출 전 편집본과 출처 표기를 다시 확인"];

function reviewOf(candidate: Candidate): RightsReview | null {
  return candidate.rightsReview && typeof candidate.rightsReview === "object" ? candidate.rightsReview : null;
}

function checkedAt(candidate: Candidate, review: RightsReview | null) {
  return review?.evidence?.checkedAt || review?.evidence?.licenseSnapshot?.fetchedAt || candidate.licenseSnapshot?.fetchedAt || candidate.reviewStatus;
}

function formatDate(value?: string) {
  if (!value || !value.includes("T")) return value || "확인 시각 미상";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function MediaDesk({ slug }: { slug: string }) {
  const [query, setQuery] = useState("제주 초등학교 교실 침입 CCTV");
  const [sourcePath, setSourcePath] = useState("");
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("8");
  const [attested, setAttested] = useState(false);
  const [state, setState] = useState<State>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const response = await fetch(`/api/newsroom/projects/${slug}/media`, { cache: "no-store" });
    if (response.ok) setState(await response.json());
  };
  useEffect(() => { void refresh(); }, []);

  const search = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/newsroom/projects/${slug}/media`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "search", query }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setState(body); if (body.status === "unavailable") setMessage(body.reason);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };

  const review = async (candidate: Candidate, verdict: Verdict = "conditional") => {
    setBusy(true); setMessage("");
    const existing = reviewOf(candidate);
    const reviewPayload: RightsReview = {
      status: "completed", verdict,
      evidence: { license: candidate.license || "creativeCommon", embeddable: candidate.licenseSnapshot?.embeddable ?? true, officialUploader: candidate.channelTitle.includes("KCTV"), uploaderChannel: candidate.channelTitle, source: "YouTube Data API v3 (search.list + videos.list)", checkedAt: checkedAt(candidate, existing), licenseSnapshot: candidate.licenseSnapshot },
      restrictions: existing?.restrictions || defaultRestrictions,
      attribution: existing?.attribution || `출처: ${candidate.channelTitle}, 「${candidate.title}」, YouTube CC BY. ${candidate.url}`,
      recommended: existing?.recommended,
      disclaimer: "CC BY 표기와 업로더 확인은 현재 시점의 편집 검토 기록이며, 법적 권리 보장을 의미하지 않습니다.",
    };
    try {
      const response = await fetch(`/api/newsroom/projects/${slug}/media`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "review", videoId: candidate.videoId, verdict, evidence: reviewPayload.evidence, restrictions: reviewPayload.restrictions, attribution: reviewPayload.attribution, recommended: reviewPayload.recommended }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setState(body); setMessage("권리 검토 기록을 저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };

  const extractClip = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/newsroom/projects/${slug}/media`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clip", sourcePath, startSeconds: Number(startSeconds), endSeconds: Number(endSeconds), rightsAttested: attested }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setState(body); setMessage("권리 확인된 로컬 클립을 저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };

  const ingestOfficial = async (candidate: Candidate) => {
    const source = OFFICIAL_KCTV_SOURCE[candidate.videoId];
    if (!source) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/newsroom/projects/${slug}/media`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "official-ingest", videoId: candidate.videoId, ...source }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setState(body); setMessage("공식 원본 가져오기와 콘택트시트 생성을 완료했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };

  const candidates = state.candidates || [];
  const completed = candidates.filter((candidate) => reviewOf(candidate)?.status === "completed");
  return <section style={{ marginTop: 28, padding: "26px 28px 30px", border: "1px solid rgba(148,163,184,.22)", borderRadius: 20, background: "linear-gradient(145deg, rgba(12,26,43,.96), rgba(8,16,29,.92))", color: "#f8fafc", boxShadow: "0 22px 60px rgba(2,8,23,.24)" }}>
    {(() => { const official = candidates.find((candidate) => OFFICIAL_KCTV_SOURCE[candidate.videoId] && reviewOf(candidate)?.status === "completed" && reviewOf(candidate)?.verdict !== "not_usable"); return official ? <button onClick={() => void ingestOfficial(official)} disabled={busy} style={{ float: "right", padding: "8px 12px", borderRadius: 9, border: "1px solid #38bdf8", background: "rgba(14,116,144,.22)", color: "#bae6fd", fontSize: 12, fontWeight: 800 }}>공식 원본 가져오기</button> : null; })()}
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
      <div><p style={{ margin: 0, color: "#f59e0b", letterSpacing: ".18em", fontSize: 11, fontWeight: 700 }}>NEWSROOM / RIGHTS DESK</p><h2 style={{ margin: "8px 0 4px", fontSize: 25, letterSpacing: "-.03em" }}>유튜브 CC 후보 검토 보드</h2><p style={{ margin: 0, color: "#a8b5c5", fontSize: 13 }}>KCTV 제주방송 후보를 장면 단위로 확인하고, 출처·제한 조건을 편집 기록에 남깁니다.</p></div>
      <div style={{ padding: "10px 14px", borderRadius: 999, border: "1px solid rgba(142,240,196,.3)", background: "rgba(34,197,94,.1)", color: "#8ef0c4", fontSize: 12, fontWeight: 700 }}>{completed.length}/{candidates.length || 2}건 검토 완료</div>
    </div>
    <div style={{ display: "flex", gap: 8, margin: "20px 0 14px" }}><input aria-label="YouTube CC 검색어" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: 1, minWidth: 200, padding: "11px 13px", borderRadius: 10, border: "1px solid #334155", background: "#0b1728", color: "white" }} /><button onClick={() => void search()} disabled={busy} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid #f59e0b", background: "#f59e0b", color: "#111827", fontWeight: 800 }}>{busy ? "검색 중…" : "CC 후보 다시 검색"}</button></div>
    {message && <p role="status" style={{ margin: "8px 0 12px", color: "#ffd166", fontSize: 13 }}>{message}</p>}
    <p style={{ margin: "0 0 18px", padding: "12px 14px", borderLeft: "3px solid #f59e0b", background: "rgba(245,158,11,.08)", color: "#d8dee8", fontSize: 12, lineHeight: 1.6 }}>검토 완료는 YouTube의 CC BY·임베드·채널 표기를 확인했다는 뜻입니다. 업로더의 모든 권리나 제3자 초상·음성 권리를 보장하지 않으므로, 아래 제한 조건을 지켜 사용하세요.</p>
    <div style={{ display: "grid", gap: 14 }}>{candidates.map((candidate, index) => { const reviewData = reviewOf(candidate); const verdict = reviewData?.verdict || "conditional"; const verdictCopy = REVIEW_COPY[verdict]; const restrictions = reviewData?.restrictions || ["검토 전: 장면·출처·인물 권리를 별도 확인"]; return <article key={candidate.videoId} style={{ overflow: "hidden", border: `1px solid ${reviewData?.status === "completed" ? "rgba(245,158,11,.42)" : "rgba(148,163,184,.2)"}`, borderRadius: 16, background: reviewData?.status === "completed" ? "rgba(15,31,48,.92)" : "rgba(15,23,42,.68)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 200px) 1fr", gap: 16, padding: 16 }}>
        {candidate.thumbnail ? <img src={candidate.thumbnail} alt="" width={200} height={112} style={{ width: "100%", height: 112, objectFit: "cover", borderRadius: 10, background: "#111827" }} /> : <div style={{ width: "100%", height: 112, borderRadius: 10, background: "#111827" }} />}
        <div><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: "#94a3b8", fontSize: 11, letterSpacing: ".1em" }}>CANDIDATE {index + 1}</span>{reviewData?.recommended && <span style={{ padding: "4px 8px", borderRadius: 999, background: "rgba(142,240,196,.14)", color: "#8ef0c4", fontSize: 11, fontWeight: 700 }}>추천</span>}<span style={{ padding: "5px 9px", borderRadius: 999, background: verdictCopy.background, color: verdictCopy.color, fontSize: 11, fontWeight: 800 }}>{reviewData?.status === "completed" ? "✓ 검토 완료 · " : "검토 필요 · "}{verdictCopy.label}</span></div><h3 style={{ margin: "9px 0 4px", fontSize: 17, lineHeight: 1.35 }}>{candidate.title}</h3><p style={{ margin: 0, color: "#a8b5c5", fontSize: 13 }}>{candidate.channelTitle} · {candidate.duration || "길이 확인 필요"} · <a href={candidate.url} target="_blank" rel="noreferrer" style={{ color: "#7dd3fc" }}>YouTube 원본 열기 ↗</a></p></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, padding: "0 16px 14px" }}>{[["라이선스", reviewData?.evidence?.license === "creativeCommon" || candidate.license === "creativeCommon" ? "CC BY 스냅샷" : "확인 필요"], ["임베드", reviewData?.evidence?.embeddable ?? candidate.licenseSnapshot?.embeddable ? "허용" : "미확인"], ["업로더", reviewData?.evidence?.officialUploader ? "KCTV 공식 채널 표기" : candidate.channelTitle], ["확인 시각", formatDate(checkedAt(candidate, reviewData))]].map(([label, value]) => <div key={label} style={{ padding: "10px 11px", borderRadius: 10, background: "rgba(2,8,23,.35)", border: "1px solid rgba(148,163,184,.12)" }}><div style={{ color: "#8190a4", fontSize: 10, letterSpacing: ".08em" }}>{label}</div><div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>{value}</div></div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: "0 16px 16px" }}><div><div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 800, letterSpacing: ".09em", marginBottom: 6 }}>사용 제한</div><ul style={{ margin: 0, paddingLeft: 18, color: "#d8dee8", fontSize: 12, lineHeight: 1.65 }}>{restrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}</ul></div><div><div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 800, letterSpacing: ".09em", marginBottom: 6 }}>크레딧 문안</div><p style={{ margin: 0, color: "#d8dee8", fontSize: 12, lineHeight: 1.6 }}>{reviewData?.attribution || "검토 저장 시 출처 문안이 생성됩니다."}</p></div></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 16px", borderTop: "1px solid rgba(148,163,184,.12)", background: "rgba(2,8,23,.24)" }}><small style={{ color: "#8190a4", lineHeight: 1.4 }}>{reviewData?.evidence?.source || candidate.rightsWarning || "YouTube 메타데이터 확인 전"}</small><button onClick={() => void review(candidate)} disabled={busy || reviewData?.status === "completed"} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid #64748b", background: reviewData?.status === "completed" ? "rgba(142,240,196,.1)" : "#1e293b", color: reviewData?.status === "completed" ? "#8ef0c4" : "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{reviewData?.status === "completed" ? "검토 기록 저장됨" : "조건부 사용으로 검토 저장"}</button></div>
    </article>; })}</div>
    {!!state.clips?.length && <p style={{ marginTop: 14, color: "#8ef0c4" }}>권리 확인된 로컬 클립 {state.clips.length}개가 OpenCut 인덱스에 저장되어 있습니다.</p>}
    <div style={{ marginTop: 22, paddingTop: 17, borderTop: "1px solid rgba(148,163,184,.14)" }}><p style={{ margin: 0, color: "#94a3b8", letterSpacing: ".12em", fontSize: 11 }}>AUTHORIZED LOCAL CLIP</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}><input value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} placeholder="workspace 로컬 파일 경로" style={{ flex: 1, minWidth: 260, padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#0b1728", color: "white" }} /><input value={startSeconds} onChange={(event) => setStartSeconds(event.target.value)} type="number" min="0" step="0.1" style={{ width: 72, padding: 10, borderRadius: 8, background: "#0b1728", color: "white" }} /><input value={endSeconds} onChange={(event) => setEndSeconds(event.target.value)} type="number" min="0.1" step="0.1" style={{ width: 72, padding: 10, borderRadius: 8, background: "#0b1728", color: "white" }} /><button onClick={() => void extractClip()} disabled={busy || !sourcePath || !attested}>클립 추출</button></div><label style={{ display: "block", marginTop: 8, color: "#cbd5e1", fontSize: 12 }}><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /> 이 로컬 파일의 사용 권한을 확인했습니다.</label></div>
  </section>;
}
