import Link from "next/link";
import type { Metadata } from "next";

import { ArrowLeft, KeyRound } from "lucide-react";

import { DemandeReinitialisation } from "../_components/demande-reinitialisation";
import { HabillageAuthentification } from "../_components/habillage-authentification";
import styles from "../connexion/connexion.module.css";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Demander un lien sécurisé de réinitialisation du mot de passe.",
};

export default function PageAssistanceConnexion() {
  return (
    <HabillageAuthentification regionLabel="Récupération de compte">
      <div className={styles.form}>
        <header className={styles.formHeading}>
          <div className={styles.recoveryEyebrow}>
            <KeyRound className="size-4" strokeWidth={1.9} aria-hidden="true" />
            <span>Récupération de compte</span>
          </div>
          <h1>Mot de passe oublié ?</h1>
          <p>
            Indiquez l&apos;adresse e-mail de votre compte pour recevoir un lien
            de réinitialisation sécurisé, valable 20 minutes.
          </p>
        </header>

        <DemandeReinitialisation />

        <nav className={styles.recoveryFooter} aria-label="Navigation de connexion">
          <Link href="/auth/connexion" className={styles.backLink}>
            <ArrowLeft className="size-4" strokeWidth={2} aria-hidden="true" />
            <span>Retour à la connexion</span>
          </Link>
        </nav>
      </div>
    </HabillageAuthentification>
  );
}
