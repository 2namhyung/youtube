// Korean subtitle boundary rules ported from Leedogin/korean-subtitle-splitter.
// Upstream: https://github.com/Leedogin/korean-subtitle-splitter (MIT)
// Pinned commit: 9bc9720eccd9cf5452924f681b12ec85738f9ce8
// Copyright (c) 2026 Dogin Company. See THIRD_PARTY_NOTICES.md.

export const KOREAN_SPLITTER_UPSTREAM = Object.freeze({
  repository: 'https://github.com/Leedogin/korean-subtitle-splitter',
  commit: '9bc9720eccd9cf5452924f681b12ec85738f9ce8',
  license: 'MIT',
  port: 'scripts/korean-caption-splitter.mjs',
});

const CONNECTIVE_ADVERBS = new Set([
  '그런데', '그리고', '하지만', '그래서', '다만', '또', '또한', '따라서',
  '그러나', '즉', '물론', '오히려', '심지어', '솔직히', '사실', '결국', '특히',
]);

const ADVERB_LIKE_WORDS = new Set([
  '이제', '여기서', '먼저', '다시', '바로', '정말', '아주', '계속', '가장',
  '훨씬', '조금', '거의', '이미', '아직', '함께', '서로', '직접', '반드시', '무조건',
]);

// Upstream heads plus common contracted/inflected forms needed by newsroom copy.
const DEPENDENT_NOUN_HEADS = [
  '것', '게', '중', '때', '대로', '만큼', '뿐', '채', '지', '데', '바', '등', '및', '간',
  '내', '외', '상', '하', '전', '후', '쪽', '편', '적', '번', '개', '명', '가지', '따름', '터',
];

const AUXILIARY_VERB_STEMS = [
  '버리', '버립', '버려', '버렸', '드리', '드립', '드려', '드렸',
  '주시', '주십', '주세', '주었', '줬', '두', '둡', '뒀', '놓', '놉', '놨',
  '보', '봅', '봤', '가', '갑', '갔', '오', '옵', '왔', '내', '냅', '냈', '대', '댑', '말', '맙',
  '싶', '있', '지', '집', '졌', '하', '합', '했', '않', '되', '됩', '돼', '됐', '될',
];

const SENTENCE_FINAL_SUFFIXES = [
  '습니다', '니다', '입니다', '예요', '이에요', '에요',
  '나요', '까요', '죠', '네요', '거든요', '잖아요', '더라고요',
];

const CLAUSE_CONNECTIVE_SUFFIXES = [
  '는데', '지만', '니까', '면서', '거나', '든지', '아도', '어도',
  '고도', '라서', '여서', '으면', '면', '려면', '도록', '듯이', '고', '며',
];

const NOMINALIZING_SUFFIXES = [
  '는지', 'ㄴ지', '인지', '할지', '되는지', '했는지', '기', '음', '함', '됨',
];

const UPSTREAM_COMPOUND_TERMS = [
  '수면 중 호흡장애', '관상동맥 질환', '무호흡 지수', '체질량 지수',
  '대사 증후군', '혈당 지수', '약속 시간', '취침 시간', '저녁 식사', '아침 공복',
];

// Small, evidence-backed newsroom collocations. They prevent the exact
// modifier/dependent/auxiliary relations that a no-POS port cannot infer.
const NEWSROOM_COMPOUND_TERMS = [
  '넣기 전까지는', '업무로 핀잔을 주던', '핀잔을 주던 B씨에게', '이상한 맛에',
  '불안장애를 겪었습니다', '안 되는 살충제잖아요', '의심하게 될지도', '끝난 게 아닙니다',
  '남은 공포도',
];

export const KOREAN_CAPTION_COMPOUND_TERMS = Object.freeze([
  ...UPSTREAM_COMPOUND_TERMS,
  ...NEWSROOM_COMPOUND_TERMS,
]);

const BOUNDARY_PUNCTUATION = /[,，;:…]$|\.\.\.$/u;
const stripEdgePunctuation = (word) => String(word).replace(
  /^[\s'“”‘’()[\]{}]+|[\s'“”‘’()[\]{}.,!?;:…]+$/gu,
  '',
);
const endsWithAny = (word, suffixes) => suffixes.some(
  (suffix) => stripEdgePunctuation(word).endsWith(suffix),
);
const graphemes = (text) => typeof Intl?.Segmenter === 'function'
  ? [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(String(text))]
    .map((item) => item.segment)
  : [...String(text)];

