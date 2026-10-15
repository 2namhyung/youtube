import {boundedAIJson} from './ai-analysis-client.ts';

export type AIConnectionStatus={
  schemaVersion:'visualmaker-ai-connection-v2';
  provider:'codex-cli';
  checks:{enabled:boolean;cliAvailable:boolean;modelConfigured:boolean};
  ready:boolean;
  providerVerified:false;
  productionAuthority:false;
  externalCalls:0;
};

const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

export function validateAIConnectionStatus(value:unknown):AIConnectionStatus|null{
  if(!exact(value,['schemaVersion','provider','checks','ready','providerVerified','productionAuthority','externalCalls'])||
    value.schemaVersion!=='visualmaker-ai-connection-v2'||value.provider!=='codex-cli'||
    !exact(value.checks,['enabled','cliAvailable','modelConfigured'])||
    typeof value.checks.enabled!=='boolean'||typeof value.checks.cliAvailable!=='boolean'||
    typeof value.checks.modelConfigured!=='boolean'||typeof value.ready!=='boolean'||
    value.ready!==(value.checks.enabled&&value.checks.cliAvailable&&value.checks.modelConfigured)||
    value.providerVerified!==false||value.productionAuthority!==false||value.externalCalls!==0)return null;
  return value as AIConnectionStatus;
}

export async function readAIConnectionStatus(token:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<AIConnectionStatus>{
  if(!token||signal.aborted)throw new Error('AI 설정 상태를 확인하지 못했습니다.');
  try{
    const response=await fetcher('/api/studio/ai-connection',{
      method:'GET',headers:{'x-visualmaker-token':token},cache:'no-store',signal
    });
    if(response.status!==200||response.headers.get('x-content-type-options')!=='nosniff')
      throw new Error('Invalid response');
    const status=validateAIConnectionStatus(await boundedAIJson(response,1024,signal));
    if(!status)throw new Error('Invalid status');
    return status;
  }catch{
    throw new Error('AI 설정 상태를 확인하지 못했습니다. 서버 설정과 접속 상태를 확인한 뒤 다시 시도하세요.');
  }
}
