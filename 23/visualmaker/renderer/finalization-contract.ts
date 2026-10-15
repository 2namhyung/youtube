import type {AudioAssemblyReceipt} from './audio-assembly-contract.ts';

export const FINALIZATION_SCHEMA='visualmaker-post-lock-output-v1' as const;
export const FINALIZATION_FILES=['export.mp4','export.srt','export.vtt','export.png','export.json'] as const;
export type CaptionSegment={cut_id:string;start_frame:number;end_frame:number;char_start:number;char_end:number;text:string};
export type FinalizationMixStem={id:string;kind:'music'|'sfx';path:string;sha256:string;bytes:number;decoded_samples:number;start_sample:number;gain_db:number;source_url:string;creator:string;license:string;attribution:string;rights_evidence_path:string;rights_evidence_sha256:string};
export type FinalizationMixV2={mode:'fixed-gain-stems';sample_rate:48000;channels:2;duration_samples:number;voice_decoded_samples:number;voice_tail_discard_samples:number;stems:FinalizationMixStem[];approval_marker:string;approval_marker_sha256:string};
type FinalizationSelectionBase={
  final_script:{path:string;sha256:string};
  source:{job_id:string;attempt:number;artifact_sha256:string;receipt_sha256:string};
  picture_marker_sha256:string;
  captions:{segments:CaptionSegment[];approval_marker:string;approval_marker_sha256:string};
  thumbnail:{frame:number};
};
export type FinalizationSelection=(FinalizationSelectionBase&{version:1;mix:{mode:'passthrough'}})|(FinalizationSelectionBase&{version:2;mix:FinalizationMixV2});
export type FinalizationBinding={
  sourcePath:string;
  sourceSha256:string;
  sourceBytes:number;
  receiptSha256:string;
  receipt:AudioAssemblyReceipt;
  addendumPath:string;
  addendumSha256:string;
  preLockStateSha256:string;
  specSha256:string;
  stateSha256:string;
  scriptSha256:string;
  pictureMarkerSha256:string;
  captionMarkerSha256:string;
  captionContractSha256:string;
  mixPayloadSha256?:string;
  mixApprovalMarkerSha256?:string;
  mixRightsEvidence?:Array<{id:string;path:string;sha256:string}>;
  mixAuthorityPaths?:string[];
  selection:FinalizationSelection;
};
export type FinalizationReport={
  schemaVersion:typeof FINALIZATION_SCHEMA;
  episodeId:'episode-001';
  scope:{projectId:string;revision:number;scriptSha256:string;snapshotSha256:string};
  composition:{width:number;height:number;fps:number;durationFrames:number}|null;
  binding:FinalizationBinding|null;
  fingerprints:Record<string,string|null>;
  validators:Array<{name:string;passed:boolean}>;
  blockers:Array<{code:string;detail:string}>;
  renderEligible:boolean;
  productionAuthority:false;
  reviewApproved:false;
};
export type FinalizationExecutionContract={schemaVersion:'visualmaker-finalization-execution-v1'|'visualmaker-finalization-execution-v2';report:FinalizationReport;reportSha256:string};
export type FinalizationJobReceipt={
  schemaVersion:'visualmaker-finalization-job-receipt-v1'|'visualmaker-finalization-job-receipt-v2';artifactKind:'episode-finalization-export';episodeId:'episode-001';
  jobId:string;attempt:number;projectId:string;requestedRevision:number;snapshotSha256:string;executionContractSha256:string;
  source:{jobId:string;attempt:number;artifactSha256:string;receiptSha256:string};
  mixApproval?:{payloadSha256:string;markerSha256:string;rightsEvidence:Array<{id:string;path:string;sha256:string}>};
  technical:Record<string,unknown>;files:Array<{name:'export.mp4'|'export.srt'|'export.vtt'|'export.png';sha256:string;bytes:number}>;
  productionAuthority:false;reviewApproved:false;
};
export type FinalizationAudioPresentation={decodedSamples:number;presentedSamples:number;sampleRate:48000;channels:2;packetCount:number;firstPacketPts:number;primingSkipSamples:number;lastPacketDuration:number;containerDiscardPadding:number};
export type FinalizationMixMeasured={sourceVoice:FinalizationAudioPresentation&{sha256:string;tailDiscardSamples:number};mixer:{contractSha256:string;receiptSha256:string;outputSha256:string;sampleCount:number;peak:number;rms:number;clippingCount:number};encoded:FinalizationAudioPresentation&{sha256:string;bytes:number;packetSha256:string;decodedPcmSha256:string;peak:number;rms:number;clippingCount:number};outputAudio:FinalizationAudioPresentation&{packetSha256:string;decodedPcmSha256:string};sourceVideoPacketSha256:string};
export type FinalizationResult={
  files:Array<{name:typeof FINALIZATION_FILES[number];sha256:string;bytes:number}>;
  measured:{width:number;height:number;fps:number;frames:number;durationSeconds:number;videoPacketSha256:string;sourceVideoPacketSha256:string;frameSha256:[string,string,string];sourceFrameSha256:[string,string,string];thumbnailFrameSha256:string;sourceThumbnailFrameSha256:string;audioPacketSha256:string;sourceAudioPacketSha256:string;subtitleCount:number;subtitleText:string[];subtitleTimes:Array<{startMs:number;endMs:number}>};
  ffmpegVersion:string;
  mixMeasured?:FinalizationMixMeasured;
  productionAuthority:false;
  reviewApproved:false;
};
