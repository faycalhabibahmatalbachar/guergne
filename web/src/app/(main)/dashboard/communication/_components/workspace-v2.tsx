"use client";

import { useState, useTransition } from "react";

import type { audienceQuote } from "@/server/domain/communication-v2";

import { commitCampaign, previewCampaign, suspendDispatch } from "../actions-v2";

interface Props {
  anneeId: string;
  draftKey: string;
  classes: Array<{ id: string; libelle: string }>;
}
type Quote = ReturnType<typeof audienceQuote>;

export function WorkspaceV2({ anneeId, draftKey, classes }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [classId, setClassId] = useState("");
  const [language, setLanguage] = useState<"fr" | "ar">("fr");
  const [notify, setNotify] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const [requestId, setRequestId] = useState("");
  function input() {
    return {
      anneeId,
      classeId: classId || null,
      title,
      body,
      language,
      notify,
      scheduledAt: scheduledAt ? new Date(`${scheduledAt}+01:00`).toISOString() : null,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      noExpiration: false,
    };
  }
  // Expiry is frozen across preview/commit. Rebuilding it would invalidate the digest.
  const [snapshot, setSnapshot] = useState<ReturnType<typeof input> | null>(null);
  function preview() {
    startTransition(async () => {
      try {
        const data = input();
        const next = await previewCampaign(data);
        setSnapshot(data);
        setQuote(next);
        setRequestId(crypto.randomUUID());
        setStatus("");
      } catch {
        setStatus("Aperçu indisponible. Vérifiez les champs, vos droits et la connexion.");
      }
    });
  }
  function publish() {
    if (!quote || !snapshot) return;
    startTransition(async () => {
      try {
        await commitCampaign(snapshot, quote.digest, true, requestId);
        setQuote(null);
        setTitle("");
        setBody("");
        sessionStorage.removeItem(draftKey);
        setStatus("Annonce enregistrée dans l’environnement de recette. Aucun envoi réel.");
      } catch {
        setQuote(null);
        setStatus("Enregistrement refusé. Recalculez l’aperçu et vérifiez le budget de recette.");
      }
    });
  }
  return (
    <section className="card" aria-labelledby="composer-title">
      <div className="card-header">
        <h2 id="composer-title" className="card-title">
          Composer une annonce
        </h2>
        <span className="status status-blue">Recette · sans envoi réel</span>
      </div>
      <div className="card-body">
        <p role="status" aria-live="polite">
          {status}
        </p>
        {!quote ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              preview();
            }}
            className="communication-form"
          >
            <div className="communication-fields">
              <label>
                Destinataires
                <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">Tout l’établissement</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Langue
                <select value={language} onChange={(e) => setLanguage(e.target.value as "fr" | "ar")}>
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                </select>
              </label>
            </div>
            <label>
              Titre
              <input
                required
                minLength={3}
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                dir={language === "ar" ? "rtl" : "auto"}
                lang={language}
              />
            </label>
            <label>
              Message
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                dir={language === "ar" ? "rtl" : "auto"}
                lang={language}
              />
            </label>
            <p>{body.length}/2000 caractères · expiration après 30 jours · tuteurs principaux, doublons exclus</p>
            <label>
              Diffusion programmée, heure du Tchad
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </label>
            <label className="communication-checkbox">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Préparer des notifications simulées, avec estimation avant confirmation
            </label>
            <div className="communication-actions">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Calcul…" : "Vérifier l’audience et le coût"}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  try {
                    sessionStorage.setItem(draftKey, JSON.stringify({ title, body, language, classId }));
                    setStatus("Brouillon conservé dans cet onglet jusqu’à sa fermeture.");
                  } catch {
                    setStatus("Stockage du brouillon indisponible.");
                  }
                }}
              >
                Conserver le brouillon
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  try {
                    const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
                    if (saved) {
                      setTitle(String(saved.title ?? "").slice(0, 150));
                      setBody(String(saved.body ?? "").slice(0, 2000));
                      setLanguage(saved.language === "ar" ? "ar" : "fr");
                      setClassId(String(saved.classId ?? ""));
                    }
                  } catch {
                    setStatus("Brouillon illisible.");
                  }
                }}
              >
                Restaurer
              </button>
            </div>
          </form>
        ) : (
          <div className="communication-review">
            <h3>Vérifier avant enregistrement</h3>
            <p>
              {quote.total} responsables · {quote.counts.duplicates} doublons exclus · {quote.counts.invalid} numéros à
              vérifier · {quote.counts.unreachable} non joignables
            </p>
            <p>
              {quote.counts.push} push · {quote.counts.sms} SMS · {quote.counts.inApp} dans l’application
            </p>
            <p>
              <strong>{quote.cost.toLocaleString("fr-FR")} FCFA (XAF) simulés</strong> · {quote.sms.encoding} ·{" "}
              {quote.sms.segments} segment(s) par SMS, signature comprise
            </p>
            <p>Sans notification cochée, aucun SMS ni push ne sera préparé.</p>
            <blockquote dir={snapshot?.language === "ar" ? "rtl" : "auto"}>
              <strong>{snapshot?.title}</strong>
              <p>{snapshot?.body}</p>
            </blockquote>
            <ul>
              {quote.recipients.map((r) => (
                <li key={r.key}>
                  {r.name} · {r.phone ?? "Application"} · {r.channel ?? "Non joignable"}
                </li>
              ))}
            </ul>
            <div className="communication-actions">
              <button type="button" className="btn btn-outline" disabled={pending} onClick={() => setQuote(null)}>
                Modifier
              </button>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={publish}>
                {pending ? "Enregistrement…" : "Confirmer l’enregistrement en recette"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="card-footer">
        <button
          type="button"
          className="btn btn-outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await suspendDispatch();
                setStatus("Tous les envois V2 sont suspendus.");
              } catch {
                setStatus("Suspension refusée : droits insuffisants ou service indisponible.");
              }
            })
          }
        >
          Suspendre tous les envois V2
        </button>
      </div>
    </section>
  );
}
