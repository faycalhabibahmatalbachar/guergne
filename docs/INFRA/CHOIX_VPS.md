# Choix d'un VPS pour l'agent WhatsApp — Lycée Guergné La Renaissance

Relevé des pages tarifaires **officielles** le 5 novembre 2026. Aucun chiffre de
ce document ne vient d'un site de comparaison : les premières recherches en
donnaient trois valeurs différentes pour la même offre, parfois à un facteur
trois. Les montants ci-dessous sont ceux imprimés par les fournisseurs eux-mêmes,
avec leur base de TVA telle qu'ils l'annoncent — et là où la page reste muette,
c'est écrit « non indiqué » plutôt que comblé.

---

## 1. Ce que la production a réellement consommé

Dimensionner d'après une estimation aurait été une erreur : nous avons des
mesures.

| Grandeur | Valeur mesurée sur Altare | Source |
|---|---|---|
| Mémoire au repos | 51–53 Mo utilisés, 68–70 Mo RSS | `[ressources]` au démarrage |
| Plafond mémoire du conteneur | 2355 Mo | `[ressources]` |
| Chromium sur disque | 352 Mo | relevé SFTP |
| Chromium à l'effondrement | **1,19 Go** de vidage mémoire | `core.104` |
| Modèles de voix résidents | 120,6 Mo (2 × 60,3 Mo) | relevé SFTP |
| Cœurs annoncés / **effectifs** | 4 / **1** | `coeursVisibles: 4`, `parallelismeDisponible: 1` |
| Synthèse de 303 caractères | **22 512 ms** pour 17,2 s d'audio | journal `voix` |
| Conversion OGG/Opus | 1 483 ms | journal `voix` |

Deux conclusions, et elles ne pointent pas dans la même direction.

**La mémoire n'est pas le problème.** L'agent au repos tient dans 70 Mo. Ce qui
consomme, c'est Chromium — et son vidage de 1,19 Go dit le pic qu'il faut
pouvoir absorber. 4 Go suffiraient sur le papier ; 8 Go laissent la marge que
l'effondrement observé rend nécessaire.

**Le processeur est le problème.** 22,5 secondes pour synthétiser 17 secondes de
parole, c'est 1,3 seconde de calcul par seconde d'audio. L'objectif annoncé —
une première note vocale en 5 secondes — est **hors d'atteinte sur un cœur
partagé**, quelle que soit la mémoire. C'est ce chiffre, et non le prix, qui
doit décider.

---

## 2. Les offres, telles que les pages les impriment

Toutes dans la classe 8 Go / ~4 vCPU, x86. Les colonnes disent ce que disent
les pages, y compris leurs silences.

| Fournisseur | Offre | vCPU | RAM | Disque | Trafic | Prix mensuel | Base | Sites |
|---|---|---:|---:|---|---|---:|---|---|
| **netcup** | **RS 1000 G12.5** | **4 dédiés** (EPYC 9645) | 8 Go | 128 Go NVMe | non indiqué | **21,73 €** HT / 25,00 € TTC | 19 % TVA, 12 mois | Vienne, Nuremberg, Manassas, Singapour |
| netcup | VPS 1000 G12.5 | 4 partagés | 8 Go | 128 Go SSD | inclus, quantité non indiquée | 14,50 € HT / 16,68 € TTC | 19 % TVA, 12 mois | + Amsterdam |
| **OVHcloud** | **VPS-2** | 4 vCores (partagés/dédiés non indiqué) | 8 Go | 75 Go NVMe | illimité, 1 Gbit/s | **« From $8.50 »** | TVA non indiquée, devise « $ » sans code | « many global locations », liste non donnée |
| Contabo | Cloud VPS 4 | 4 | 8 Go | 100 Go SSD | illimité (*fair use*), 200 Mbit/s | 5,50 € effectif | TTC, **tarif lié à 24 mois** ; frais d'installation sur contrat mensuel | 9 régions, 11 sites |
| Hetzner | CX33 | 4 partagés | 8 Go | 80 Go NVMe | 20 To | 8,99 € HT | **indisponible à la commande** | Nuremberg, Helsinki |
| Hetzner | CPX32 | 4 partagés | 8 Go | 160 Go NVMe | 20 To | 35,99 € HT | **indisponible à la commande** | Nuremberg, Helsinki |
| DigitalOcean | Basic Regular 8 GiB | 4 | 8 Gio | 160 Go SSD | 5 000 Gio | 48,00 $ | hors taxes | Amsterdam, Londres, Francfort |
| Akamai (Linode) | Linode 8 GB | 4 partagés | 8 Go | 160 Go | 5 To | 48,00 $ | hors taxes | non indiqué |
| Vultr | — | — | — | — | — | **non relevé** | la page tarifaire refuse la lecture automatisée (HTTP 403) | — |

### Ce que ce tableau apprend, et que le prix public cache

**Hetzner est hors jeu, et pas pour une raison de prix.** Les trois gammes dans
la plage utile — CX, CPX, CCX — affichent toutes « This product is currently
unavailable » sur le bouton de commande, et la catégorie « Cost-Optimized » est
marquée indisponible jusque sur la page d'accueil. Le CX33 à 8,99 € est le
meilleur rapport du tableau ; il n'est pas commandable. Le CPX32, lui, est
passé à 35,99 €.

