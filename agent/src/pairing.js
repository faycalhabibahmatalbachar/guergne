/**
 * Pairing WhatsApp : capture du QR, sécurisation de l'accès, page d'appairage.
 *
 * Le QR d'une session WhatsApp est un SECRET D'AUTHENTIFICATION : quiconque le
 * scanne prend la main sur le numéro de l'établissement. Il n'apparaît donc
 * jamais dans les journaux, ne transite jamais dans une URL (les URLs finissent
 * dans les logs de proxy et l'historique du navigateur), et l'accès est révoqué
 * dès que la session est authentifiée.
 *
 * Le jeton d'accès est fourni par l'environnement (`PAIRING_TOKEN`) et comparé
 * à temps constant.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

/** Un QR WhatsApp vit une vingtaine de secondes ; on retient 60 s par prudence. */
const VALIDITE_MS = 60_000;
/** Au-delà, on considère que le visiteur s'acharne. */
const TENTATIVES_MAX = 10;
const FENETRE_TENTATIVES_MS = 5 * 60_000;

export class Pairing {
  constructor({ jeton, horloge = () => Date.now(), validiteMs = VALIDITE_MS } = {}) {
    this._jeton = jeton || null;
    this._horloge = horloge;
    this._validiteMs = validiteMs;
    this._qr = null; // { valeur, emisLe }
    this._authentifie = false;
    this._tentatives = new Map(); // origine -> horodatages des échecs
    this._brules = new Set(); // secrets déjà utilisés, jamais réacceptés
  }

  /** Le pairing n'est ouvert que s'il est configuré ET pas encore authentifié. */
  get actif() {
    return Boolean(this._jeton) && !this._authentifie;
  }

  get authentifie() {
    return this._authentifie;
  }

  /** Nouveau QR émis par WhatsApp : il remplace le précédent. */
  nouveauQr(valeur) {
    if (this._authentifie) return;
    this._qr = { valeur, emisLe: this._horloge() };
  }

  /**
   * Session authentifiée : le QR est détruit et le jeton **brûlé**.
   *
   * La révocation est définitive POUR CE SECRET. Une déconnexion ultérieure ne
   * doit pas ressusciter un jeton déjà utilisé : il a pu circuler (copié,
   * capturé dans une capture d'écran, laissé dans un presse-papier) et sa
   * réutilisation rouvrirait l'appairage à quiconque le détient encore.
   */
  marquerAuthentifie() {
    this._authentifie = true;
    this._qr = null;
    this._brules.add(this._jeton);
    this._jeton = null;
  }

  /**
   * Déconnexion WhatsApp. Le pairing NE redevient PAS possible tout seul :
   * il faut fournir un nouveau secret, donc une nouvelle autorisation humaine.
   */
  reinitialiser({ nouveauJeton = null } = {}) {
    this._authentifie = false;
    this._qr = null;
    if (nouveauJeton && !this._brules.has(nouveauJeton)) this._jeton = nouveauJeton;
    else this._jeton = null; // sans secret neuf, l'appairage reste fermé
  }

  get expire() {
    if (!this._qr) return true;
    return this._horloge() - this._qr.emisLe > this._validiteMs;
  }

  /** Millisecondes restantes, pour le compte à rebours de la page. */
  get resteMs() {
    if (!this._qr) return 0;
    return Math.max(0, this._validiteMs - (this._horloge() - this._qr.emisLe));
  }

  /** Valeur brute du QR — réservée à la génération de l'image, jamais journalisée. */
  valeurCourante() {
    if (this._authentifie || !this._qr || this.expire) return null;
    return this._qr.valeur;
  }

  /** État public : ne contient JAMAIS la valeur du QR. */
  etat() {
    if (this._authentifie) return { etat: "authentifie", qrDisponible: false, resteMs: 0 };
    if (!this._qr) return { etat: "attente", qrDisponible: false, resteMs: 0 };
    if (this.expire) return { etat: "expire", qrDisponible: false, resteMs: 0 };
    return { etat: "pret", qrDisponible: true, resteMs: this.resteMs };
  }

  /**
   * Vérifie un jeton, à temps constant, avec limitation des tentatives.
   * @returns {{ok:true}|{ok:false, raison:"non_configure"|"trop_de_tentatives"|"invalide"|"revoque"}}
   */
  verifier(fourni, { origine = "inconnue" } = {}) {
    if (this._authentifie) return { ok: false, raison: "revoque" };
    if (!this._jeton) return { ok: false, raison: "non_configure" };
    if (this._brules.has(String(fourni ?? ""))) return { ok: false, raison: "revoque" };

    const t = this._horloge();
    // Comptage PAR ORIGINE : un seul attaquant ne doit pas pouvoir verrouiller
    // l'appairage pour le personnel légitime.
    const passees = (this._tentatives.get(origine) ?? []).filter((x) => t - x < FENETRE_TENTATIVES_MS);
    if (passees.length >= TENTATIVES_MAX) {
      this._tentatives.set(origine, passees);
      return { ok: false, raison: "trop_de_tentatives" };
    }

    const a = Buffer.from(String(fourni ?? ""));
    const b = Buffer.from(this._jeton);
    const valide = a.length === b.length && timingSafeEqual(a, b);
    if (!valide) {
      passees.push(t);
      this._tentatives.set(origine, passees);
      return { ok: false, raison: "invalide" };
    }
    this._tentatives.delete(origine);
    return { ok: true };
  }
}

