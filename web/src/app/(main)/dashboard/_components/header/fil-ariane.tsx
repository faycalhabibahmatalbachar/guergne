"use client";

import { Fragment } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { filAriane } from "@/navigation/fil-ariane";

/**
 * Fil d'Ariane de l'en-tête global.
 *
 * Il répond à la seule question que l'en-tête ne savait pas traiter : où
 * suis-je, et comment je remonte. Sous 768 px il se réduit à la page courante —
 * trois mailles sur un téléphone pousseraient la recherche hors de l'écran.
 */
export function FilAriane() {
  const chemin = usePathname();
  const mailles = filAriane(chemin);

  if (mailles.length === 0) return null;

  const derniere = mailles[mailles.length - 1];

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1 sm:gap-1.5">
        {mailles.map((maille, index) => {
          const estDerniere = index === mailles.length - 1;

          return (
            <Fragment key={`${maille.libelle}-${index}`}>
              <BreadcrumbItem className={estDerniere ? "min-w-0" : "hidden md:flex"}>
                {maille.url ? (
                  <BreadcrumbLink asChild>
                    <Link href={maille.url}>{maille.libelle}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate font-medium">{maille.libelle}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!estDerniere ? <BreadcrumbSeparator className="hidden md:block" /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>

      {/* Le lecteur d'écran reçoit le chemin complet même quand il est tronqué. */}
      <span className="sr-only">Page courante : {derniere.libelle}</span>
    </Breadcrumb>
  );
}
