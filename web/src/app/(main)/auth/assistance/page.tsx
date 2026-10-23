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
    <HabillageAuthentification regionLabel="Réinitialisation du mot de passe">
      <div className={styles.form}>
        <header className={styles.formHeading}>
          <div className={styles.recoveryIntroIcon}>
            <KeyRound className="size-6" strokeWidth={1.8} aria-hidden="true" />
          </div>
          <h1>Mot de passe oublié ?</h1>
          <p>
            Saisissez l&apos;adresse e-mail associée à votre compte pour recevoir un
            lien de réinitialisation sécurisé, valable 20 minutes.
          </p>
        </header>
        <DemandeReinitialisation />
        <nav className={styles.recoveryFooter} aria-label="Retour au formulaire de connexion">
          <div className={styles.recoveryDivider} aria-hidden="true">OU</div>
          <Link href="/auth/connexion" className={styles.backLink}>
            <ArrowLeft className="size-4" strokeWidth={2.2} aria-hidden="true" />
            <span>Retour à la connexion</span>
          </Link>
        </nav>
      </div>
    </HabillageAuthentification>
  );
}
