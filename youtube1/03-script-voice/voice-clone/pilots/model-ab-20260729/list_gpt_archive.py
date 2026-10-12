import py7zr,json
p=r'C:\Users\User\tools\GPT-SoVITS-official\GPT-SoVITS-v3lora-20250228.7z'
with py7zr.SevenZipFile(p,'r') as z:
 i=z.list(); rows=[{'filename':x.filename,'uncompressed':x.uncompressed,'compressed':x.compressed} for x in i]
json.dump({'file_count':len(rows),'total_uncompressed_bytes':sum(x['uncompressed'] or 0 for x in rows),'files':rows},open(r'03-script-voice\voice-clone\pilots\model-ab-20260729\gpt-archive-list.json','w',encoding='utf8'),ensure_ascii=False,indent=2)