**Contabo est le moins cher, et le plus engageant.** Les 5,50 € sont le taux
« effectif pour un abonnement de 24 mois, taxes comprises » — c'est la note de
bas de page du fournisseur, pas une interprétation. Un contrat mensuel coûte
plus cher et ajoute des frais d'installation sur cette offre précise. Et la page
ne dit **nulle part** si les cœurs sont dédiés : pour notre goulot, c'est
exactement l'information qui manque.

**OVHcloud affiche « From $8.50 » sans dire ni la TVA, ni l'engagement, ni si
les vCores sont partagés.** Trois silences sur une page tarifaire. La
sauvegarde quotidienne incluse est un vrai avantage, le trafic illimité à
1 Gbit/s aussi.

**netcup est le seul à écrire « dedicated cores » noir sur blanc**, avec le
modèle de processeur (AMD EPYC 9645) et une garantie de remboursement à
30 jours. C'est aussi le plus cher des quatre européens.

---

## 3. Latence depuis le Tchad

Le transit international du Tchad passe par l'Europe de l'Ouest — N'Djamena n'a
pas de câble côtier et dépend de ses voisins, puis de la France et de l'Italie.
Aucun fournisseur de cette liste n'a de site en Afrique centrale.

Conséquence pratique : **Nuremberg, Vienne, Francfort et les sites français se
valent à peu près**, et tous battent largement Singapour ou les États-Unis.
Ce n'est pas un critère discriminant entre les quatre européens.

Et il faut garder la mesure juste : l'agent répond sur WhatsApp, où la latence
du réseau compte pour quelques dizaines de millisecondes. **Face à 22 secondes
de synthèse, le choix du site est du bruit.**

---

## 4. Recommandation

### Principale — netcup RS 1000 G12.5, 21,73 € HT / mois

Parce qu'elle est la seule à répondre au défaut mesuré. Quatre cœurs
**dédiés** d'un EPYC 9645 contre le cœur unique et partagé d'Altare : c'est le
seul changement capable de faire passer la synthèse de 22 secondes à quelques
secondes. Les 128 Go de NVMe tiennent les 352 Mo de Chromium, les 120 Mo de
voix, les 200 Mo de paquets Python et les journaux sans jamais approcher la
saturation qui nous a occupés une nuit entière.

Le surcoût face à OVHcloud est d'environ 13 € par mois. À comparer à une soirée
de diagnostic.

### Alternative — OVHcloud VPS-2, « From $8.50 » / mois

Si le budget mensuel primait. Sauvegarde quotidienne incluse, trafic illimité,
NVMe. Mais les vCores ne sont pas annoncés comme dédiés : **le gain sur la
synthèse n'est pas garanti**, et c'était tout l'enjeu. À retenir si l'on accepte
de valider la performance après la mise en service plutôt qu'avant.

### Écartées, et pourquoi

- **Hetzner** : indisponible à la commande sur toute la plage utile.
- **Contabo** : 24 mois d'engagement pour le tarif affiché, cœurs non
  caractérisés, politique de trafic en « usage raisonnable ».
- **DigitalOcean, Akamai** : 48 $ pour des cœurs partagés, soit plus du double
  de netcup en cœurs dédiés.
- **Vultr** : non évalué, faute d'avoir pu lire sa page tarifaire.

### Ce qui reste à vérifier avant d'engager

1. **Mesurer la synthèse Piper sur plusieurs cœurs réels** avant d'acheter.
   L'environnement local (`infra/local/environnement.sh`) sert précisément à
   cela : si 4 cœurs ne font pas tomber les 22 secondes sous 5, aucun VPS de ce
   tableau ne le fera, et il faudra alors réduire le texte ou changer de voix
   plutôt que de serveur.
2. Le tarif OVHcloud dans la devise et avec la TVA applicables au Tchad, que la
   page ne donne pas.
3. La quantité de trafic incluse chez netcup, non indiquée.

**Aucun serveur n'a été commandé, loué ni provisionné.** Le plan de création et
de migration est dans [MIGRATION_VPS.md](MIGRATION_VPS.md).

---

## Sources

Pages officielles relevées le 5 novembre 2026 :

- [Hetzner Cloud](https://www.hetzner.com/cloud/) — et les pages
  [Regular Performance](https://www.hetzner.com/cloud/regular-performance/),
  [General Purpose](https://www.hetzner.com/cloud/general-purpose/),
  [Cost-Optimized](https://www.hetzner.com/cloud/cost-optimized/)
- [Contabo VPS](https://www.contabo.com/en/vps/)
- [OVHcloud VPS](https://www.ovhcloud.com/en/vps/)
- [netcup VPS](https://www.netcup.com/en/server/vps) et
  [netcup Root Server](https://www.netcup.com/en/server/root-server)
- [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets)
- [Akamai Cloud (Linode) — tarifs CPU](https://www.akamai.com/cloud/pricing/cpu)
- Vultr : [page tarifaire](https://www.vultr.com/pricing/) inaccessible (HTTP 403)
