# Evidence-motion prototype v2

경찰 아버지 휴대전화 사건의 **비공개·비권위 디자인 샘플**이다. 승인된 `production-38b942bd…` 권위, 정확한 55.016초 내레이션, 11개 evidence span과 정상 한글 제목만 사용한다. 손상된 `production-b173…` 권위와 약 50초 구형 음성은 명시적으로 배제한다.

18개 컷은 `evidence-motion-documentary-v2` 공통 분류와 성공 레퍼런스에서 추출한 설계 규칙을 적용한다: 3초 이내 증거 훅, sourceKind·evidenceStatus·disclosure 표시, 정확한 내레이션 cue/문자 anchor, 한 화면 한 주장, 관계도와 이중 타임라인, 수사/처벌 분리, 변한 물건으로 돌아오는 결말. 레퍼런스는 사실 출처나 스타일 복제 권위가 아니다. 모든 media slot은 assembly-ready 의미에 맞춰 `pending`으로 남긴다.

```powershell
node prototypes/research-6b1a8af9b4143acb-evidence-motion-v2/render.mjs --out out/prototypes/research-6b1a8af9b4143acb-evidence-motion-v2
node prototypes/research-6b1a8af9b4143acb-evidence-motion-v2/verify.mjs --manifest out/prototypes/research-6b1a8af9b4143acb-evidence-motion-v2/creator-manifest.json --video out/prototypes/research-6b1a8af9b4143acb-evidence-motion-v2/research-6b1a8af9b4143acb-evidence-motion-v2.mp4 --thumbnail out/prototypes/research-6b1a8af9b4143acb-evidence-motion-v2/thumbnail.jpg --contact out/prototypes/research-6b1a8af9b4143acb-evidence-motion-v2/contact-sheet.jpg
```

네트워크, 외부/생성 미디어, ImageGen, Wan, 업로드와 공개는 사용하지 않는다. 사람은 익명 역할 카드와 빈 얼굴만 사용하며 미성년자·교사·사적 화면·경찰 로고와 배지를 표시하지 않는다.
