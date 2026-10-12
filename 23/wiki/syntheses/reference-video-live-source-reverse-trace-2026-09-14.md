# 레퍼런스 영상 실사 소스 역추적 — 2026-09-14

## 결론

두 레퍼런스군은 같은 방식으로 실사를 수급하지 않았다.

- **MoSidd/Remotion 레퍼런스**는 Magnific MCP를 검색·생성·다운로드 허브로 사용한다. 제작자는 투명 인물 이미지와 바다 영상을 예로 들며 이 경로를 화면과 음성으로 직접 설명한다. 다만 개별 실존 인물 사진의 최초 촬영자·통신사·라이선스는 공개 영상과 설명란에서 밝히지 않는다. 따라서 `Magnific에서 받음`은 취득 경로이지 원저작권자 확인이 아니다. [원본 메타데이터](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.info.json), [자동자막 02:38–03:18·05:33–05:55·10:09–10:24](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt)
- **한방이슈 레퍼런스**는 뉴스·공식행사·산업·도시·상품 B-roll을 짧게 이어 붙인 편집물이다. 전체의 83.1%가 실사 자료영상이고 진행자·실사 분할까지 합치면 약 92.5%지만, 표본 프레임에는 한방이슈 워터마크만 보이고 원 방송사·통신사 크레딧은 확인되지 않았다. YouTube 설명란에도 영상별 원출처 목록이 없다. 따라서 사건과 장소는 일부 공식 기록에 대응시킬 수 있어도, 해당 픽셀이 어느 배포사 파일에서 왔는지는 현재 자료만으로 확정할 수 없다. [프레임 분석과 한계](../../video/qa/reference-study/hanbang-5o8DvcFB65g-v01/analysis.md), [YouTube 메타데이터](../../video/qa/reference-study/hanbang-5o8DvcFB65g-v01/source-metadata.json)

## MoSidd가 공개한 실제 수급 루트

