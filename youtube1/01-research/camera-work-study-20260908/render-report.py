from pathlib import Path
import json
import markdown

root = Path(__file__).resolve().parent
source = (root / 'report-source.md').read_text(encoding='utf-8')
body = markdown.markdown(source, extensions=['tables', 'toc', 'fenced_code'])
css = '''
:root{color-scheme:light;--ink:#172c36;--muted:#5a6a73;--line:#d9e2e5;--accent:#126c6a}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#eef2f1;color:var(--ink);font:16px/1.85 "Malgun Gothic", "Apple SD Gothic Neo",sans-serif}
main{max-width:1050px;margin:32px auto;padding:56px 64px;background:#fff;border-top:8px solid var(--accent);box-shadow:0 12px 45px #183c3b0b}
h1{font-size:36px;line-height:1.4;letter-spacing:-1.3px;margin:0 0 12px}h1+p{color:var(--muted);font-size:13px;margin:0 0 32px}h2{font-size:25px;line-height:1.5;margin:52px 0 16px;padding-top:24px;border-top:1px solid var(--line)}h3{font-size:19px;margin:30px 0 12px}p{margin:14px 0}a{color:var(--accent);text-underline-offset:3px;overflow-wrap:anywhere}strong{font-weight:750}table{width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;line-height:1.75}th{text-align:left;background:#eaf2f1;font-weight:700}th,td{padding:12px 14px;border:1px solid var(--line);vertical-align:top}tr:nth-child(even) td{background:#fafcfc}blockquote{margin:20px 0;padding:15px 24px;border-left:4px solid var(--accent);background:#f2f7f6}blockquote p{margin:5px 0}code{background:#edf2f3;padding:2px 5px;border-radius:3px;font-size:.9em;overflow-wrap:anywhere}li{margin:10px 0}small{display:block;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:20px;margin-top:28px}.cover-note{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:var(--accent);margin-bottom:16px}footer{color:var(--muted);font-size:12px;margin:32px 0 0}
@media(max-width:720px){body{font-size:15px}main{margin:0;padding:28px 18px}h1{font-size:28px}h2{font-size:22px}th,td{padding:8px 7px;font-size:12px}table{table-layout:fixed}td,th{overflow-wrap:anywhere}}
@media print{body{background:#fff;font-size:10pt}main{max-width:none;margin:0;padding:0;box-shadow:none;border-top:0}h1{font-size:24pt}h2{font-size:17pt;break-after:avoid}h3{break-after:avoid}table{font-size:9pt}tr,blockquote{break-inside:avoid}a{color:inherit}th,td{padding:6px 8px}@page{size:A4;margin:17mm}}
'''
page = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>사건 재현 영상의 촬영·전환 설계</title><style>' + css + '</style></head><body><main><div class="cover-note">Production Research · 2026.09.08</div>' + body + '<footer>연구 결과 · 영상 생성 및 제작 계약 변경 없음</footer></main></body></html>'
target = root / 'camera-work-report.html'
target.write_text(page, encoding='utf-8')
print(json.dumps({'file': str(target), 'bytes': target.stat().st_size, 'sections': body.count('<h2'), 'tables': body.count('<table>')}, ensure_ascii=False))