/** Jeton d'appairage aléatoire, si l'environnement n'en fournit pas. */
export function jetonAleatoire() {
  return randomBytes(24).toString("base64url");
}

/**
 * Page d'appairage. Le QR est chargé par une requête séparée authentifiée par
 * en-tête : il n'est pas incorporé dans le HTML, qui pourrait être mis en cache.
 */
export function pageAppairage({ etat = "attente", resteMs = 0 } = {}) {
  const messages = {
    attente: "Connexion à WhatsApp en cours…",
    pret: "Scannez ce code avec le téléphone secondaire",
    expire: "Code expiré — un nouveau code arrive",
    authentifie: "WhatsApp est connecté",
  };
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Appairage WhatsApp — LGR</title>
<style>
:root{--fond:#0f1115;--carte:#171a21;--texte:#e8eaed;--doux:#9aa0a6;--acc:#2f6feb;--ok:#1e8e3e;--alerte:#b06000}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--fond);color:var(--texte);
font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
.carte{background:var(--carte);border:1px solid #262b36;border-radius:16px;padding:32px;max-width:420px;width:100%;text-align:center}
h1{font-size:18px;margin:0 0 4px;letter-spacing:-.01em}
.sous{color:var(--doux);font-size:13px;margin:0 0 24px}
#zone{background:#fff;border-radius:12px;padding:16px;display:grid;place-items:center;min-height:300px}
#qr{width:100%;max-width:280px;height:auto;display:block}
.etat{margin-top:20px;font-size:14px}
.pastille{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:middle}
.p-attente{background:var(--doux)}.p-pret{background:var(--acc)}.p-expire{background:var(--alerte)}.p-authentifie{background:var(--ok)}
.compte{color:var(--doux);font-size:12px;margin-top:8px;font-variant-numeric:tabular-nums}
.vide{color:var(--doux);font-size:14px}
</style></head>
<body><main class="carte">
<h1>Lycée Guergné La Renaissance</h1>
<p class="sous">Appairage du numéro WhatsApp de l'établissement</p>
<div id="zone"><p class="vide" id="vide">${messages[etat] ?? ""}</p><img id="qr" alt="Code QR WhatsApp" hidden></div>
<p class="etat"><span class="pastille p-${etat}" id="pastille"></span><span id="msg">${messages[etat] ?? ""}</span></p>
<p class="compte" id="compte"></p>
</main>
<script>
// Le jeton reste en mémoire : jamais dans l'URL, jamais dans le stockage local.
const jeton = new URLSearchParams(location.hash.slice(1)).get("t") || "";
history.replaceState(null, "", location.pathname);
const M = ${JSON.stringify(messages)};
const $ = (i) => document.getElementById(i);
let reste = ${resteMs};
let urlCourante = null;
async function rafraichir() {
  try {
    const r = await fetch("/pairing/etat", { headers: { "x-pairing-token": jeton }, cache: "no-store" });
    if (!r.ok) { $("msg").textContent = r.status === 401 ? "Accès refusé" : "Service indisponible"; return; }
    const e = await r.json();
    $("pastille").className = "pastille p-" + e.etat;
    $("msg").textContent = M[e.etat] ?? e.etat;
    reste = e.resteMs;
    if (e.qrDisponible) {
      const img = await fetch("/pairing/qr", { headers: { "x-pairing-token": jeton }, cache: "no-store" });
      if (img.ok) {
        const b = await img.blob();
        const u = URL.createObjectURL(b);
        // Liberer l'URL precedente : sans cela chaque rafraichissement laisse
        // un Blob en memoire, et la page gonfle au fil des heures.
        if (urlCourante) URL.revokeObjectURL(urlCourante);
        urlCourante = u;
        $("qr").src = u; $("qr").hidden = false; $("vide").hidden = true;
      }
    } else {
      $("qr").hidden = true; $("vide").hidden = false; $("vide").textContent = M[e.etat] ?? "";
      if (urlCourante) { URL.revokeObjectURL(urlCourante); urlCourante = null; }
    }
    if (e.etat === "authentifie") { $("compte").textContent = "Cette page n'est plus nécessaire."; clearInterval(boucle); }
  } catch { $("msg").textContent = "Connexion au service perdue"; }
}
setInterval(() => { if (reste > 0) { reste -= 1000; $("compte").textContent = "Expire dans " + Math.ceil(reste/1000) + " s"; } }, 1000);
const boucle = setInterval(rafraichir, 3000);
rafraichir();
</script></body></html>`;
}
