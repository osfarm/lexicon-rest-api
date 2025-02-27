# Contributing

[Français](#français) | [English](#english)

## English

See also: [Coding Guidelines](./CODING-GUIDELINES.md)

### A few things to know

#### API engine

Our HTTP server engine is _Elysia_.

It is mostly fine and well conceived, giving us really nice things such as consistant typing, input validation, and JSX templating.

But is also comes with some constraints, such as big method chaining, and difficult to solve type errors sometimes.

#### Error handling

This is a TypeScript project, but there is something people may not realise about TypeScript, even when they work with it: error handling is terrible in this language.

In fact, it is so bad that the default way to handle errors — the try/catch clause — should be considered as a code smell.

Here is the problem with Typescript's try/catch clause: you not only get all the disavantages from this statement in other languages (slowing down the process speed), but you also do not get the security you get in other languages.

In Java, you know from a function's signature that it can throw an exception of a specific type. In Typescript, there is no way to add this information to the signature at all.

In Java, when you call a fallible function, the compiler forces you to handle the possible exception: either by adding the exception type in the signature, or by adding a `try/catch`. In Typescript the compiler doesn't force you to handle the error, it can just go up until it crashes your program without having you warned.

Default error handling in Typescript is basically putting `try/catch` everywhere and hope for the best, because you don't actually know what is going on.

So, what we do in this project is that we use a `Result` monad, which is a special type that can contains either a value or an error.

So, when we declare a fallible function in our code, instead of having a signature like `function fallibleFunction(): string` that makes us none the wiser, we have an explicit signature that tells us that the function can return an error `function fallibleFunction(): Result<Error, string>`

And then, when we will call the function, we will actually be forced by the compiler to handle the error.

Example:

```ts
import { Result, Ok, Err } from "shulk"

function divide(dividend: number, divisor: number): Result<Error, number> {
  if (divisor == 0) {
    return Err(new Error("Cannot divide by 0!"))
  } else {
    return Ok(dividend / divisor)
  }
}

divide(10, 2)
  .map((value) => console.log("10 / 2 = " + value)) // <-- Handles success case
  .mapErr((error) => console.error(err)) // <-- Handles failure case

const divisionResult = divide(6, 3).val // <-- Will be of type 'Error | number'
```

[Result monad documentation](https://shulk.org/docs/result/)

#### Polymorphism and state management

We use tagged unions and pattern matching to handle some objects, such as the Hypermedia elements:

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

[Tagged unions documentation](https://shulk.org/docs/tagged-unions/)

#### DB relations

Relations are handled, but in a clunky way for now. The fields of both tables are merged in a single object.

You'll have to declare the relation in the table definition.

Example with CAP registered parcels, which need a one-to-one with CAP codes:

```ts
interface CapParcel {
  // Parcel properties
  id: string
  cap_crop_code: CapCode
  city_name: string
  shape: string
  centroid: string
  // CAP code property
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

#### Translations

Translations are stored in the file `src/assets/translations.csv`

We are using a CSV file for parsing and editing convenience.

_Warning_: The API will not automatically reload when you edit the translations file, so you'll have to restart the server manually.

#### Templating

For the Hypertext representations of the resources, we are using JSX components.

**Remember this:** JSX templates _are not_ React components. They don't actually manage frontend state, they are converted to HTML code directly on the server, you cannot access any frontend feature from them.

JSX template example:

```tsx
interface Props {
  firstname: string
}

export function MyTemplate(props: Props) {
  const { firstname } = props

  return <div>Hello, {firstname}!</div>
}
```

### How to

#### How to add a namespace

1. Create a new file with path `src/namespaces/[Namespace name].ts`

2. Add the following dependencies:

```ts
import Elysia, { t } from "elysia"
import { generateTablePage, type Context } from "../page-generators/generateTablePage"
import type { Translator } from "../Translator"
```

3. Add a breadcrumbs generator function and initialize the API namespace

```ts
const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({
    value: t("home_title"),
    method: "GET",
    href: "/",
  }),
  Hypermedia.Link({
    value: t("namespace_title"),
    method: "GET",
    href: "/namespace-slug",
  }),
]

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
```

4. Add the namespace to the `src/index.ts` file:

```ts
import { Elysia, t } from "elysia"
import { NewNamespace } from "./namespaces/Namespace"

// [...]

new Elysia()
  // [...]
  .get("/", ({ t }) => Home({ t }))
  .get("/documentation*", ({ t, output }) => generateDocumentation(t, output))
  .guard({
    query: t.Object({ page: t.Number({ default: 1 }) }),
  })
  .use(NewNamespace) // <-- Add the namespace after the guard
  .use(GeographicalReferences)
  .use(Phytosanitary)
  .use(Viticulture)
  .use(Weather)
  .use(Credits)
```

#### How to add a list page

List pages are used as tables of contents for namespaces. There is a dedicated template that makes them easy to create.

Let's add a list page to our namespace:

```ts
import { AutoList } from "../templates/AutoList" /// <-- Add this

// [...]

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  // Add the code below
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
    }),
  )
