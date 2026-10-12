export type TopicScoreInput = {
  생활영향: number;
  이슈화: number;
  민원: number;
  시행긴급성: number;
  정치인책임: number;
  자료확보: number;
};

export type TopicScore = TopicScoreInput & { total: number; eligible: boolean };

const LIMITS: Record<keyof TopicScoreInput, number> = {
  생활영향: 25,
  이슈화: 15,
  민원: 20,
  시행긴급성: 15,
  정치인책임: 15,
  자료확보: 10,
};

/**
 * Calculate the editorial queue score. Inputs are deliberately bounded here so
 * a collector cannot accidentally make one signal outweigh the whole rubric.
 */
export function calculateTopicScore(input: TopicScoreInput): TopicScore {
  const score = (key: keyof TopicScoreInput) => {
    const value = Number(input[key]);
    if (!Number.isFinite(value)) return 0;
    return Math.min(LIMITS[key], Math.max(0, Math.round(value)));
  };
  const bounded = {
    생활영향: score('생활영향'),
    이슈화: score('이슈화'),
    민원: score('민원'),
    시행긴급성: score('시행긴급성'),
    정치인책임: score('정치인책임'),
    자료확보: score('자료확보'),
  };
  const total = Object.values(bounded).reduce((sum, value) => sum + value, 0);
  return { ...bounded, total, eligible: total >= 70 };
}

export const POLICY_STAGE_LABELS = {
  proposed: '발의',
  committee: '상임위 심사',
  plenary: '본회의 의결',
  promulgated: '공포',
  effective: '시행',
  amended: '개정',
  deferred: '유예',
  repealed: '폐지',
} as const;

export type PolicyStage = keyof typeof POLICY_STAGE_LABELS;
