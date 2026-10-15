import {claimJob,executeClaim,executeDiagnosticClaim,executeCanonicalClaim,executeEpisodeClaim,executeAudioAssemblyClaim,executeFinalizationClaim,failUnclaimableJob,nextQueuedJobId} from './core/jobs.ts';
import {StoreError} from './core/store.ts';
import {executeAIAnalysisClaim} from './core/ai-analysis-job.ts';

async function runOne(id:string,draining=false):Promise<void> {
  let claim;
  try{claim=claimJob(id);}
  catch(error){
    if(error instanceof StoreError&&error.status===422){
      // A corrupt queued snapshot must not prevent the next queued job from running.
      failUnclaimableJob(id,error);return;
    }
    if(error instanceof StoreError&&error.status===409)return; // Another worker won the claim.
    throw error;
  }
  if(!draining&&process.send&&process.connected)process.send({type:'claimed',jobId:id},()=>{
    // The API may have disconnected after a startup timeout; execution still owns the claim.
  });
  try{if(claim.job.kind==='ai-script-analysis')await executeAIAnalysisClaim(id,claim.token,claim.snapshot,{enabled:process.env.VISUALMAKER_AI_ENABLED,cliPath:process.env.VISUALMAKER_CODEX_CLI_PATH,modelId:process.env.VISUALMAKER_AI_MODEL});else if(claim.job.kind==='renderer-diagnostic')await executeDiagnosticClaim(id,claim.token,claim.snapshot);else if(claim.job.kind==='canonical-cut-preview')await executeCanonicalClaim(id,claim.token,claim.snapshot);else if(claim.job.kind==='episode-provisional-video')await executeEpisodeClaim(id,claim.token,claim.snapshot);else if(claim.job.kind==='audio-timed-assembly')await executeAudioAssemblyClaim(id,claim.token,claim.snapshot);else if(claim.job.kind==='episode-finalization-export')await executeFinalizationClaim(id,claim.token,claim.snapshot);else executeClaim(id,claim.token,claim.snapshot);}
  catch(error){if(!draining)throw error;}
}

async function main():Promise<void> {
  const [mode,id,...extra]=process.argv.slice(2);
  if(extra.length||!['--job','--drain'].includes(mode)||mode==='--job'&&!id||mode==='--drain'&&id)throw new Error('Usage: worker.ts --job <job-id> | --drain');
  if(mode==='--job'){await runOne(id);return;}
  for(;;){const queued=nextQueuedJobId();if(!queued)break;await runOne(queued,true);}
}

main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
