// What the page /contribute tells a contributor about `./lexicon contribute`, the review of a tabular
// contribution on the build side (lexicon, lib/lexicon/contribution/review.rb). The answers quoted here are
// the ones of that command: keep both in step.

export const REPOSITORY = "https://github.com/osfarm/lexicon"

export const SHEET_EXAMPLE = `description: Relevés d'humidité des sols par commune
author: Camille Martin, GAEC des Prés
source:
  name: Relevés de sondes capacitives
  url: https://exemple.org/sondes
  provider: GAEC des Prés
  licence: Licence Ouverte 2.0
  licence_url: https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf
  date: 2026-09-30
tables:
  - file: releves.csv
    key: id
    columns:
      id: text
      insee_code: text
      measured_on: date
      value: number
    pivots:
      insee_code: commune`

export const TABLE_EXAMPLE = `id,insee_code,measured_on,value
r1,17387,2026-09-01,12.5
r2,28085,2026-09-02,
r3,33063,2026-09-02,14`

export const REFUSAL_EXAMPLE = `  à corriger : La fiche garde pour « author » le texte du modèle, « Prénom Nom, organisme » : le remplacer.
  à corriger : « releves.csv », colonne « value » : 2 valeurs ne sont pas un nombre, avec un point pour les
               décimales (ligne 2 « 12,5 », ligne 5 « abc »).
  à corriger : « releves.csv » : 1 valeur de « id » revient plusieurs fois (r2).
[ NOK ] releves_sol : 3 points à corriger avant de proposer le jeu.`

export const ACCEPTANCE_EXAMPLE = `[  OK ] releves_sol peut être proposé (releves.csv → registered_releves_sol). Un mainteneur le construit
        et le publie avec ./lexicon ship releves_sol`

type Entry = { name: string; meaning: string }

export const SHEET_FIELDS: Entry[] = [
  {
    name: "description",
    meaning: "Une phrase qui dit ce que contient le jeu. Elle est affichée au catalogue.",
  },
  {
    name: "author",
    meaning:
      "Qui propose le jeu : une personne et son organisme. Ce nom figure dans les crédits.",
  },
  {
    name: "source.name, source.url, source.provider",
    meaning:
      "Le nom du jeu de données d'origine, l'adresse où on le trouve, et qui le publie.",
  },
  {
    name: "source.licence, source.licence_url",
    meaning:
      "La licence de la source et l'adresse de son texte. Une licence ouverte est attendue : Licence Ouverte, CC0, CC-BY, CC-BY-SA, ODbL. Sinon, ajouter « scope: members ».",
  },
  {
    name: "source.date",
    meaning: "La date des données, écrite AAAA-MM-JJ. Pas celle du dépôt.",
  },
  {
    name: "scope: members",
    meaning:
      "À écrire seulement pour réserver le jeu aux adhérents d'OSFarm. Sans cette ligne, le jeu est ouvert à tous.",
  },
  {
    name: "tables",
    meaning:
      "Une entrée par fichier CSV. Avec plusieurs fichiers, chacun devient une table registered_(jeu)_(fichier) ; « table: » permet de choisir un autre nom, qui commence par registered_.",
  },
  { name: "file", meaning: "Le nom du fichier CSV, placé dans le même dossier." },
  {
    name: "key",
    meaning:
      "La colonne qui identifie chaque ligne : jamais vide, jamais deux fois la même valeur.",
  },
  { name: "columns", meaning: "Chaque colonne du fichier, avec son type." },
  {
    name: "pivots",
    meaning:
      "Les colonnes qui portent un identifiant que le Lexicon connaît déjà. C'est ce qui relie le jeu aux autres.",
  },
  {
    name: "personal_data",
    meaning:
      "À remplir seulement si une colonne ressemble à une donnée personnelle (nom, prénom, courriel, téléphone, date de naissance, IBAN) : dire pourquoi elle peut être publiée.",
  },
]

export const TYPES: Entry[] = [
  { name: "text", meaning: "Un texte quelconque." },
  { name: "integer", meaning: "Un nombre entier, sans espace ni décimale : 30" },
  { name: "number", meaning: "Un nombre, avec un point pour les décimales : 12.5" },
  { name: "date", meaning: "Une date écrite AAAA-MM-JJ : 2026-09-30" },
  {
    name: "datetime",
    meaning: "Une date et une heure : 2025-12-04T17:00:53+01:00",
  },
  { name: "boolean", meaning: "true ou false" },
  {
    name: "point",
    meaning: "Un point géographique, latitude puis longitude : 48.811873,2.211849",
  },
]

export const PIVOTS: Entry[] = [
  { name: "commune", meaning: "Code INSEE de la commune : 17387" },
  {
    name: "commune_postal_code + commune_name",
    meaning:
      "Sans code INSEE : désigner la colonne du code postal et celle du nom de la commune. Le Lexicon ajoute une colonne insee_code avec le code trouvé.",
  },
  { name: "department", meaning: "Code du département : 17" },
  { name: "siren", meaning: "Numéro SIREN de l'entreprise, neuf chiffres" },
  { name: "siret", meaning: "Numéro SIRET de l'établissement, quatorze chiffres" },
  { name: "cadastral_parcel", meaning: "Identifiant de la parcelle cadastrale" },
  { name: "cap_crop_code", meaning: "Code culture de la PAC : BTH" },
  { name: "taxon", meaning: "Nom de référence du taxon dans la taxonomie du Lexicon" },
  { name: "production", meaning: "Nom de référence de la production dans le Lexicon" },
  { name: "weather_station", meaning: "Nom de référence de la station météorologique" },
  {
    name: "amm",
    meaning: "Numéro d'autorisation de mise sur le marché d'un produit phytosanitaire",
  },
  {
    name: "variant",
    meaning: "Nom de référence de l'article dans le référentiel des variantes",
  },
]

