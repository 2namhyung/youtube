# 휴대전화 증거 보드 프로토타입

승인된 대본·내레이션의 첫 15.709298초와 `span-001`, `span-002`를 사용하는 비공개 결정론적 모션그래픽입니다. 외부 이미지, 생성형 미디어, 제공자, 네트워크, 업로드를 사용하지 않습니다. 현재 workflow 작업의 제목 바이트가 손상되어 있으므로, 정상 한글 제목과 동일 승인 대본·내레이션을 결합한 `production-38b942...` authority에만 바인딩합니다.

```powershell
node prototypes/research-6b1a8af9b4143acb-evidence-board-v1/render.mjs --out out/prototypes/research-6b1a8af9b4143acb-evidence-board-v1
node prototypes/research-6b1a8af9b4143acb-evidence-board-v1/verify.mjs --manifest out/prototypes/research-6b1a8af9b4143acb-evidence-board-v1/creator-manifest.json --video out/prototypes/research-6b1a8af9b4143acb-evidence-board-v1/research-6b1a8af9b4143acb-evidence-board-v1.mp4 --thumbnail out/prototypes/research-6b1a8af9b4143acb-evidence-board-v1/thumbnail.jpg --contact out/prototypes/research-6b1a8af9b4143acb-evidence-board-v1/contact-sheet.jpg
```
