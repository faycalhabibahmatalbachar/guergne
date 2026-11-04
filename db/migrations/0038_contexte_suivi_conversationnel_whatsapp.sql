-- =============================================================================
-- 0038 — Contexte de suivi après une consultation WhatsApp.
-- Ne stocke ni le texte brut ni les résultats scolaires : uniquement le nom
-- de l'outil de lecture et des filtres de périmètre autorisés, chiffrés.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.wa_conversation_context (
  conversation_id uuid PRIMARY KEY
    REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  outil text NOT NULL CHECK (outil ~ '^[a-z0-9_.]{1,100}$'),
  parametres_chiffres bytea NOT NULL,
  nonce_chiffrement bytea NOT NULL CHECK (octet_length(nonce_chiffrement) = 12),
  tag_authentification bytea NOT NULL CHECK (octet_length(tag_authentification) = 16),
  version_cle smallint NOT NULL DEFAULT 1 CHECK (version_cle > 0),
  expire_le timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_context_expiration
  ON public.wa_conversation_context (expire_le);
