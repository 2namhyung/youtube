export const CANONICAL_EDITOR_PROJECT_ID = "0986312f-e8a4-4354-8725-9134e71e247c";

export const newsroomProject = {
	slug: "jeju-school-intrusion",
	title: "제주 초등학교 교실 침입 사건",
	summary: "교실 침입과 재물손괴 혐의를 둘러싼 보도 내용을 교차 확인하고, 날짜·피의자 진술의 불일치를 분리한 취재 파일입니다.",
	topic: "제주의 한 초등학교 교실 침입 사건에서 보도마다 달라지는 시점과 피의자 진술을 확인하고, 학교 안전 대응과 수사 진행 상황을 사실 기반으로 설명한다.",
	sources: [
		{
			publisher: "헤드라인제주",
			title: "제주 초등학교 교실 침입 관련 보도",
			url: "https://www.headlinejeju.co.kr/news/articleView.html?idxno=594552",
			published: "2026.06",
			note: "사건 경위, 교사 측 피해 호소와 후속 대응 보도",
		},
		{
			publisher: "경향신문",
			title: "제주 초등학교 침입 사건 관련 보도",
			url: "https://www.khan.co.kr/article/202606161620001",
			published: "2026.06.16",
			note: "피의자 특정과 경찰 수사, 압수수색 영장 관련 보도",
		},
		{
			publisher: "나우뉴스",
			title: "제주 학교 침입 사건 후속 보도",
			url: "https://nownews.seoul.co.kr/news/newsView.php?id=20260617601002",
			published: "2026.06.17",
			note: "학교 측·교사 측 주장과 사건 경위 재구성",
		},
		{
			publisher: "제주MBC",
			title: "제주 초등학교 교실 침입 사건 경찰 확인 보도",
			url: "https://jejumbc.com/NewsArticle/846079",
			published: "2026.06",
			note: "경찰 확인 결과 텀블러 액체가 남성의 정액으로 확인됐다는 보도",
		},
	],
	facts: [
		"교내 CCTV 영상이 수사와 보도의 주요 근거로 언급됐다.",
		"경찰은 인근 고등학교 학생을 피의자로 특정했다고 보도됐다.",
		"제주MBC는 경찰 확인 결과 여교사 텀블러의 액체가 남성의 정액으로 확인됐다고 보도했다.",
		"공개 보도에서 확인되는 혐의는 건조물침입과 재물손괴다.",
		"피해 교사 측이 피의자의 휴대전화와 컴퓨터 포렌식을 요청했고, 관련 영장이 법원에서 기각됐다고 보도됐다.",
		"현재 확보한 공개 기사만으로는 최종 수사 처분을 확인할 수 없다.",
	],
	contradictions: [
		{ label: "최초 침입일", a: "4월 27일", b: "4월 28일", status: "미해결", note: "기사별 날짜 표기가 달라 원문·수사기관 확인 필요" },
		{ label: "두 번째 침입일", a: "6월 4일", b: "6월 5일", status: "미해결", note: "발생 시점과 발견 시점이 섞였을 가능성 검토" },
		{ label: "침입 이유에 대한 진술", a: "간식을 찾으려 했다", b: "화장실이 급했다", status: "맥락 분리 필요", note: "보도마다 피의자의 설명이 다르게 인용돼 사건별 진술인지 확인 필요" },
	],
	followUps: [
		"제주경찰청에 송치·불송치 등 최종 처분과 적용 혐의를 확인한다.",
		"학교와 교육청에 4월·6월 사건의 정확한 발생일 및 신고일을 확인한다.",
		"법원 영장 기각 사유는 공개 가능한 범위에서만 확인하고 추정하지 않는다.",
		"피해 교사의 건강·근무 상태는 본인 또는 노조 측 주장임을 명시한다.",
	],
	sensitiveNotes: [
		"교사 피해와 불안 호소는 피해자 측 또는 노조가 전한 주장으로 귀속한다.",
		"학생의 동기와 교사 대상 의도는 확정 사실로 쓰지 않는다.",
		"미성년 피의자를 식별할 수 있는 학교·학년·개인 정보는 노출하지 않는다.",
	],
	evidence: [
		{ id: "E-01", claim: "CCTV 존재 및 피의자 특정", support: "세 매체의 공통 보도", strength: "교차 확인" },
		{ id: "E-02", claim: "건조물침입·재물손괴 혐의", support: "세 매체의 공통 보도", strength: "교차 확인" },
		{ id: "E-03", claim: "압수수색 영장 기각", support: "복수 보도에서 경찰 수사 과정으로 언급", strength: "보도 확인" },
		{ id: "E-04", claim: "피해 교사의 불안·근무지 이탈", support: "노조 또는 피해자 측 설명을 인용한 보도", strength: "귀속 필요" },
		{ id: "E-05", claim: "최종 처분", support: "현재 수집 기사에 후속 결과 없음", strength: "확인 안 됨" },
		{ id: "E-06", claim: "텀블러 액체가 남성의 정액으로 확인", support: "제주MBC 경찰 확인 보도", strength: "경찰 확인" },
	],
	timeline: [
		{ period: "지난 4월", title: "첫 침입이 보도됨", detail: "제주 서귀포의 한 초등학교 교실에 누군가 들어갔고, 다음 날 여교사 텀블러에서 발견된 액체는 제주MBC가 전한 경찰 확인 결과 남성의 정액으로 확인됐다." },
		{ period: "한 달여 뒤", title: "같은 교실에 반복 침입", detail: "교사용 의자에 소변을 본 정황이 있었다고 보도됐다. 날짜 표기는 기사마다 달라 원문 확인이 필요하다." },
		{ period: "수사 진행", title: "CCTV로 피의자 특정", detail: "경찰이 인근 고등학교 학생을 피의자로 특정했다고 여러 매체가 전했다." },
		{ period: "현재 공개 범위", title: "영장·최종 처분은 제한적으로 확인", detail: "피의자의 휴대전화와 컴퓨터 포렌식 영장이 기각됐다고 보도됐지만, 정확한 사유와 최종 처분은 확인되지 않았다." },
	],
	fearAnalysis: [
		{ id: "F-01", title: "정보의 비대칭", concern: "피해자 측은 침입자가 자신의 근무 공간과 자신이 매일 쓰는 물건까지 건드렸다는 사실 때문에, 상대는 내 일터를 알고 있는데 나는 상대가 누군지 모른다는 불안을 호소한다.", whyFear: "피의자가 특정됐다는 소식만으로는 피해자가 실제로 얼굴이나 접근 가능성을 파악했다는 뜻이 아니다.", evidenceIds: ["E-01", "E-04"], legalIds: ["L-01", "L-02"] },
		{ id: "F-02", title: "반복 침입과 공간 오염", concern: "같은 교실에 두 차례 침입하고 텀블러와 의자처럼 몸에 닿는 물건이 오염되면서, 일하던 교실 자체가 더 이상 안전한 장소로 느껴지지 않을 수 있다.", whyFear: "침입이 한 번의 낯선 사건이 아니라 같은 공간에서 반복됐다는 점이 재접근 공포를 키운다.", evidenceIds: ["E-02", "E-04"], legalIds: ["L-03", "L-05"] },
		{ id: "F-03", title: "동기와 디지털 범위의 미확인", concern: "피의자는 교사를 노린 것도 성적 목적도 아니라고 주장했고, 침입 이유에 대한 보도도 엇갈린다. 피의자의 휴대전화와 컴퓨터 포렌식 영장이 기각됐다고 보도됐지만 기각 사유는 공개 자료로 알 수 없다.", whyFear: "무엇을 더 확인해야 하는지조차 남아 있으면 피해자는 사건의 범위를 스스로 끝낼 수 없다.", evidenceIds: ["E-03"], legalIds: ["L-04", "L-07"] },
		{ id: "F-04", title: "재접근과 보호의 공백", concern: "피의자 특정은 확인됐지만, 그것만으로 학교에 들어온 경로가 닫혔거나 위험도에 따른 순찰·동행 같은 안전조치가 이미 시작됐다는 뜻은 아니다.", whyFear: "가능한 순찰·동행·출입 통제는 위험도와 신청, 현장 확인에 따라 달라질 수 있어 피해자가 안전을 체감하기까지 빈틈이 남는다.", evidenceIds: ["E-01", "E-04"], legalIds: ["L-03", "L-05"] },
		{ id: "F-05", title: "같은 일터로 돌아가야 하는 부담", concern: "피해 교사 측은 불안 때문에 근무지를 떠날 수밖에 없었다고 호소했다. 실제 복귀 시점과 건강 상태는 본인·학교의 확인이 필요하다.", whyFear: "돌아가야 할 교실에 침입 흔적과 다시 열린 출입 경로의 기억이 남아 있으면, 검거 소식만으로 일상이 회복되기 어렵다.", evidenceIds: ["E-04"], legalIds: ["L-06", "L-08"] },
	],
	chargeGapResearch: [
		{
			id: "G-01",
			title: "건조물침입·재물손괴가 먼저 확인된 이유",
			confirmedActions: "CCTV로 교실 출입과 물건 훼손 여부를 확인하고, 피의자 특정 보도를 확인했습니다.",
			currentProvisionalCharges: "건조물침입(형법 제319조)·재물손괴(형법 제366조)가 현재 보도된 잠정 혐의입니다.",
			whyAppliedEasily: "무단 진입과 물건 효용 침해는 CCTV·현장 사진·복구비 등 객관자료로 입증하기 쉽습니다.",
			candidateCharges: "반복되는 표적 행위라면 스토킹처벌법 제2조 라·마 및 제18조 적용 가능성을 검토할 수 있습니다.",
			missingElementsOrEvidence: "반복성, 교사 표적성, 정당한 이유 부재, 객관적 공포와 고의 등은 추가 자료로 확인해야 합니다.",
			victimImpact: "성적·모욕적인 오염이 반복돼도 재물손괴만으로 공개되면 피해자는 계속되는 접근과 불안을 설명받지 못했다고 느낄 수 있습니다.",
			nextInvestigationOrReform: "CCTV·출입기록·메신저를 보전하고 반복 패턴과 표적성을 확인한 뒤, 재접근 금지와 학교 안전조치를 함께 검토합니다.",
			sourceUrls: [
				"https://www.law.go.kr/법령/형법/제319조",
				"https://www.law.go.kr/법령/형법/제366조",
				"https://www.law.go.kr/법령/스토킹범죄의처벌등에관한법률/제2조",
				"https://www.law.go.kr/법령/스토킹범죄의처벌등에관한법률/제18조",
				"https://www.law.go.kr/LSW/precSc.do?query=2016도9219",
				"https://www.law.go.kr/LSW/precSc.do?query=2023도10313",
			],
			caution: "입건 죄명은 잠정적이며, 공개 보도만으로 영장 기각 사유나 최종 처분을 단정하지 않습니다.",
		},
		{
			id: "G-02",
			title: "성적으로 끔찍한 오염과 성범죄 구성요건의 간극",
			confirmedActions: "물건 오염과 교실 침입이 보도됐지만, 사람을 향한 유형력·추행이나 신체 촬영 사실은 공개 자료에서 확인되지 않습니다.",
			currentProvisionalCharges: "현재 공개된 잠정 혐의는 건조물침입·재물손괴 중심이며 성범죄 적용 여부는 확인되지 않았습니다.",
			whyAppliedEasily: "재물의 효용 침해는 물건 상태와 복구 필요성으로 입증할 수 있지만, 물건 오염만으로 성범죄가 자동 성립하거나 자동 배제되는 것은 아닙니다.",
			candidateCharges: "행위 태양과 성적 맥락, 피해자 신체·의복과의 관계, 폭행·협박과 고의가 추가로 확인되면 강제추행(형법 제298조) 적용 가능성을 검토합니다. 법정 장소 요건이면 성폭력처벌법 제12조, 신체 촬영이면 제14조, 고의적 업무 방해 위험이면 업무방해를 각각 별도로 검토합니다.",
			missingElementsOrEvidence: "피해자 신체·의복을 직접 향한 행위, 폭행·협박, 성적 자기결정권 침해, 고의와 성적 맥락, 업무 방해 위험, 체액 감정 결과와 교사 표적성을 확인할 자료가 빠져 있습니다.",
			victimImpact: "행위의 성적 모욕감과 공포는 재물손괴라는 결과만으로 설명되지 않아, 피해자는 왜 더 무거운 보호가 작동하지 않는지 답답함을 느낄 수 있습니다.",
			nextInvestigationOrReform: "피해자 진술과 영상·디지털 자료를 보전하고 반복성·표적성·공연성·신체 대상성을 각각 확인합니다. 정액 오염 행위의 별도 규율 필요성은 입법 공백으로 제시하되 현행법 적용을 단정하지 않습니다.",
				sourceUrls: [
				"https://www.law.go.kr/법령/형법/제298조",
				"https://www.law.go.kr/LSW/precInfoP.do?precSeq=219557",
				"https://www.law.go.kr/LSW/precInfoP.do?precSeq=164660",
				"https://www.law.go.kr/LSW/precInfoP.do?mode=0&precSeq=606755",
				"https://www.law.go.kr/법령/성폭력범죄의처벌등에관한특례법/제12조",
				"https://www.law.go.kr/법령/성폭력범죄의처벌등에관한특례법/제14조",
				"https://www.law.go.kr/법령/형사소송법/제215조",
				"https://www.law.go.kr/법령/형사소송법/제245조의5",
				"https://www.law.go.kr/LSW/precSc.do?query=2019도15421",
			],
			caution: "대법원 2021도7538은 피해자 신체·의복에 직접 소변을 본 사안으로 별도 물건 오염인 본건과 다릅니다. 공개 사실만으로 성범죄 성립 또는 불성립을 단정하지 않습니다. 미성년 여부는 구성요건이 아니라 절차·처분에 영향을 줍니다.",
		},
	],
	legalResearch: [
		{ id: "L-01", title: "정보 통지", status: "확인된 법", whyVictimSuffers: "신청과 절차 단계에 따른 통지라서 실시간으로 모든 증거·피의자 신원을 받는 제도는 아니다.", legalBasis: "범죄피해자보호법 제8조·제8조의2, 시행령 제10조의2; 형사소송법 제259조의2", availableMeasure: "수사·재판 진행 통지를 신청하고 단계별 안내를 요청할 수 있다.", limit: "자동 통지·실시간 공개·피의자 이름 제공을 보장하지 않는다.", sourceTitle: "국가법령정보센터 — 범죄피해자보호법", sourceUrl: "https://www.law.go.kr/LSW/lsSc.do?eventGubun=060101&query=%EB%B2%94%EC%A3%84%ED%94%BC%ED%95%B4%EC%9E%90%20%EB%B3%B4%ED%98%B8%EB%B2%95", secondarySourceTitle: "국가법령정보센터 — 형사소송법 제259조의2", secondarySourceUrl: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0259&lsiSeq=269945&urlMode=lsScJoRltInfoR", safeScriptSentence: "피해자가 수사 단계와 보호 조치를 제때 알 수 있도록 통지 절차를 요청할 수 있습니다.", confidence: "높음" },
		{ id: "L-02", title: "미성년 신원 제한", status: "확인된 법", whyVictimSuffers: "피의자가 미성년이면 공개 신상과 피해자에게 알려지는 신원은 별개의 문제라 답답함이 남는다.", legalBasis: "소년법 제68조; 특정중대범죄 피의자 신상정보 공개법 제4조", availableMeasure: "공익상 필요한 범위에서 수사기관에 사건 진행과 보호 필요를 전달할 수 있다.", limit: "미성년자 신상 공개는 제한되고, 일반 건조물침입은 특정중대범죄 목록에 보통 포함되지 않는다.", sourceTitle: "국가법령정보센터 — 소년법 제68조", sourceUrl: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0068&lsiSeq=222435&urlMode=lsScJoRltInfoR", secondarySourceTitle: "국가법령정보센터 — 특정중대범죄 피의자 신상정보 공개법", secondarySourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=255431", safeScriptSentence: "미성년 피의자의 신상을 공개할 수 없는 제한과 피해자 통지는 서로 다른 문제입니다.", confidence: "높음" },
		{ id: "L-03", title: "경찰 안전조치", status: "적용 가능성", whyVictimSuffers: "위험도 심사와 신청이 전제돼 보호 기간·강도가 사건마다 달라질 수 있다.", legalBasis: "경찰청훈령 피해자 보호 및 지원에 관한 규칙 제28~35조", availableMeasure: "순찰·동행, 임시숙소, CCTV, 비상연락, 심리 지원 등을 위험도에 따라 요청할 수 있다.", limit: "자동 제공이나 기간이 보장되는 조치는 아니며 위험도 심사 결과에 좌우된다.", sourceTitle: "국가법령정보센터 — 피해자 보호 및 지원에 관한 규칙", sourceUrl: "https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000273166&chrClsCd=010201", safeScriptSentence: "위험도에 따라 순찰과 임시숙소 같은 안전조치를 요청할 수 있지만 자동으로 이어지는 것은 아닙니다.", confidence: "높음" },
		{ id: "L-04", title: "압수수색 영장", status: "확인된 법", whyVictimSuffers: "영장 발부·기각의 구체적 이유를 알기 어려우면 디지털 증거가 남아 있는지 불안해진다.", legalBasis: "형사소송법 제215조·제219조 — 혐의 소명과 필요성·관련성", availableMeasure: "수사기관에 증거 보전 필요성을 설명하고 피해자 의견을 전달할 수 있다.", limit: "이번 영장 기각의 정확한 이유와 법원의 판단은 공개 자료만으로 알 수 없다.", sourceTitle: "국가법령정보센터 — 형사소송법 제215조", sourceUrl: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0215&lsiSeq=280441&urlMode=lsScJoRltInfoR", safeScriptSentence: "영장은 혐의와 필요성, 관련성을 따져 발부되므로 이번 기각 사유는 단정할 수 없습니다.", confidence: "높음" },
		{ id: "L-05", title: "학교 출입 안전", status: "확인된 법", whyVictimSuffers: "법에 계획 의무가 생겨도 실제 학교의 확인 절차와 순찰이 충분했는지는 별도 확인이 필요하다.", legalBasis: "초중등교육법 제30조의8 (2026년 3월 1일 시행)", availableMeasure: "방문자 신원 확인·영상기록·주변 순찰 등 학교 안전계획을 확인할 수 있다.", limit: "해당 학교의 실제 이행 수준과 효과는 공개 자료로 확인되지 않았다.", sourceTitle: "국가법령정보센터 — 초중등교육법 제30조의8", sourceUrl: "https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033327321", safeScriptSentence: "학교는 방문자 확인과 순찰을 포함한 안전계획을 갖춰야 하지만 현장의 충분성은 따로 확인해야 합니다.", confidence: "높음" },
		{ id: "L-06", title: "교원 보호 절차", status: "적용 가능성", whyVictimSuffers: "교육활동 침해행위에 해당하는지, 외부인의 행위가 어디까지 연결되는지 사실관계에 따라 달라진다.", legalBasis: "교원지위법 제19조·제20조", availableMeasure: "해당하면 즉시 상담·치료·휴가 등 보호 절차를 요청할 수 있다.", limit: "외부인 사건에 자동 적용된다고 볼 수 없고 행위자 관계와 사실 확인이 필요하다.", sourceTitle: "국가법령정보센터 — 교원지위법 제19·20조", sourceUrl: "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029092009", safeScriptSentence: "교원 보호 절차가 적용되는지는 사건의 관계와 사실관계를 확인한 뒤 판단해야 합니다.", confidence: "중간" },
		{ id: "L-07", title: "디지털 성적 콘텐츠", status: "추가 확인", whyVictimSuffers: "촬영·유포의 법적 요건이 확인되지 않으면 의심만으로 수사 범위를 넓힐 수 없다.", legalBasis: "성폭력처벌법 제14조·제23조의2", availableMeasure: "불법 촬영·유포 정황이 있으면 증거 보전과 디지털 성범죄 지원을 요청할 수 있다.", limit: "단순한 의심이나 기기 소지만으로 해당 범죄가 성립한다고 단정할 수 없다.", sourceTitle: "국가법령정보센터 — 성폭력처벌법 제14조·제23조의2", sourceUrl: "https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029508333", safeScriptSentence: "불법 촬영이나 유포의 요건이 확인되기 전에는 의심을 사실처럼 말할 수 없습니다.", confidence: "높음" },
		{ id: "L-08", title: "회복 지원 연결", status: "적용 가능성", whyVictimSuffers: "상담·치료·법률·주거 지원은 연결될 수 있지만 장기적인 이동이나 복귀까지 자동 보장하지 않는다.", legalBasis: "범죄피해자보호법 제7조·제9조 및 경찰 규칙", availableMeasure: "상담·의료·법률·주거 지원 기관 연계를 요청할 수 있다.", limit: "장기 전보·주거 이전·안전한 복귀가 자동으로 보장되는 제도는 아니다.", sourceTitle: "국가법령정보센터 — 범죄피해자보호법 제7·9조", sourceUrl: "https://law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=000700000&languageType=KO&lsNm=%EB%B2%94%EC%A3%84%ED%94%BC%ED%95%B4%EC%9E%90+%EB%B3%B4%ED%98%B8%EB%B2%95&paras=1", safeScriptSentence: "상담과 치료, 법률·주거 지원을 연결할 수 있지만 회복의 기간까지 대신 정해주지는 않습니다.", confidence: "높음" },
	],
	assets: [
		{ id: "A-01", kind: "AI 재연", title: "교사가 교실에서 텀블러 이상을 발견하는 장면", file: "teacher-discovers-tumbler-v2.png", status: "사용 가능", rationale: "공개 사실만 바탕으로 독립 생성한 이미지. 실제 피해자·학교·현장이 아니며 ‘사건 내용 기반 AI 재구성’ 고지 필수." },
		{ id: "P-01", kind: "언론사 이미지", title: "기사 대표 이미지 묶음", file: null, status: "격리", rationale: "발행사 저작물. 별도 이용 허락 증빙이 없어 미리보기와 렌더에서 제외." },
		{ id: "Y-01", kind: "YouTube 후보", title: "제주 학교 안전 관련 공개 영상 탐색", file: null, status: "라이선스 검토", rationale: "업로더 권리·촬영 장소·2차 이용 허락을 확인하기 전 자동 승인하지 않음." },
		{ id: "Y-02", kind: "YouTube 후보", title: "학교 CCTV 제도 설명 영상 탐색", file: null, status: "라이선스 검토", rationale: "CC 표시만으로 충분하지 않음. 원저작권자와 표시 조건 증빙 필요." },
	],
} as const;

export type ScriptGeneration =
	| {
		model: string;
		reasoningEffort: string;
		generatedAt: string;
		source: "codex-cli";
	}
	| {
		source: "user-approved-final-script";
		voiceProfile: string;
		contentChanged: boolean;
	};

export type ScriptState = {
	slug: string;
	draft: string;
	status: "draft" | "final";
	savedAt: string | null;
	finalizedAt: string | null;
	generation?: ScriptGeneration;
};
