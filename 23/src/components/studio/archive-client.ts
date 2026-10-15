import type {Plan} from '../../../visualmaker/core/model';

export type ArchiveScope={projectId:string;revision:number;requirementId:string;scriptSha256:string};
export type ArchiveCandidate={archiveAssetId:number;title:string;provider:string;providerId:string;mediaType:'image'|'video'|null;
  sha256:string|null;bytes:number|null;mimeType:string;durationSeconds:number|null;itemUrl:string|null;creator:string;publisher:string;
  license:string;attribution:string;rightsStatus:string;retrievedAt:string;evidenceOnlyRequired:boolean;compatible:boolean;blockers:string[]};
export type ArchiveList={schemaVersion:string;scope:ArchiveScope;productionAuthority:false;availability:'available'|'unavailable';candidates:ArchiveCandidate[];nextCursor:string|null};
export type ArchiveImportResult={scope:ArchiveScope;archiveAssetId:number;inputSha256:string;assetId:string;
  metadataSha256:string;productionAuthority:false;plan:Plan};
export function sameArchiveScope(expected:ArchiveScope,actual:ArchiveScope){return expected.projectId===actual.projectId&&expected.revision===actual.revision&&
  expected.requirementId===actual.requirementId&&expected.scriptSha256===actual.scriptSha256;}
export function validArchiveList(value:ArchiveList,scope:ArchiveScope){return value.schemaVersion==='visualmaker-archive-candidates-v1'&&
  value.productionAuthority===false&&sameArchiveScope(scope,value.scope)&&['available','unavailable'].includes(value.availability)&&
  Array.isArray(value.candidates)&&value.candidates.length<=20;}
export function validArchiveImport(value:ArchiveImportResult,scope:ArchiveScope,assetId:number,sha256:string){
  const next=value.plan;
  return value.productionAuthority===false&&value.scope.projectId===scope.projectId&&value.scope.revision===scope.revision+1&&
    value.scope.requirementId===scope.requirementId&&value.scope.scriptSha256===scope.scriptSha256&&
    value.archiveAssetId===assetId&&value.inputSha256===sha256&&next.productionAuthority===false&&
    next.id===scope.projectId&&next.revision===scope.revision+1&&next.script.rawSha256===scope.scriptSha256&&
    /^[a-f0-9]{64}$/.test(value.metadataSha256)&&
    next.requirements.find(row=>row.id===scope.requirementId)?.assetId===value.assetId&&
    next.assets.some(asset=>asset.id===value.assetId&&asset.sha256===sha256&&asset.status==='pending-review');
}
