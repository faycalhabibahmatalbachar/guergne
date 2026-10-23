import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { APP_CONFIG } from "@/config/app-config";
import { sessionCourante } from "@/server/auth/session";

import { FormulaireConnexion } from "../_components/formulaire-connexion";
import styles from "./connexion.module.css";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Accès à l'administration du Lycée Guergné La Renaissance.",
};

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ change?: string }>;
}) {
  const principal = await sessionCourante();
  if (principal) redirect(principal.doitChangerMdp ? "/auth/mot-de-passe" : "/dashboard/default");
  const { change } = await searchParams;

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="Présentation du lycée">
        <div className={styles.brandHalo} aria-hidden="true" />
        <div className={styles.brandContent}>
          <div className={styles.logoFrame}>
            <Image
              src="/logo.svg"
              alt="Blason officiel du Lycée Guergné La Renaissance"
              width={104}
              height={104}
              className={styles.logo}
              priority
              unoptimized
            />
          </div>
          <h1 className={styles.schoolName}>{APP_CONFIG.nomComplet}</h1>
          <p className={styles.brandSubtitle}>
            <span aria-hidden="true" />
            Espace d&apos;administration
            <span aria-hidden="true" />
          </p>
          <div className={styles.goldRule} aria-hidden="true" />
          <p className={styles.motto}>
            ÉDUCATION <span aria-hidden="true">•</span> EXCELLENCE <span aria-hidden="true">•</span> AVENIR
          </p>
        </div>
        <div className={styles.campusVisual} aria-hidden="true" />
      </section>

      <section className={styles.loginPanel} aria-label="Formulaire d'authentification">
        <div className={styles.loginHalo} aria-hidden="true" />
        <div className={styles.loginCard}>
          {change ? (
            <p role="status" className={styles.changeNotice}>
              Mot de passe modifié. Reconnectez-vous avec le nouveau.
            </p>
          ) : null}
          <FormulaireConnexion />
        </div>
      </section>
    </main>
  );
}
