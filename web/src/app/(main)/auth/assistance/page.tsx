import Link from "next/link";

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

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
          <h1>Mot de passe oublié ?</h1>
          <p>
            Saisissez votre adresse e-mail professionnelle. Nous vous enverrons les instructions pour définir un nouveau
            mot de passe.
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
