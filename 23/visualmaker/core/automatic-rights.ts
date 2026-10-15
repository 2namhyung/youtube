import {randomUUID} from 'node:crypto';
import type {Asset,Plan,Requirement} from './model.ts';
import {reviewContext} from './source-review.ts';

export type WikimediaRightsEvidence={provider:'wikimedia';providerId:string;itemUrl:string;metadataSha256:string;
  licenseLabel:string;licenseUrl:string;licenseCode:string;creator:string;artistRaw:string;usageTerms:string;retrievedAt:string;
  selectionSha256:string;downloadSha256:string};
export type YouTubeRightsEvidence={provider:'youtube';providerId:string;itemUrl:string;metadataSha256:string;
  selectionSha256:string;downloadSha256:string;licenseLabel:string;creator:string;channelId:string;retrievedAt:string};
export type RightsEvidence=WikimediaRightsEvidence;
export type RightsPolicy={license:'CC0 1.0'|'Public Domain Mark 1.0'|'CC BY 2.0'|'CC BY 2.5'|'CC BY 3.0'|'CC BY 4.0'|'YouTube CC BY (version unspecified)';
  evidence:WikimediaRightsEvidence|YouTubeRightsEvidence};
const issued=new WeakSet<object>();
type CommonsLicense=Exclude<RightsPolicy['license'],'YouTube CC BY (version unspecified)'>;
const licenses=new Map<string,CommonsLicense>([
  ['https://creativecommons.org/publicdomain/zero/1.0/','CC0 1.0'],
  ['https://creativecommons.org/publicdomain/mark/1.0/','Public Domain Mark 1.0'],
  ...(['2.0','2.5','3.0','4.0'] as const).map(version=>[`https://creativecommons.org/licenses/by/${version}/`,`CC BY ${version}`] as const),
]);
const labels:Record<CommonsLicense,readonly string[]>={
  'CC0 1.0':['CC0 1.0','CC0'],
  'Public Domain Mark 1.0':['Public Domain Mark 1.0','Public Domain Mark'],
  'CC BY 2.0':['CC BY 2.0'], 'CC BY 2.5':['CC BY 2.5'],
  'CC BY 3.0':['CC BY 3.0'], 'CC BY 4.0':['CC BY 4.0'],
};
const codes:Record<CommonsLicense,readonly string[]>={
  'CC0 1.0':['cc-zero','cc0'],
  'Public Domain Mark 1.0':['pd','pdm','cc-pd-mark'],
  'CC BY 2.0':['cc-by-2.0'], 'CC BY 2.5':['cc-by-2.5'],
  'CC BY 3.0':['cc-by-3.0'], 'CC BY 4.0':['cc-by-4.0'],
};
const usage:Record<CommonsLicense,readonly string[]>={
  'CC0 1.0':['','CC0 1.0','Public domain'],
  'Public Domain Mark 1.0':['','Public Domain Mark 1.0','Public domain'],
  'CC BY 2.0':['','CC BY 2.0','Attribution','Creative Commons Attribution 2.0'],
  'CC BY 2.5':['','CC BY 2.5','Attribution','Creative Commons Attribution 2.5'],
  'CC BY 3.0':['','CC BY 3.0','Attribution','Creative Commons Attribution 3.0'],
  'CC BY 4.0':['','CC BY 4.0','Attribution','Creative Commons Attribution 4.0'],
};
const artistText=(value:string)=>value.replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim().slice(0,500);
/** Only the live provider adapter calls this with freshly observed private metadata. */
export function issueRightsPolicy(evidence:WikimediaRightsEvidence):RightsPolicy|null{
  if(evidence.provider!=='wikimedia'||!/^https:\/\/commons\.wikimedia\.org\/wiki\/File%3A/i.test(evidence.itemUrl)||
    !/^[a-f0-9]{64}$/.test(evidence.metadataSha256)||!/^[a-f0-9]{64}$/.test(evidence.selectionSha256)||
    !/^[a-f0-9]{64}$/.test(evidence.downloadSha256)||!evidence.providerId||!evidence.retrievedAt||
    evidence.artistRaw.length>5000||/<\s*(script|style|iframe|object|svg|img)\b/i.test(evidence.artistRaw)||
    artistText(evidence.artistRaw)!==evidence.creator||
    /[\u0000-\u001f\u007f]/.test(evidence.licenseLabel+evidence.licenseUrl+evidence.licenseCode+evidence.usageTerms))return null;
  // Exact canonical URL, host and version. Reject query, fragments, localized or composite licenses.
  const license=licenses.get(evidence.licenseUrl);
  if(!license||!labels[license].includes(evidence.licenseLabel)||!usage[license].includes(evidence.usageTerms)||
    (evidence.licenseCode!==''&&!codes[license].includes(evidence.licenseCode))||
    (license.startsWith('CC BY')&&!evidence.creator.trim()))return null;
  const result:RightsPolicy={license,evidence:{...evidence}};
  issued.add(result);return result;
}