```

#### How to add a table page

Table pages are the primary way data are presented through the API. To make them easier to create, there is a generator function that handles querying, pagination, and output format (Hypertext, JSON, and CSV)

Let's add a table page to our namespace!

1. Add a type representing the resource as it is returned by the DB (property mapping is deactivated for now)

```ts
interface MyResource {
  id: string
  name: string
  status: "availabe" | "removed"
  created_at: Date
  list_of_things: string[]
}

const MyResourceTable = Table<MyResource>({
  table: "my_resource",
  primaryKey: "id",
})
```

2. Create the endpoint and call the generator function

```ts
// Add these imports
import { generateTablePage, type Context } from "../generateTablePage"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { CreditTable } from "./Credits"

// [...]

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  // Add the code below
  // The '*' at the end of the path is necessary to handle multiple output formats
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
      credits: CreditTable(cxt.db).select().where("datasource", "=", "resource"),
    }),
  )
```

There are quite a few things to see, let's break it down:

- **title** is simply the title of the page
- **breadcrumbs** takes an array of Hypermedia.Link, it will help the user navigate the Lexicon. Here we call the Breadcrumbs generator function we wrote earlier and we pass it the `t` translator function in the API context `cxt`
- **query** takes a select query formed from the Table object we created earlier. The generator function will have to enrich it for pagination and filtering so we don't call the `run()` method before passing it.
- **columns** is a mapping between the columns identifiers of our table and the labels associated with them as `strings`.
- **handler** is a formatter function that will be applied for each entry from the query result. It has to return a mapping between the columns identifiers and `Hypermedia` objects.
- **credits** takes another select query from the `QueryTable`. It is used to display the source of the dataset. This is actually an optionnal argument, you don't actually need to give it to the function if the source is unknown.

#### How to add filtering and form

Now that we have our table function, let's add filters to help the users find the data they actually need.

```ts
// Add these imports
import { Field } from "../templates/components/Form"

// [...]

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
  // Add the code below
  .get("/my-resource*", async (cxt: Context) =>
    generateTablePage(
      cxt,
      {
        // [...]
        // Add the code below
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
      // Add the code below, it won't work if you don't
      {
        page: t.Number({ default: 1 }), // <-- This one is mandatory for pagination
        name: t.Optional(t.String()), // <-- This is for our form's name field
        status: t.Optional(t.String()), // <-- This is for our form's status field
      },
    ),
  )
```

So, here's what we have here:

- **form** which is the form definition, which is a mapping with fields names as keys and fields definitions as values
- **formHandler** which is the function that will be called on a form submit. It has a `input` parameter which contains the values entered by the user in the form, and a `query` parameter which is actually the `query` you provided earlier to the generator, which you can now complete with the form values.

### How to add a section in the Home page

Aller dans `src/templates/Home.tsx` et ajouter votre namespace avec une icone de votre choix au format svg (que vous placerez dans `public/icons`)

```tsx
<Cell width={6}>
  <a href="/<<namespace>>" style={SECTION_STYLE}>
    <img src={"/public/icons/<<your-icon.svg>>"} height={16} /> {t("<<namespace_title>>")}
  </a>
</Cell>
```

## Français

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
  Hypermedia.Link({
    value: t("namespace_title"),
    method: "GET",
    href: "/namespace-slug",
  }),
]

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" })
```

4. Enregistrez le namespace dans `src/index.ts` :

```ts
import { NewNamespace } from "./namespaces/Namespace"

new Elysia().group("", (app) => app.use(NewNamespace))
```

### Ajouter une page de liste

Une page de liste est utilisée comme table des matières pour un namespace. Il existe un template dédié pour cela.

Ajoutons une page de liste à notre namespace :

```ts
import { AutoList } from "../templates/AutoList" /// <-- Ajoutez cette ligne

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" }).get(
  "/",
  ({ t }: Context) =>
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
    }),
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

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" }).get(
  "/my-resource*",
  async (cxt: Context) =>
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
    }),
)
```

### Ajouter un filtrage et un formulaire

Vous pouvez ajouter des filtres à votre page de table afin d'aider les utilisateurs à trouver les données dont ils ont besoin.

```ts
import { Field } from "../templates/components/Form"

export const NewNamespace = new Elysia({ prefix: "/namespace-slug" }).get(
  "/my-resource*",
  async (cxt: Context) =>
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
      },
    ),
)
```

### Ajouter une entrée de menu

Aller dans `src/templates/Home.tsx` et ajouter votre namespace avec une icone de votre choix au format svg (que vous placerez dans `public/icons`)

```tsx
<Cell width={6}>
  <a href="/<<namespace>>" style={SECTION_STYLE}>
    <img src={"/public/icons/<<votre_icone.svg>>"} height={16} />{" "}
    {t("<<namespace_title>>")}
  </a>{" "}
</Cell>
```
