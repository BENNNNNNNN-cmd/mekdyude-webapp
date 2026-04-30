import { getCarteByNameFr, ReferenceDataError } from "./reference-postgres";

const WORKER_SUBSTITUTE_NAMES = [
  "Esclave",
  "Forestier",
  "Marin",
  "Nomade",
  "Paysan",
  "Peau verte",
  "Voelhoorn",
  "Homme-bête",
] as const;

let cached: Map<string, string[]> | null = null;
let pending: Promise<Map<string, string[]>> | null = null;

async function build(): Promise<Map<string, string[]>> {
  const resolved: Array<{ name: string; id: string }> = [];
  const missing: string[] = [];

  for (const name of WORKER_SUBSTITUTE_NAMES) {
    const carte = await getCarteByNameFr(name);
    if (carte) {
      resolved.push({ name, id: carte.id });
    } else {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new ReferenceDataError(
      `card-substitutes: cannot resolve worker name(s) to Carte: ${missing.join(", ")}. ` +
        `Either the workbook is missing these or the spelling drifted.`
    );
  }

  const map = new Map<string, string[]>();
  for (const a of resolved) {
    map.set(
      a.id,
      resolved.filter((b) => b.id !== a.id).map((b) => b.id)
    );
  }
  return map;
}

export async function getCardSubstitutes(): Promise<Map<string, string[]>> {
  if (cached) return cached;
  if (!pending) {
    pending = build().then((map) => {
      cached = map;
      pending = null;
      return map;
    });
  }
  return pending;
}

export function _resetCardSubstitutesCache(): void {
  cached = null;
  pending = null;
}