function startsWithDependentNoun(word) {
  const head = stripEdgePunctuation(word);
  return DEPENDENT_NOUN_HEADS.some((noun) => {
    if (!head.startsWith(noun)) return false;
    const rest = head.slice(noun.length);
    if (!rest) return true;
    return /^(?:(?:은|는|이|가|을|를|에|의|도|만|과|와|로|부터|까지|보다|처럼|마다))+$/u.test(rest);
  });
}

function breaksCompoundTerm(words, index, protectedTerms = []) {
  const leftLength = words.slice(0, index).join(' ').length;
  const joined = words.join(' ');
  const terms = [...KOREAN_CAPTION_COMPOUND_TERMS, ...protectedTerms]
    .map((term) => String(term).replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  return terms.some((term) => {
    let start = joined.indexOf(term);
    while (start >= 0) {
      if (start < leftLength && leftLength < start + term.length) return true;
      start = joined.indexOf(term, start + 1);
    }
    return false;
  });
}

export function canSplitKoreanAt(words, index, options = {}) {
  if (!Array.isArray(words) || index <= 0 || index >= words.length) return false;
  const previous = words[index - 1];
  const next = words[index];
  const previousClean = stripEdgePunctuation(previous);
  const nextClean = stripEdgePunctuation(next);
  if (BOUNDARY_PUNCTUATION.test(previous)) return true;
  if (startsWithDependentNoun(next) || breaksCompoundTerm(words, index, options.protectedTerms)) return false;
  // A connective adverb belongs to the clause that follows it. This check is
  // intentionally ahead of suffix detection (`하지만` also ends in `-지만`).
  if (CONNECTIVE_ADVERBS.has(previousClean) || ADVERB_LIKE_WORDS.has(previousClean)) return false;
  if (endsWithAny(previous, SENTENCE_FINAL_SUFFIXES)) return true;
  if (endsWithAny(previous, CLAUSE_CONNECTIVE_SUFFIXES)) return true;
  if (endsWithAny(previous, NOMINALIZING_SUFFIXES)) return true;
  if (AUXILIARY_VERB_STEMS.some((stem) => nextClean.startsWith(stem))) return false;
  return true;
}

export function koreanSplitPriority(words, index, options = {}) {
  if (!canSplitKoreanAt(words, index, options)) return 0;
  const previous = words[index - 1];
  const next = stripEdgePunctuation(words[index]);
  if (CONNECTIVE_ADVERBS.has(next)) return 4;
  if (BOUNDARY_PUNCTUATION.test(previous) || endsWithAny(previous, SENTENCE_FINAL_SUFFIXES)) return 3;
  if (endsWithAny(previous, CLAUSE_CONNECTIVE_SUFFIXES)) return 2;
  return 1;
}

export function splitKoreanCaptionText(text, options = {}) {
  const maxWords = Number(options.maxWords ?? 8);
  const maxGraphemes = Number(options.maxGraphemes ?? 45);
  const minGraphemes = Number(options.minGraphemes ?? 4);
  const clean = String(text ?? '').replace(/\s+/gu, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  if (words.length <= maxWords && graphemes(clean).length <= maxGraphemes) return [clean];

  const chunks = [];
  let start = 0;
  while (start < words.length) {
    let bestIndex = null;
    let bestScore = -1;
    const limit = Math.min(words.length, start + maxWords);
    for (let index = start + 1; index <= limit; index += 1) {
      const candidate = words.slice(start, index).join(' ');
      if (graphemes(candidate).length > maxGraphemes) break;
      const remainder = words.slice(index).join(' ');
      if (index < words.length && graphemes(remainder).length < minGraphemes) continue;
      if (index === words.length) {
        bestIndex = index;
        break;
      }
      const score = koreanSplitPriority(words, index, options);
      if (score > bestScore || (score === bestScore && (bestIndex === null || index > bestIndex))) {
        if (score > 0) {
          bestIndex = index;
          bestScore = score;
        }
      }
    }

    if (bestIndex === null) {
      throw new Error(`No safe Korean caption boundary within ${maxWords} words/${maxGraphemes} graphemes: ${clean}`);
    }
    chunks.push(words.slice(start, bestIndex).join(' '));
    start = bestIndex;
  }
  return chunks;
}

export function verifyKoreanCaptionNumbers(source, captions) {
  const numbers = (value) => String(value).match(/\d+(?:[.,]\d+)?/gu) ?? [];
  return JSON.stringify(numbers(source)) === JSON.stringify(numbers(captions.join('')));
}
