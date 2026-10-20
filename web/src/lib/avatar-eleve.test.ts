import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avatarIllustreEleve, imageProfilEleve } from "./avatar-eleve";

describe("avatars illustrés des élèves", () => {
  const id = "3775fb65-bf7f-4601-b324-147a060e0011";

  it("retourne toujours le même avatar pour un élève", () => {
    assert.equal(avatarIllustreEleve(id, "M"), avatarIllustreEleve(id, "M"));
  });

  it("utilise les packs masculin, féminin et neutre", () => {
    assert.match(avatarIllustreEleve(id, "M"), /^\/avatars\/eleves\/m-(0[1-9]|1[0-6])\.svg$/);
    assert.match(avatarIllustreEleve(id, "F"), /^\/avatars\/eleves\/f-(0[1-9]|1[0-6])\.svg$/);
    assert.match(avatarIllustreEleve(id, null), /^\/avatars\/eleves\/n-0[1-8]\.svg$/);
    assert.match(avatarIllustreEleve(id, undefined), /^\/avatars\/eleves\/n-0[1-8]\.svg$/);
  });

  it("respecte la photo officielle en priorité", () => {
    assert.equal(
      imageProfilEleve({ id, sexe: "F", photoUrl: "/api/fichiers/photo-existante" }),
      "/api/fichiers/photo-existante",
    );
  });

  it("utilise l'illustration en absence de photo", () => {
    assert.equal(
      imageProfilEleve({ id, sexe: "F", photoUrl: null }),
      avatarIllustreEleve(id, "F"),
    );
    assert.equal(
      imageProfilEleve({ id, sexe: "M", photoUrl: "   " }),
      avatarIllustreEleve(id, "M"),
    );
  });

  it("n'expose pas de données personnelles dans l'URL", () => {
    const url = imageProfilEleve({ id, sexe: "M" });
    assert.ok(!url.includes(id));
    assert.ok(!url.includes("http"));
  });
});
