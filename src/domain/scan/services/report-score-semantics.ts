const SCORE_GOOD = "border-emerald-400/40 bg-emerald-500/10";
const SCORE_WARN = "border-amber-300/40 bg-amber-500/10";
const SCORE_BAD = "border-red-400/40 bg-red-500/10";

export function complianceScoreClasses(score: number) {
  if (score >= 80) {
    return SCORE_GOOD;
  }
  if (score >= 50) {
    return SCORE_WARN;
  }
  return SCORE_BAD;
}

export function riskExposureScoreClasses(score: number) {
  if (score >= 80) {
    return SCORE_BAD;
  }
  if (score >= 50) {
    return SCORE_WARN;
  }
  return SCORE_GOOD;
}
