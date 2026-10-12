import path from 'node:path';

export function buildImagegenInvocation({ executable, fixedArgs = [], requestPath, outputDir }) {
  if (!path.isAbsolute(executable) || !path.isAbsolute(requestPath) || !path.isAbsolute(outputDir)) throw new Error('ImageGen invocation paths must be absolute');
  if (!Array.isArray(fixedArgs) || fixedArgs.some((value) => typeof value !== 'string' || value.includes('\0'))) throw new Error('ImageGen fixed arguments are invalid');
  return { executable, args: [...fixedArgs, '--request', requestPath, '--output-dir', outputDir], cwd: outputDir };
}
