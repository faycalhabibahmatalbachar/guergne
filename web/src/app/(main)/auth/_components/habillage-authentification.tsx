import Image from "next/image";
import type { ReactNode } from "react";

import { APP_CONFIG } from "@/config/app-config";

import styles from "../connexion/connexion.module.css";

export function HabillageAuthentification({
  children,
  regionLabel,
}: {
  children: ReactNode;
  regionLabel: string;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="Présentation du lycée">
        <div className={styles.brandHalo} aria-hidden="true" />
        <div className={styles.brandContent}>
          <div className={styles.logoFrame}>
            <Image
              src="/logo-officiel.webp"
              alt="Blason officiel du Lycée Guergné La Renaissance"
              width={104}
              height={88}
              className={styles.logo}
              priority
              unoptimized
            />
          </div>
          <p className={styles.schoolName}>{APP_CONFIG.nomComplet}</p>
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
      </section>
      <section className={styles.loginPanel} aria-label={regionLabel}>
        <div className={styles.loginHalo} aria-hidden="true" />
        <div className={styles.loginCard}>{children}</div>
      </section>
    </main>
  );
}