export function issueYouTubeRightsPolicy(evidence:YouTubeRightsEvidence):RightsPolicy|null{
  if(evidence.provider!=='youtube'||!/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(evidence.itemUrl)||
    evidence.providerId!==new URL(evidence.itemUrl).searchParams.get('v')||
    evidence.licenseLabel!=='Creative Commons Attribution license (reuse allowed)'||
    !evidence.creator.trim()||evidence.creator.length>500||!evidence.channelId.trim()||evidence.channelId.length>200||
    !/^[a-f0-9]{64}$/.test(evidence.metadataSha256)||!/^[a-f0-9]{64}$/.test(evidence.selectionSha256)||
    !/^[a-f0-9]{64}$/.test(evidence.downloadSha256)||!evidence.retrievedAt||
    /[\u0000-\u001f\u007f]/.test(evidence.creator+evidence.channelId+evidence.retrievedAt))return null;
  const result:RightsPolicy={license:'YouTube CC BY (version unspecified)',evidence:{...evidence}};
  issued.add(result);return result;
}

/** Called within the same BEGIN IMMEDIATE transaction that attaches asset bytes. */
export function applyAutomaticRights(plan:Plan,requirement:Requirement,asset:Asset,policy:RightsPolicy|null):boolean{
  if(!policy||!issued.has(policy)||asset.mediaType==='data'||asset.sha256!==policy.evidence.downloadSha256||
    asset.sourceUrl!==policy.evidence.itemUrl||requirement.assetId!==asset.id)return false;
  const contextSha256=reviewContext(plan,requirement);
  if((plan.sourceReviews??[]).some(row=>row.requirementId===requirement.id&&row.dimension==='rights'&&
    row.assetSha256===asset.sha256&&
    (row.recordedBy==='local-session'&&row.decision==='rejected'||row.contextSha256===contextSha256&&row.decision==='acceptable')))return false;
  const evidence=policy.evidence;
  const attribution=evidence.provider==='youtube'?`표기 의무: ${evidence.creator}; YouTube CC BY 버전 미표기; 원본 ${evidence.itemUrl}. 게시 시 실제 크레딧 확인 필요.`:
    policy.license.startsWith('CC BY')?`표기 의무: ${evidence.creator}; 라이선스 ${evidence.licenseUrl}; 원본 ${evidence.itemUrl}. 게시 시 실제 크레딧 확인 필요.`:
    `원본 ${evidence.itemUrl}; 제작자 표기 ${evidence.creator||'미기록'}.`;
  const fullRationale=`제공처 메타데이터 기반 자동 사용 조건 관찰: ${policy.license} (${evidence.licenseLabel}); ${attribution} 메타데이터 SHA-256 ${evidence.metadataSha256}; 선택 SHA-256 ${evidence.selectionSha256}. 제3자 권리·출처·의미·제작 승인 별도.`;
  // Long source URLs and attribution remain intact in the asset and receipt; a review row is capped at 2,000 characters.
  const rationale=fullRationale.length<=2000?fullRationale:
    `제공처 메타데이터 기반 자동 사용 조건 관찰: ${policy.license}; 크레딧·라이선스 링크·원본 전체는 receipts/${asset.id}.json의 automaticRightsPolicy.evidence와 해당 자료의 creator/sourceUrl 참조. 메타데이터 SHA-256 ${evidence.metadataSha256}; 선택 SHA-256 ${evidence.selectionSha256}. 게시 크레딧·제3자 권리·출처·의미·제작 승인 별도.`;
  (plan.sourceReviews??=[]).push({id:`review_${randomUUID()}`,requirementId:requirement.id,assetId:asset.id,
    assetSha256:asset.sha256,contextSha256,dimension:'rights',decision:'acceptable',rationale,
    recordedAt:new Date().toISOString(),recordedBy:'provider-license-policy',productionAuthority:false});
  return true;
}
