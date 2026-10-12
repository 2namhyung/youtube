"""CLI for the current Luna task. No LLM, nested agent, or secret file reads."""
import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
import httpx


def main():
    parser = argparse.ArgumentParser(description="Luna Studio current-task bridge")
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("projects")
    sub.add_parser("capabilities")
    create = sub.add_parser("create"); create.add_argument("name"); create.add_argument("--test", action="store_true")
    context = sub.add_parser("context"); context.add_argument("project_id")
    next_task = sub.add_parser("next"); next_task.add_argument("--project")
    run = sub.add_parser("stage"); run.add_argument("project_id"); run.add_argument("stage"); run.add_argument("--input", type=Path)
    get = sub.add_parser("job"); get.add_argument("job_id")
    submit = sub.add_parser("submit"); submit.add_argument("job_id"); submit.add_argument("file", type=Path)
    cancel = sub.add_parser("cancel"); cancel.add_argument("job_id")
    upload = sub.add_parser("upload"); upload.add_argument("file", type=Path)
    receipt = sub.add_parser("receipt"); receipt.add_argument("project_id"); receipt.add_argument("blob_id"); receipt.add_argument("--source", required=True); receipt.add_argument("--note", required=True); receipt.add_argument("--surface", choices=["chrome-use","computer-use","manual"], default="chrome-use")
    args = parser.parse_args()
    from urllib.parse import urlsplit
    parsed=urlsplit(args.url)
    if parsed.scheme!='http' or parsed.hostname not in {'127.0.0.1','localhost'} or parsed.username or parsed.password:
        parser.error("Only the loopback Studio server is supported")
    def read_input(path):
        if path.name.lower() in {'api.txt','pixel.txt','.env','auth.json','credentials.json'}:
            parser.error("Secret files cannot be read or uploaded")
        return json.loads(path.read_text(encoding='utf-8-sig'))
    with httpx.Client(base_url=args.url, timeout=60, trust_env=False) as client:
        session=client.get('/v1/session');session.raise_for_status()
        token=session.json()['token']
        def get(path):
            r=client.get(path);r.raise_for_status();return r.json()
        def post(path,body):
            r=client.post(path,json=body,headers={'X-Studio-Token':token,'Idempotency-Key':uuid.uuid4().hex});
            if not r.is_success:
                raise RuntimeError(r.text)
            return r.json()
        cmd=args.command
        if cmd=='projects': result=get('/v1/projects')
        elif cmd=='capabilities': result=get('/v1/capabilities')
        elif cmd=='create': result=post('/v1/projects',{'name':args.name,'mode':'synthetic-test' if args.test else 'production'})
        elif cmd=='context': result=get(f'/v1/projects/{args.project_id}')
        elif cmd=='job': result=get(f'/v1/jobs/{args.job_id}')
        elif cmd=='next':
            jobs=get('/v1/jobs'+(f'?project_id={args.project}' if args.project else ''))
            pending=next((j for j in reversed(jobs) if j['state']=='WAITING_INPUT'),None)
            result=get(f"/v1/jobs/{pending['id']}/packet") if pending else {'status':'NO_WAITING_INPUT'}
        elif cmd=='stage':
            p=get(f'/v1/projects/{args.project_id}')['project']
            result=post(f'/v1/projects/{args.project_id}/stages/{args.stage}',{'expected_revision':p['revision'],'payload':read_input(args.input) if args.input else {}})
        elif cmd=='submit':
            packet=get(f'/v1/jobs/{args.job_id}/packet')
            result=post(f'/v1/jobs/{args.job_id}/inputs',{'binding':packet['binding'],'result':read_input(args.file)})
        elif cmd=='cancel': result=post(f'/v1/jobs/{args.job_id}/cancel',{})
        elif cmd=='upload':
            if args.file.name.lower() in {'api.txt','pixel.txt','.env','auth.json','credentials.json'}: parser.error('Secret file denied')
            with args.file.open('rb') as f:
                r=client.post('/v1/uploads',files={'file':(args.file.name,f)},headers={'X-Studio-Token':token,'Idempotency-Key':uuid.uuid4().hex})
            if not r.is_success: raise RuntimeError(r.text)
            result=r.json()
        elif cmd=='receipt':
            result=post(f'/v1/projects/{args.project_id}/receipts',{'blob_id':args.blob_id,'url':args.source,
                        'observed_at':datetime.now(timezone.utc).isoformat(),'surface':args.surface,'note':args.note})
        print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':
    try: main()
    except Exception as e:
        print(str(e),file=sys.stderr)
        sys.exit(1)
