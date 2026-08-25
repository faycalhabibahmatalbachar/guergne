"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { GraduationCap, Search, School, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { NavMainItem } from "@/navigation/sidebar/sidebar-items";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";

import { rechercheGlobale, type ResultatRecherche } from "../../_actions/recherche";

type SearchItem = {
  id: string;
  group: string;
  label: string;
  url: string;
  icon?: NavMainItem["icon"];
  disabled?: boolean;
  newTab?: boolean;
};

const sidebarGroupLabels = new Set(sidebarItems.flatMap((group) => (group.label ? [group.label] : [])));

function getSubItemGroup(groupLabel: string | undefined, itemTitle: string) {
  return sidebarGroupLabels.has(itemTitle) ? (groupLabel ?? "Other") : itemTitle;
}

const searchItems: SearchItem[] = sidebarItems.flatMap((group) =>
  group.items.flatMap((item) => {
    if (item.subItems) {
      return item.subItems.map((sub) => ({
        id: sub.id,
        group: getSubItemGroup(group.label, item.title),
        label: sub.title,
        url: sub.url,
        icon: item.icon,
        disabled: sub.disabled,
        newTab: sub.newTab,
      }));
    }
    return [
      {
        id: item.id,
        group: group.label ?? "Other",
        label: item.title,
        url: item.url,
        icon: item.icon,
        disabled: item.disabled,
        newTab: item.newTab,
      },
    ];
  }),
);

function getAvailableItems(items: SearchItem[]) {
  return items.filter((item) => !item.disabled && !item.url.includes("coming-soon"));
}

const recommendations = getAvailableItems(searchItems);

function groupBy(items: SearchItem[]) {
  const groups = [...new Set(items.map((item) => item.group))];
  return groups.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  }));
}

const ICONES = { eleve: GraduationCap, enseignant: UserCog, classe: School } as const;

/*
  cmdk REFILTRE côté client ce que le serveur a déjà trouvé, et son
  comparateur ignore les accents ni plus ni moins que JavaScript : « Grace »
  ne correspondrait pas à « Grâce », et la ligne trouvée par la base
  disparaîtrait de l'écran sans explication.

  On met donc dans `value` les DEUX formes du libellé, accentuée et non
  accentuée, plus le détail (matricule, classe). Quelle que soit la façon dont
  l'utilisateur tape, l'une des deux correspond.
*/
const sansAccents = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");
const TITRES = { eleve: "Élèves", enseignant: "Personnel", classe: "Classes" } as const;

export function SearchDialog() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [donnees, setDonnees] = React.useState<ResultatRecherche[]>([]);
  const [cherche, setCherche] = React.useState(false);
  const router = useRouter();

  /*
    La recherche dans les DONNÉES (E-39) est le geste réel : un parent au
    téléphone dit un nom, il faut ouvrir le dossier en trois secondes. Chercher
    des noms de pages, comme le faisait cette palette, ne donnait accès qu'à ce
    que le menu de gauche affiche déjà.

    Le délai de 250 ms est délibéré : sans lui, taper « MAHAMAT » lancerait sept
    requêtes dont six jetées. Avec, on en fait une.
  */
  React.useEffect(() => {
    if (!open || query.trim().length < 2) {
      setDonnees([]);
      setCherche(false);
      return;
    }
    setCherche(true);
    const minuteur = setTimeout(async () => {
      try {
        setDonnees(await rechercheGlobale(query));
      } catch {
        // Une recherche qui échoue ne doit pas casser la navigation : la
        // palette continue de servir ses raccourcis de pages.
        setDonnees([]);
      } finally {
        setCherche(false);
      }
    }, 250);
    return () => clearTimeout(minuteur);
  }, [open, query]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setQuery("");
      setDonnees([]);
    }
  };

  const handleSelect = (item: SearchItem) => {
    if (item.disabled) return;
    handleOpenChange(false);
    if (item.newTab) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    } else {
      router.push(item.url);
    }
  };

  const renderGroups = (items: SearchItem[]) =>
    groupBy(items).map(({ group, items: groupItems }, index) => (
      <React.Fragment key={group}>
        {index > 0 && <CommandSeparator />}
        <CommandGroup heading={group}>
          {groupItems.map((item) => (
            <CommandItem
              disabled={item.disabled}
              key={`${group}-${item.id}`}
              value={`${item.group} ${item.label}`}
              onSelect={() => handleSelect(item)}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.icon && <item.icon />}
                <span className="truncate">{item.label}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </React.Fragment>
    ));

  return (
    <>
      <Button
        onClick={() => handleOpenChange(true)}
        variant="link"
        className="px-0! font-normal text-muted-foreground hover:no-underline"
      >
        <Search data-icon="inline-start" />
        Search
        <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <Command>
          <CommandInput
            placeholder="Un élève, un matricule, une classe, une page…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {cherche ? "Recherche…" : "Aucun résultat."}
            </CommandEmpty>

            {/*
              Les données AVANT les pages : quand on tape un nom, ce qu'on
              cherche est une personne. Les raccourcis de navigation restent
              accessibles en dessous, mais ne doivent pas occuper la première
              ligne — celle que la touche Entrée valide.
            */}
            {donnees.length > 0
              ? (["eleve", "enseignant", "classe"] as const).map((type) => {
                  const lot = donnees.filter((d) => d.type === type);
                  if (lot.length === 0) return null;
                  const Icone = ICONES[type];
                  return (
                    <CommandGroup key={type} heading={TITRES[type]}>
                      {lot.map((d) => (
                        <CommandItem
                          key={d.id}
                          /* Unique — cmdk déduplique sur cette clé, et deux
                             homonymes se masqueraient l'un l'autre. */
                          value={[
                            d.type,
                            d.id,
                            d.libelle,
                            sansAccents(d.libelle),
                            d.detail ?? "",
                          ].join(" ")}
                          onSelect={() => {
                            handleOpenChange(false);
                            router.push(d.url);
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Icone />
                            <span className="truncate">{d.libelle}</span>
                            {d.detail ? (
                              <span className="text-muted-foreground truncate text-xs">
                                {d.detail}
                              </span>
                            ) : null}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  );
                })
              : null}

            {donnees.length > 0 ? <CommandSeparator /> : null}

            {query ? renderGroups(searchItems) : renderGroups(recommendations)}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
