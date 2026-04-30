/**
 * One-off exploration: dump Cout + Effet rows for a few buildings so we can
 * design the engine's derivation logic against real text. Delete after Phase 2.
 *
 *   npx tsx scripts/peek-batiment.ts BAT_CHATEAU BAT_ABBAYE BAT_CHAMPS BAT_CATHEDRALE
 */
import "dotenv/config";
import { getBatiments, getCouts, getEffets } from "../lib/reference-postgres";

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Usage: peek-batiment.ts BAT_X [BAT_Y ...]");
    process.exit(1);
  }
  const [batiments, couts, effets] = await Promise.all([
    getBatiments(),
    getCouts(),
    getEffets(),
  ]);
  for (const id of ids) {
    const b = batiments.find((x) => x.id === id);
    console.log(`\n========== ${id} ==========`);
    if (!b) {
      console.log("(not found)");
      continue;
    }
    console.log(`name: ${b.nameFr}  sphere: ${b.sphere}  cap: ${b.capaciteQuantite} ${b.capaciteType}`);
    console.log(`statut: ${b.statut}  pointsStructure: ${b.pointsStructure}`);
    console.log(`limitation: ${b.limitation}`);
    console.log(`effetTexte: ${b.effetTexte}`);
    console.log(`coutConstruction: ${b.coutConstruction}`);
    const myCouts = couts.filter((c) => c.objetType === "Bâtiment" && c.objetId === id);
    console.log(`\nCouts (${myCouts.length}):`);
    for (const c of myCouts) {
      console.log(
        `  [${c.statut}] typeCout=${c.typeCout} composant=${c.composant} quantite=${c.quantite}  fragment="${c.fragment}"`
      );
    }
    const myEffets = effets.filter((e) => e.sourceType === "Bâtiment" && e.sourceId === id);
    console.log(`\nEffets (${myEffets.length}):`);
    for (const e of myEffets) {
      console.log(
        `  [${e.statut}] typeEffet=${e.typeEffet}  cible=${e.cible}  valeurNum=${e.valeurNum}  duree=${e.duree}  phase=${e.phase}`
      );
      console.log(`     texte: ${e.texte}`);
      if (e.condition) console.log(`     condition: ${e.condition}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
