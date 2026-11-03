-- =============================================================================
-- 0037 — Mémoire conversationnelle sécurisée de l'agent WhatsApp.
-- Les contenus sont chiffrés côté application (AES-256-GCM) ; aucun JID brut.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acteur_id uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'whatsapp' CHECK (canal = 'whatsapp'),
  peer_hash_version smallint NOT NULL DEFAULT 1 CHECK (peer_hash_version > 0),
  peer_hash text NOT NULL CHECK (peer_hash ~ '^[0-9a-f]{64}$'),
  statut text NOT NULL DEFAULT 'active' CHECK (statut IN ('active','closed','archived')),
  dernier_message_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canal, peer_hash_version, peer_hash)
);

CREATE TABLE IF NOT EXISTS public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  provider_message_id text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','system')),
  type_message text NOT NULL DEFAULT 'text' CHECK (type_message IN ('text','audio','image','document','location','other')),
  contenu_chiffre bytea,
  nonce_chiffrement bytea,
  tag_authentification bytea,
  version_cle smallint NOT NULL DEFAULT 1 CHECK (version_cle > 0),
  intention text,
  outil text,
  statut text NOT NULL DEFAULT 'received' CHECK (statut IN ('received','processed','sent','failed','ignored')),
  metadonnees jsonb NOT NULL DEFAULT '{}'::jsonb,
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CHECK (
    (contenu_chiffre IS NULL AND nonce_chiffrement IS NULL AND tag_authentification IS NULL)
    OR
    (contenu_chiffre IS NOT NULL AND nonce_chiffrement IS NOT NULL AND octet_length(nonce_chiffrement) = 12
     AND tag_authentification IS NOT NULL AND octet_length(tag_authentification) = 16)
  )
);

CREATE TABLE IF NOT EXISTS public.wa_conversation_state (
  conversation_id uuid PRIMARY KEY REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  intention_en_attente text,
  outil_en_attente text,
  parametres_chiffres bytea,
  nonce_chiffrement bytea,
  tag_authentification bytea,
  champs_manquants text[] NOT NULL DEFAULT ARRAY[]::text[],
  dernier_message_assistant_id uuid REFERENCES public.wa_messages(id) ON DELETE SET NULL,
  expire_le timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (parametres_chiffres IS NULL AND nonce_chiffrement IS NULL AND tag_authentification IS NULL)
    OR
    (parametres_chiffres IS NOT NULL AND nonce_chiffrement IS NOT NULL AND octet_length(nonce_chiffrement) = 12
     AND tag_authentification IS NOT NULL AND octet_length(tag_authentification) = 16)
  )
);

CREATE TABLE IF NOT EXISTS public.wa_memory_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acteur_id uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  resume_chiffre bytea NOT NULL,
  nonce_chiffrement bytea NOT NULL CHECK (octet_length(nonce_chiffrement) = 12),
  tag_authentification bytea NOT NULL CHECK (octet_length(tag_authentification) = 16),
  version_cle smallint NOT NULL DEFAULT 1 CHECK (version_cle > 0),
  nb_messages_source integer NOT NULL DEFAULT 0 CHECK (nb_messages_source >= 0),
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL DEFAULT (now() + interval '180 days')
);

CREATE TABLE IF NOT EXISTS public.wa_memory_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acteur_id uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  categorie text NOT NULL CHECK (categorie IN ('preference','procedure','contexte_non_sensible')),
  cle text NOT NULL CHECK (cle ~ '^[a-z0-9_.:-]{1,80}$'),
  valeur_chiffree bytea NOT NULL,
  nonce_chiffrement bytea NOT NULL CHECK (octet_length(nonce_chiffrement) = 12),
  tag_authentification bytea NOT NULL CHECK (octet_length(tag_authentification) = 16),
  version_cle smallint NOT NULL DEFAULT 1 CHECK (version_cle > 0),
  confiance numeric(4,3) NOT NULL DEFAULT 1.000 CHECK (confiance >= 0 AND confiance <= 1),
  importance smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  source text NOT NULL DEFAULT 'user_explicit' CHECK (source IN ('user_explicit','user_confirmed','conversation_inferred')),
  confirme_le timestamptz,
  expire_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (acteur_id, categorie, cle)
);

CREATE INDEX IF NOT EXISTS idx_wa_conversations_acteur_recent
  ON public.wa_conversations (acteur_id, dernier_message_le DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation_recent
  ON public.wa_messages (conversation_id, cree_le DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_messages_provider_id
  ON public.wa_messages (conversation_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_expiration
  ON public.wa_messages (expire_le);
CREATE INDEX IF NOT EXISTS idx_wa_conversation_state_expiration
  ON public.wa_conversation_state (expire_le);
CREATE INDEX IF NOT EXISTS idx_wa_summaries_acteur_recent
  ON public.wa_memory_summaries (acteur_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_wa_summaries_expiration
  ON public.wa_memory_summaries (expire_le);
CREATE INDEX IF NOT EXISTS idx_wa_facts_acteur_categorie
  ON public.wa_memory_facts (acteur_id, categorie);
