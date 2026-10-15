/** A local configuration check only. It never contacts the model provider. */
import {resolveCodexCli} from './ai-codex-cli.ts';

export type AIConnectionConfig={enabled:string|undefined;cliPath?:string|undefined;modelId?:string|undefined;apiKey?:string|undefined};

const MODEL=/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/iu;

export function aiConnectionStatus(config:AIConnectionConfig){
  const checks={
    enabled:config.enabled==='1',
    cliAvailable:resolveCodexCli(config.cliPath)!==null,
    modelConfigured:config.modelId===undefined||config.modelId===''||typeof config.modelId==='string'&&config.modelId.length<=160&&MODEL.test(config.modelId)&&config.modelId.startsWith('codex/')
  };
  return {
    schemaVersion:'visualmaker-ai-connection-v2' as const,
    provider:'codex-cli' as const,
    checks,
    ready:checks.enabled&&checks.cliAvailable&&checks.modelConfigured,
    providerVerified:false as const,
    productionAuthority:false as const,
    externalCalls:0 as const
  };
}