| 화면 자산 | 확인된 수급·제작 경로 | 확실도 | 남은 문제 |
|---|---|---:|---|
| 이미지 전반 | 이미지 생성기를 쓰겠다고 말한 뒤 Claude Code에 Magnific MCP를 연결한다. Magnific 공식 MCP는 스톡 검색·다운로드와 이미지 생성 기능을 함께 제공한다. [자동자막 01:55–03:18](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt), [Magnific MCP 문서](https://docs.magnific.com/modelcontextprotocol) | 높음 | 자막의 모델명 `GPT 2.0`은 자동전사 오인 가능성이 있어 모델을 확정하지 않는다. 검색 결과인지 생성 결과인지 자산별로 나눠 기록하지 않았다. |
| Donald Trump 등 인물 누끼 | “transparent image”를 가져와 흑백·하프톤 처리하도록 지시한다. [자동자막 05:33–05:55](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt) | 중간 | 취득 사이트, 사진가, 촬영일, 원본 URL, 라이선스가 공개되지 않았다. 실존 인물 사진의 production 재사용 근거로 삼을 수 없다. |
| 바다 실사/애니메이션 영상 | 배경이 제거된 green-screen ocean video를 Magnific에서 다운로드할 수 있다고 제작자가 직접 말한다. [자동자막 10:09–10:24](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt) | 높음 | Magnific 내부 item ID와 최초 제작자·라이선스는 영상에 없다. |
| 차트·지도·텍스트 | Remotion/React 코드로 구축한다. 지도편은 설명란에서 free map data와 real country shapes를 썼다고 밝힌다. [지도편 메타데이터](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.info.json) | 높음 | 실사 수급이 아니라 결정론적 그래픽 경로다. 지도 데이터셋 이름·버전은 설명란에서 특정되지 않는다. |
| 콜라주 레퍼런스 | 자산·프롬프트를 Skool practice kit/asset pack으로 배포하고, `aSNYHAzPEKc`는 `GPT2 Image (Replicate)`를 스택으로 명시한다. [콜라주편 메타데이터](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.info.json) | 높음 | 배포 pack이 개별 실사 원본의 권리 증빙이라는 뜻은 아니다. |

Magnific의 현재 공식 문서는 MCP가 생성뿐 아니라 수백만 스톡 이미지·아이콘 검색과 다운로드도 제공한다고 설명한다. 따라서 MoSidd가 말한 `Magnific에서 가져오기`는 **스톡 검색 결과와 AI 생성 결과가 섞일 수 있는 통합 취득 경로**로 이해해야 한다. 자산별 creation/item metadata가 없으면 둘을 구별할 수 없다. [Magnific MCP 문서](https://docs.magnific.com/modelcontextprotocol)

다른 MoSidd 레퍼런스도 한 공급처로 통일돼 있지 않다. Netflix/Blockbuster 콜라주 편은 자산이 Google Images, GPT 계열/Replicate 생성, 다른 편집자의 asset pack 등 어디서든 올 수 있다고 설명하고 smoke/explosion stock video를 별도 레이어로 권한다. 지도편의 explosion 영상은 프로젝트 assets 폴더에 있다고만 하며 공급처를 밝히지 않는다. 즉 이 제작법의 실질은 **웹 이미지·AI 생성·asset pack·스톡 영상을 혼합한 뒤 Remotion에서 합성하는 것**이다. [콜라주편 자동자막 03:45–04:05·07:18–07:43](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt), [지도편 자동자막 06:17–06:52](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt)

`aSNYHAzPEKc`는 설명란의 AI 생성 강조와 달리 자동자막에서 craft-paper 등 일부 파일을 Google Images에서 얻고 일부를 Replicate로 생성했다고 말한다. 따라서 채널 설명의 “AI 제작” 표현만으로 모든 픽셀의 origin을 AI 생성으로 분류하면 안 된다. [콜라주편 메타데이터](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.info.json), [콜라주편 자동자막 02:00 부근](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.en.vtt)

## 한방이슈에서 역추적 가능한 범위

대표 프레임을 원본 해상도로 확인한 결과, 캐나다 국기, 미·캐나다 국기, Trump의 reciprocal tariffs 표 연설, 한미 정상 회담 등에는 모두 한방이슈 워터마크와 자체 자막만 남아 있다. 원 방송 로고·통신사 slug·사진가 표기는 보이지 않는다. [캐나다 국기 F349](../../video/qa/reference-study/hanbang-5o8DvcFB65g-v01/editorial-frames/00349.jpg), [양국 국기 F739](../../video/qa/reference-study/hanbang-5o8DvcFB65g-v01/editorial-frames/00739.jpg), [관세표 연설 F12314](../../video/qa/reference-study/hanbang-5o8DvcFB65g-v01/editorial-frames/12314.jpg), [한미 정상 회담 F12908](../../video/qa/reference-study/hanbang-5o8DvcFB65g-v01/editorial-frames/12908.jpg)

캐나다 총리의 “old relationship” 발언은 캐나다 총리실의 2026-08-21 공식 성명과 의미가 대응한다. 이는 사건·발언의 공식 근거를 찾은 것이며, 한방이슈가 사용한 인터뷰 영상 파일의 공급처를 입증하지 않는다. [캐나다 총리실 공식 성명](https://www.pm.gc.ca/en/news/statements/2026/08/21/statement-prime-minister-carney-canada-us-trade-negotiations)

현재 확정 가능한 것은 다음까지다.

1. 정치인 연설·정상회담은 실제 공개행사 영상이다.
2. 국기·항만·공장·매장·도시 영상은 사건을 직접 증명하기보다 내레이션의 명사·행동을 받치는 B-roll로 쓰인다.
3. 원본 크레딧이 제거된 프레임만으로 Getty/AP/Reuters/방송사/공식기관 가운데 어느 공급처인지 단정할 수 없다.
4. 이 레퍼런스의 편집 문법은 참고할 수 있지만, 해당 영상을 다시 내려받아 제작 자산으로 쓰는 방식은 출처·권리 gate를 통과하지 못한다.

## 우리 파이프라인에 적용할 판정

- 레퍼런스의 **편집 방식**은 채택한다: 한 문장 안에서도 사람·행동·장소·사물·다른 거리의 화면을 바꾼다.
- 레퍼런스가 쓴 **파일 자체**는 취득 후보로 보지 않는다. 원 방송/공식기관/스톡 item 페이지까지 별도로 찾아야 한다.
- Magnific 같은 통합 검색기는 discovery route로만 기록한다. `original_item_url`, `creator`, `license_url`, 다운로드 시점, 원본 SHA-256이 없는 결과는 production review에 올리지 않는다.
- 실존 인물은 공식기관·원 방송·명시 라이선스 원본을 우선한다. 생성 이미지와 출처 불명 누끼로 대체하지 않는다.
- 한방이슈처럼 원출처가 지워진 레퍼런스 프레임은 검색어와 사건 locator를 만드는 데만 사용한다.

## 미확인 항목

- 한방이슈가 유료 뉴스 피드, 방송사 제휴 영상, 스톡 구독, 공개기관 파일 중 무엇을 계약·사용했는지는 공개 자료로 확인되지 않았다.
- MoSidd의 Trump 등 실존 인물 이미지와 Magnific 바다 영상의 item ID·creator·license는 확인되지 않았다.
- Skool asset pack은 설명란에서 존재만 확인했으며, 로그인 뒤 pack 내용과 권리 문서는 이번 조사에서 확인하지 않았다.
