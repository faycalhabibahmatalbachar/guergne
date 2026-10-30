import type { ReactNode } from "react";

import Image from "next/image";

import { APP_CONFIG } from "@/config/app-config";

import styles from "../connexion/connexion.module.css";

export function HabillageAuthentification({ children, regionLabel }: { children: ReactNode; regionLabel: string }) {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="Présentation du lycée">
        <Image
          src="/auth-campus-net.webp"
          alt=""
          fill
          sizes="(max-width: 1119px) 100vw, 46vw"
          className={styles.campusPhoto}
          priority
          unoptimized
          aria-hidden="true"
        />
        <div className={styles.brandOverlay} aria-hidden="true" />
        <div className={styles.brandContent}>
          <div className={styles.logoFrame}>
            <Image
              src={APP_CONFIG.logoUrl}
              alt="Blason du Lycée Guergné La Renaissance"
              width={128}
              height={128}
              className={styles.logo}
              priority
              unoptimized
            />
          </div>
          <p className={styles.schoolName}>{APP_CONFIG.nomComplet}</p>
          <p className={styles.brandSubtitle}>Espace d&apos;administration</p>
          <div className={styles.goldRule} aria-hidden="true" />
          <p className={styles.motto}>
            ÉDUCATION <span aria-hidden="true">•</span> EXCELLENCE <span aria-hidden="true">•</span> AVENIR
          </p>
        </div>
      </section>

      <section className={styles.loginPanel} aria-label={regionLabel}>
        <div className={styles.loginCard}>{children}</div>
      </section>
    </main>
  );
}
