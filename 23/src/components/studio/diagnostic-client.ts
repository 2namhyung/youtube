export function isCurrentDiagnosticResponse(response:Response,scope:{projectId:string;jobId:string;attempt:number}):boolean{
  return response.ok&&response.headers.get('content-type')?.split(';')[0]==='video/mp4'&&
    response.headers.get('x-visualmaker-project-id')===scope.projectId&&
    response.headers.get('x-visualmaker-job-id')===scope.jobId&&
    response.headers.get('x-visualmaker-attempt')===String(scope.attempt);
}