type Answer = { says: string; remedy: string }

// What the command answers about the sheet, and what to do
export const SHEET_ANSWERS: Answer[] = [
  {
    says: "Pas de fiche dataset.yml dans…",
    remedy:
      "Le dossier n'existe pas sous ce nom, ou sa fiche ne s'appelle pas dataset.yml. Vérifier le nom donné à la commande.",
  },
  {
    says: "La fiche ne se lit pas : …",
    remedy:
      "La fiche n'est pas un YAML valide : le plus souvent un retrait (des espaces, jamais de tabulation) ou un deux-points sans espace après lui. Repartir du modèle aide.",
  },
  {
    says: "Le dossier s'appelle « Relevés Sol » : son nom doit être en minuscules…",
    remedy: "Renommer le dossier : releves_sol.",
  },
  {
    says: "La fiche ne renseigne pas « source.url ».",
    remedy: "Remplir la rubrique nommée. Toutes celles de « source » sont attendues.",
  },
  {
    says: "La fiche garde pour « author » le texte du modèle…",
    remedy: "Remplacer le texte d'exemple du modèle par le vôtre.",
  },
  {
    says: "La licence « … » n'est pas une licence ouverte.",
    remedy:
      "Écrire le nom d'une licence ouverte si c'est bien celle de la source. Sinon ajouter « scope: members » : le jeu est alors réservé aux adhérents.",
  },
  {
    says: "La date de la source, « 30/09/2026 », doit être écrite AAAA-MM-JJ.",
    remedy: "Écrire 2026-09-30.",
  },
  {
    says: "La fiche ne décrit aucun fichier…",
    remedy: "Ajouter sous « tables » une entrée par fichier CSV.",
  },
  {
    says: "la fiche ne décrit aucune colonne.",
    remedy: "Lister sous « columns » chaque colonne du fichier et son type.",
  },
  {
    says: "la colonne « Code INSEE » doit être en minuscules, sans accent ni espace.",
    remedy: "Renommer la colonne, dans la fiche et dans le fichier : insee_code.",
  },
  {
    says: "la colonne « value » a le type « decimal », inconnu.",
    remedy: "Choisir un des cinq types : text, integer, number, date, boolean.",
  },
  {
    says: "la fiche doit nommer sous « key » la colonne qui identifie chaque ligne.",
    remedy: "Écrire sous « key » le nom d'une colonne décrite sous « columns ».",
  },
  {
    says: "le lien « insee_code: village » ne se comprend pas.",
    remedy:
      "Sous « pivots », la colonne doit exister et la clé être une de celles que le Lexicon connaît (liste plus haut).",
  },
  {
    says: "la colonne email ressemble à des données personnelles.",
    remedy:
      "Retirer la colonne, ou dire sous « personal_data » pourquoi elle peut être publiée.",
  },
  {
    says: "La table « … » doit s'appeler registered_… en minuscules.",
    remedy:
      "Corriger le nom donné sous « table: », ou retirer cette ligne ; avec plusieurs fichiers, leur donner des noms en minuscules, sans accent ni espace.",
  },
]

// What the command answers about a CSV file, and what to do
export const FILE_ANSWERS: Answer[] = [
  {
    says: "Le fichier « releves.csv » n'est pas dans le dossier.",
    remedy:
      "Placer le fichier à côté de la fiche, sous le nom exact écrit sous « file ».",
  },
  {
    says: "ne se lit pas comme un CSV en UTF-8, séparé par des virgules.",
    remedy:
      "Enregistrer de nouveau depuis le tableur : format CSV, encodage UTF-8, séparateur virgule (pas le point-virgule).",
  },
  {
    says: "est vide. / n'a que sa ligne de titres.",
    remedy: "Le fichier doit porter une ligne de titres, puis au moins une ligne.",
  },
  {
    says: "il manque la colonne depth, annoncée par la fiche.",
    remedy: "Ajouter la colonne au fichier, ou la retirer de la fiche.",
  },
  {
    says: "la colonne note n'est pas décrite dans la fiche.",
    remedy: "Décrire la colonne sous « columns », ou la retirer du fichier.",
  },
  {
    says: "colonne « value » : 2 valeurs ne sont pas un nombre… (ligne 2 « 12,5 »)",
    remedy:
      "Corriger les cases citées : un point pour les décimales, pas d'unité ni d'espace. Les numéros de ligne sont ceux du tableur ; trois lignes au plus sont citées.",
  },
  {
    says: "1 valeur n'est pas une date écrite AAAA-MM-JJ (ligne 3 « 01/10/2026 »)",
    remedy:
      "Écrire 2026-10-01. Dans un tableur, donner à la colonne le format AAAA-MM-JJ avant d'enregistrer.",
  },
  {
    says: "1 valeur n'est pas true ou false",
    remedy: "Remplacer oui, non, 1, 0 ou x par true ou false.",
  },
  {
    says: "2 lignes n'ont pas de valeur dans « id », qui doit identifier chaque ligne.",
    remedy: "Donner un identifiant à chaque ligne.",
  },
  {
    says: "1 valeur de « id » revient plusieurs fois (r2).",
    remedy:
      "Deux lignes portent le même identifiant : en changer un, ou retirer le doublon.",
  },
]

// What the command only points out: it does not block the contribution
export const NOTES: Answer[] = [
  {
    says: "La licence « CC-BY-SA 4.0 » impose le partage à l'identique…",
    remedy:
      "Rien à corriger : ce qui est tiré du jeu devra garder cette licence. Elle est rappelée au catalogue.",
  },
]
