
---

# Lexicon REST API

Choisir la langue : [Français](#français) | [English](#english)

## Français

<a name="français"></a>

_Note : ce projet est une interface web pour [Lexicon](https://github.com/osfarm/lexicon). Veuillez consulter son dépôt si vous souhaitez contribuer à la base de données._

## I. Commencer

[Installez Bun si ce n'est pas déjà fait](https://bun.sh/)

### 1. Cloner le dépôt

```sh
$ git clone https://github.com/osfarm/lexicon-rest-api.git
```

### 2. Remplir le fichier d'environnement avec vos identifiants

```sh
$ cd ./lexicon-rest-api
$ touch .env
$ nano .env
```

Structure du fichier .env :

```env
PORT=
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SCHEMA=
```

### 3. Installer les dépendances

```sh
$ bun install
```

### 4. Démarrer le serveur

```sh
$ bun start
```

## II. Hypermedia par conception

L'API REST Lexicon est RESTful, ce qui signifie qu'elle est conçue avec l'hypermedia en tête.

Non seulement une même ressource peut être affichée dans différents formats, mais la perte d'information entre les formats est minimale : quel que soit le format de sortie choisi, les données sont enrichies avec des libellés, des traductions, des interprétations et des hyperliens.

Le format de sortie peut être modifié en ajoutant une extension à un chemin :

- `/viticulture/vine-varieties`
- `/viticulture/vine-varieties.json`
- `/viticulture/vine-varieties.csv`

## III. Informations Clés

### Moteur de l'API

Notre serveur HTTP utilise _Elysia_.

Il offre de nombreuses fonctionnalités, notamment un typage cohérent, la validation des entrées et le template JSX. Cependant, il impose certaines contraintes, comme un chaînage de méthodes intensif et des erreurs de typage parfois difficiles à résoudre.

### Gestion des erreurs

Ce projet utilise TypeScript, mais son système de gestion des erreurs est insuffisant.

Le mécanisme `try/catch` par défaut est inefficace et peu sûr. Contrairement à Java, TypeScript n'impose pas la gestion explicite des exceptions dans les signatures de fonction, ce qui permet aux erreurs de se propager sans contrôle et de provoquer des plantages.

Pour y remédier, nous utilisons une monade `Result`, qui force chaque fonction à retourner explicitement soit une valeur, soit une erreur, obligeant ainsi l'appelant à gérer correctement les erreurs.

Exemple :

```ts
import { Result, Ok, Err } from "shulk"

function divide(dividend: number, divisor: number): Result<Error, number> {
  if (divisor === 0) {
    return Err(new Error("Impossible de diviser par 0 !"))
  } else {
    return Ok(dividend / divisor)
  }
}

divide(10, 2)
  .map((value) => console.log("10 / 2 = " + value)) // Gère le succès
  .mapErr((error) => console.error(error)) // Gère l'erreur

const divisionResult = divide(6, 3).val // Type : 'Error | number'
```

### Polymorphisme et gestion d'état

Nous utilisons des unions étiquetées et du pattern matching pour manipuler des objets comme les éléments Hypermedia :

```ts
import { union, type InferUnion, match } from "shulk"

const Hypermedia = union<{
  Text: { label: string; value: string }
  Number: { label: string; value: number; unit?: string }
}>()
type Hypermedia = InferUnion<typeof Hypermedia>["any"]

function displayHypermedia(element: Hypermedia) {
  const serialized = match(element).case({
    Text: (element) => element.value,
    Number: (element) => element.value + " " + element.unit,
  })

  console
  log(serialized)
}

const textElement = Hypermedia.Text({ label: "My label", value: "My value" })
const numbeElement = Hypermedia.Number({
  label: "My label",
  value: 5,
  unit: "kg",
})

displayHypermedia(textElement) // -> "My value"
displayHypermedia(numberElement) // -> "5 kg"
```

[Documentation](https://shulk.org/docs/tagged-unions/)

### Relations de base de données

Les relations sont gérées en fusionnant les champs des tables en un seul objet. Elles doivent être déclarées manuellement dans la définition de la table.

Exemple :

```ts
interface CapParcel {
  id: string
  cap_crop_code: CapCode
  city_name: string
  shape: string
  centroid: string
  cap_code: string
  cap_label: string
  production: string
  cap_precision?: string
  cap_category?: string
  is_seed: boolean
  year: number
}

const CapParcelTable = Table<CapParcel>({
  table: "registered_graphic_parcels",
  primaryKey: "id",
  oneToOne: {
    cap_crop_code: {
      table: "master_crop_production_cap_codes",
      primaryKey: "cap_code",
    },
  },
})
```

### Traductions

Les traductions sont stockées dans `src/assets/translations.csv` pour faciliter leur lecture et modification.

_Avertissement_ : l'API ne recharge pas automatiquement les traductions lors de leur modification. Un redémarrage manuel du serveur est nécessaire.

### Template

Les représentations hypertextuelles des ressources utilisent des composants JSX.

**Important :** Les templates JSX _ne sont pas_ des composants React. Ils ne gèrent pas d'état frontend et sont directement convertis en HTML sur le serveur.

Exemple :

```tsx
interface Props {
  firstname: string
}

export function MyTemplate(props: Props) {
  return <div>Bonjour, {props.firstname} !</div>
}
```

## Guides pratiques

### Comment ajouter un namespace

1. Créez un fichier : `src/namespaces/[Namespace].ts`
2. Ajoutez les dépendances :

```ts
import Elysia, { t } from "elysia"
import { generateTablePage, type Context } from "../generateTablePage"
import type { Translator } from "../Translator"
```

3. Définissez les breadcrumbs et initialisez le namespace :

```ts
const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({ value: t("namespace_title"), method: "GET", href: "/namespace-slug" }),
]

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
```

4. Enregistrez le namespace dans `src/index.ts` :

```ts
import { NewNamespace } from "./namespaces/Namespace"

new Elysia()
  .group("", (app) =>
    app.use(NewNamespace)
  )
```

### Ajouter une page de liste

Une page de liste est utilisée comme table des matières pour un namespace. Il existe un template dédié pour cela.

Ajoutons une page de liste à notre namespace :

```ts
import { AutoList } from "../templates/AutoList" /// <-- Ajoutez cette ligne

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("namespace_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("namespace_resource_title"),
            method: "GET",
            href: "/namespace-slug/my-resource",
          }),
        ],
      },
    })
  )
```

### Ajouter une page de table

Les pages de table sont utilisées pour afficher les données sous forme de tableaux. Voici comment ajouter une page de table à notre namespace :

1. Déclarez un type représentant la ressource :

```ts
interface MyResource {
  id: string
  name: string
  status: "available" | "removed"
  created_at: Date
  list_of_things: string[]
}

const MyResourceTable = Table<MyResource>({
  table: "my_resource",
  primaryKey: "id",
})
```

2. Créez l'endpoint et appelez la fonction de génération de page :

```ts
import { generateTablePage, type Context } from "../generateTablePage"
import { Hypermedia, HypermediaList } from "../Hypermedia"

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  .get("/my-resource*", async (cxt: Context) =>
    generateTablePage(cxt, {
      title: cxt.t("namespace_resource_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: MyResourceTable(cxt.db).select().orderBy("name", "ASC"),
      columns: {
        name: cxt.t("common_fields_name"),
        status: cxt.t("namespace_resource_status"),
        date: cxt.t("common_fields_date"),
        "list-of-things": cxt.t("namespace_resource_list_of_things"),
      },
      handler: (resource) => ({
        name: Hypermedia.Text({
          label: cxt.t("common_fields_name"),
          value: resource.name,
        }),
        status: Hypermedia.Text({
          label: cxt.t("namespace_resource_status"),
          value: cxt.t("namespace_resource_status_" + resource.status),
        }),
        date: Hypermedia.Date({
          label: cxt.t("common_fields_date"),
          value: cxt.dateTimeFormatter.DateTime(resource.created_at),
          iso: resource.created_at.toISOString(),
        }),
        "list-of-things": HypermediaList({
          label: cxt.t("namespace_resource_list_of_things"),
          values: resource.list_of_things,
        }),
      }),
    })
  )
```

### Ajouter un filtrage et un formulaire

Vous pouvez ajouter des filtres à votre page de table afin d'aider les utilisateurs à trouver les données dont ils ont besoin.

```ts
import { Field } from "../templates/components/Form"

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  .get("/my-resource*", async (cxt: Context) =>
    generateTablePage(
      cxt,
      {
        form: {
          name: Field.Text({
            label: cxt.t("common_fields_name"),
            required: false,
          }),
          status: Field.Select({
            label: cxt.t("namespace_resource_status"),
            required: false,
            options: {
              available: cxt.t("namespace_resource_status_available"),
              removed: cxt.t("namespace_resource_status_removed"),
            },
          }),
        },
        formHandler: (input, query) => {
          if (input.name) {
            query.where("name", "LIKE", "%" + input.name + "%")
          }
          if (input.status) {
            query.where("status", "=", input.status)
          }
        },
      },
      {
        page: t.Number({ default: 1 }),
        name: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }
    )
  )
```

---




## English

<a name="english"></a>

_Note: This project is a web interface for [Lexicon](https://github.com/osfarm/lexicon). Please check its repository if you want to contribute to the database._

## I. Getting Started

[Install Bun if not already installed](https://bun.sh/)

### 1. Clone the repository

```sh
$ git clone https://github.com/osfarm/lexicon-rest-api.git
```

### 2. Populate the environment file with your credentials

```sh
$ cd ./lexicon-rest-api
$ touch .env
$ nano .env
```

Structure of the `.env` file:

```env
PORT=
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SCHEMA=
```

### 3. Install dependencies

```sh
$ bun install
```

### 4. Start the server

```sh
$ bun start
```

## II. Hypermedia by Design

The Lexicon REST API is RESTful, which means it is designed with hypermedia in mind.

Not only can the same resource be displayed in different formats, but information loss between formats is minimal: regardless of the chosen output format, the data is enriched with labels, translations, interpretations, and hyperlinks.

The output format can be changed by adding an extension to a path:

- `/viticulture/vine-varieties`
- `/viticulture/vine-varieties.json`
- `/viticulture/vine-varieties.csv`

## III. Key Information

### API Engine

Our HTTP server uses _Elysia_.

It provides many features, including consistent typing, input validation, and JSX template. However, it imposes certain constraints, such as intensive method chaining and occasionally difficult-to-resolve typing errors.

### Error Handling

This project uses TypeScript, but its error-handling system is insufficient.

The default `try/catch` mechanism is ineffective and unsafe. Unlike Java, TypeScript does not enforce explicit exception handling in function signatures, allowing errors to propagate unchecked and cause crashes.

To address this, we use a `Result` monad, which forces each function to explicitly return either a value or an error, thus requiring the caller to handle errors properly.

Example:

```ts
import { Result, Ok, Err } from "shulk"

function divide(dividend: number, divisor: number): Result<Error, number> {
  if (divisor === 0) {
    return Err(new Error("Cannot divide by 0!"))
  } else {
    return Ok(dividend / divisor)
  }
}

divide(10, 2)
  .map((value) => console.log("10 / 2 = " + value)) // Handles success
  .mapErr((error) => console.error(error)) // Handles error

const divisionResult = divide(6, 3).val // Type: 'Error | number'
```

### Polymorphism and State Management

We use tagged unions and pattern matching to handle objects like Hypermedia elements:

```ts
import { union, type InferUnion, match } from "shulk"

const Hypermedia = union<{
  Text: { label: string; value: string }
  Number: { label: string; value: number; unit?: string }
}>()
type Hypermedia = InferUnion<typeof Hypermedia>["any"]

function displayHypermedia(element: Hypermedia) {
  const serialized = match(element).case({
    Text: (element) => element.value,
    Number: (element) => element.value + " " + element.unit,
  })

  console.log(serialized)
}

const textElement = Hypermedia.Text({ label: "My label", value: "My value" })
const numbeElement = Hypermedia.Number({
  label: "My label",
  value: 5,
  unit: "kg",
})

displayHypermedia(textElement) // -> "My value"
displayHypermedia(numberElement) // -> "5 kg"
```

[Documentation](https://shulk.org/docs/tagged-unions/)

### Database Relations

Relations are handled by merging the fields from the tables into a single object. These must be manually declared in the table definition.

Example:

```ts
interface CapParcel {
  id: string
  cap_crop_code: CapCode
  city_name: string
  shape: string
  centroid: string
  cap_code: string
  cap_label: string
  production: string
  cap_precision?: string
  cap_category?: string
  is_seed: boolean
  year: number
}

const CapParcelTable = Table<CapParcel>({
  table: "registered_graphic_parcels",
  primaryKey: "id",
  oneToOne: {
    cap_crop_code: {
      table: "master_crop_production_cap_codes",
      primaryKey: "cap_code",
    },
  },
})
```

### Translations

Translations are stored in `src/assets/translations.csv` for easier reading and modification.

_Warning:_ The API does not automatically reload translations upon modification. A manual server restart is required.

### Template

The hypertextual representations of resources use JSX components.

**Important:** JSX templates are _not_ React components. They do not manage frontend state and are directly converted into HTML on the server.

Example:

```tsx
interface Props {
  firstname: string
}

export function MyTemplate(props: Props) {
  return <div>Hello, {props.firstname}!</div>
}
```

## Practical Guides

### How to Add a Namespace

1. Create a file: `src/namespaces/[Namespace].ts`
2. Add dependencies:

```ts
import Elysia, { t } from "elysia"
import { generateTablePage, type Context } from "../generateTablePage"
import type { Translator } from "../Translator"
```

3. Define breadcrumbs and initialize the namespace:

```ts
const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({ value: t("namespace_title"), method: "GET", href: "/namespace-slug" }),
]

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
```

4. Register the namespace in `src/index.ts`:

```ts
import { NewNamespace } from "./namespaces/Namespace"

new Elysia()
  .group("", (app) =>
    app.use(NewNamespace)
  )
```

### Adding a List Page

A list page is used as a table of contents for a namespace. There is a dedicated template for this.

Let’s add a list page to our namespace:

```ts
import { AutoList } from "../templates/AutoList" /// <-- Add this line

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  .get("/", ({ t }: Context) =>
    AutoList({
      page: {
        title: t("namespace_title"),
        breadcrumbs: [Breadcrumbs(t)[0]],
        links: [
          Hypermedia.Link({
            value: t("namespace_resource_title"),
            method: "GET",
            href: "/namespace-slug/my-resource",
          }),
        ],
      },
    })
  )
```

### Adding a Table Page

Table pages are used to display data in a tabular format. Here's how to add a table page to our namespace:

1. Declare a type for the resource:

```ts
interface MyResource {
  id: string
  name: string
  status: "available" | "removed"
  created_at: Date
  list_of_things: string[]
}

const MyResourceTable = Table<MyResource>({
  table: "my_resource",
  primaryKey: "id",
})
```

2. Create the endpoint and call the page generation function:

```ts
import { generateTablePage, type Context } from "../generateTablePage"
import { Hypermedia, HypermediaList } from "../Hypermedia"

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  .get("/my-resource*", async (cxt: Context) =>
    generateTablePage(cxt, {
      title: cxt.t("namespace_resource_title"),
      breadcrumbs: Breadcrumbs(cxt.t),
      query: MyResourceTable(cxt.db).select().orderBy("name", "ASC"),
      columns: {
        name: cxt.t("common_fields_name"),
        status: cxt.t("namespace_resource_status"),
        date: cxt.t("common_fields_date"),
        "list-of-things": cxt.t("namespace_resource_list_of_things"),
      },
      handler: (resource) => ({
        name: Hypermedia.Text({
          label: cxt.t("common_fields_name"),
          value: resource.name,
        }),
        status: Hypermedia.Text({
          label: cxt.t("namespace_resource_status"),
          value: cxt.t("namespace_resource_status_" + resource.status),
        }),
        date: Hypermedia.Date({
          label: cxt.t("common_fields_date"),
          value: cxt.dateTimeFormatter.DateTime(resource.created_at),
          iso: resource.created_at.toISOString(),
        }),
        "list-of-things": HypermediaList({
          label: cxt.t("namespace_resource_list_of_things"),
          values: resource.list_of_things,
        }),
      }),
    })
  )
```

### Adding Filtering and a Form

You can add filters to your table page to help users find the data they need.

```ts
import { Field } from "../templates/components/Form"

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  .get("/my-resource*", async (cxt: Context) =>
    generateTablePage(
      cxt,
      {
        form: {
          name: Field.Text({
            label: cxt.t("common_fields_name"),
            required: false,
          }),
          status: Field.Select({
            label: cxt.t("namespace_resource_status"),
            required: false,
            options: {
              available: cxt.t("namespace_resource_status_available"),
              removed: cxt.t("namespace_resource_status_removed"),
            },
          }),
        },
        formHandler: (input, query) => {
          if (input.name) {
            query.where("name", "LIKE", "%" + input.name + "%")
          }
          if (input.status) {
            query.where("status", "=", input.status)
          }
        },
      },
      {
        page: t.Number({ default: 1 }),
        name: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }
    )
  )
```