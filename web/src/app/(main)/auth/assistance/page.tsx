import Link from "next/link";
import type { Metadata } from "next";

import { ArrowLeft } from "lucide-react";

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
            Saisissez l&apos;adresse e-mail associée à votre compte pour recevoir un lien de
            réinitialisation valable 20 minutes.
          </p>
        </header>
        <DemandeReinitialisation />
        <Link href="/auth/connexion" className={styles.backLink}>
          <ArrowLeft className="size-4" aria-hidden />
          Retour à la connexion
        </Link>
      </div>
    </HabillageAuthentification>
  );
}
