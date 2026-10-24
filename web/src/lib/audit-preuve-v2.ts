/** Liste rouge stricte avant écriture en base, pas seulement dans l'interface. */
const REFUSE=/password|mot.?de.?passe|passe|secret|token|jeton|cle|(?:api|access|refresh).?key|auth|cookie|session|hash|signature|credential|otp|pin|adresse|telephone|phone|naissance|medical|sante|iban|carte|cvv|photo|fichier|justificatif|observations|commentaire|appreciation|referenceexterne|nompayeur/i;
export function valeursAuditSures(input:unknown):Record<string,string|number|boolean|null>|null {
  if(input===null||input===undefined)return null;
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("La preuve doit être un objet de valeurs simples.");
  const r:Record<string,string|number|boolean|null>={};
  for(const [key,value] of Object.entries(input).slice(0,40)){
    if(!/^[A-Za-z0-9_]{1,60}$/.test(key)||REFUSE.test(key))continue;
    if(value===null){r[key]=null;continue;}
    if(typeof value==="boolean"){r[key]=value;continue;}
    if(typeof value==="number"&&Number.isFinite(value)){r[key]=value;continue;}
    if(typeof value==="string"&&!/Bearer\s+\S+|(?:sk-|re_)[A-Za-z0-9]{12,}|-----BEGIN /i.test(value))r[key]=value.slice(0,150);
  }
  return r;
}
