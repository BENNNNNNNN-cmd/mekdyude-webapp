import type { ReverseOption } from "./reverse-options";

const STAFF_UP_BASE_SCORE = 10;
const BUILD_NEW_BASE_SCORE = 50;
const BLOCKED_BUILD_PENALTY = 100;
const UNSATISFIED_UPSTREAM_PENALTY = 25;

export function scoreOption(option: ReverseOption, gap: number) {
  const baseScore = option.kind === "staff_up" ? STAFF_UP_BASE_SCORE : BUILD_NEW_BASE_SCORE;
  const coveragePenalty = getCoveragePenalty(option.yield_per_year, gap);
  const upstreamPenalty =
    option.upstream_demand.filter((demand) => !demand.satisfied).length * UNSATISFIED_UPSTREAM_PENALTY;

  if (option.kind === "staff_up") {
    return baseScore + coveragePenalty + upstreamPenalty + option.additional_units_needed;
  }

  const blockedPenalty = option.blocked_reasons.length * BLOCKED_BUILD_PENALTY;
  const costPenalty = option.costs.reduce((total, cost) => {
    if (cost.status === "ok") return total + cost.required * 0.1;
    if (cost.status === "manual") return total + cost.required * 0.5;
    return total + Math.max(0, cost.required - cost.available) + cost.required * 0.5;
  }, 0);

  return baseScore + coveragePenalty + upstreamPenalty + blockedPenalty + costPenalty;
}

export function sortOptions(options: ReverseOption[]) {
  return [...options].sort((left, right) => {
    if (left.score !== right.score) return left.score - right.score;
    if (left.yield_per_year !== right.yield_per_year) return right.yield_per_year - left.yield_per_year;
    if (left.kind !== right.kind) return left.kind === "staff_up" ? -1 : 1;
    const buildingCompare = left.building_name.localeCompare(right.building_name, "fr-CA");
    if (buildingCompare !== 0) return buildingCompare;
    return left.domain_name.localeCompare(right.domain_name, "fr-CA");
  });
}

function getCoveragePenalty(yieldPerYear: number, gap: number) {
  if (gap <= 0 || yieldPerYear >= gap) return 0;
  return ((gap - yieldPerYear) / gap) * 40;
}
