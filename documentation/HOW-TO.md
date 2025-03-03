# How to

[English](#english) | [Français](#français)

## English

### How to add a namespace

1. Create a new file with path `src/namespaces/[Namespace name].ts`

2. Add the following dependencies:

```ts
import { API } from "../API"
import { generateTablePage } from "../page-generators/generateTablePage"
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

export const NewNamespace = API.new()
```

4. Add the namespace to the `src/index.ts` file:

```ts
import { API } from "./API"
import { NewNamespace } from "./namespaces/Namespace"

// [...]

API.new()
  .path("/", ({ t }) => Home({ t }))
  .path("/documentation", ({ t, output }) => generateDocumentation(t, output))
  .use(NewNamespace) // <-- Add the namespace after the guard
  .use(GeographicalReferences)
  .use(Phytosanitary)
  .use(Viticulture)
  .use(Weather)
  .use(Credits)
```

### How to add a list page

List pages are used as tables of contents for namespaces. There is a dedicated template that makes them easy to create.

Let's add a list page to our namespace:

```ts
import { AutoList } from "../templates/AutoList" /// <-- Add this

// [...]

export const NewNamespace = API.new()
  // Add the code below
  .path("/namespace-slug", ({ t }) =>
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

### How to add a table page

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
import { generateTablePage } from "../generateTablePage"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { CreditTable } from "./Credits"

// [...]

export const NewNamespace = API.new()
  // Add the code below
  .path("/namespace-slug/my-resource", async (cxt) =>
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

### How to add filtering and form

Now that we have our table function, let's add filters to help the users find the data they actually need.

```ts
// Add these imports
import { Field } from "../templates/components/Form"

// [...]

export const NewNamespace = API.new()
  // Add the code below
  .path("/namespace-slug/my-resource", async (cxt) =>
    generateTablePage(cxt, {
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
    }),
  )
```

So, here's what we have here:

- **form** which is the form definition, which is a mapping with fields names as keys and fields definitions as values
- **formHandler** which is the function that will be called on a form submit. It has a `input` parameter which contains the values entered by the user in the form, and a `query` parameter which is actually the `query` you provided earlier to the generator, which you can now complete with the form values.

### How to add a section in the Home page

Go to `src/templates/Home.tsx` and add the code below, with an icon (which you will save in the `public/icons` directory)

```tsx
<Cell width={6}>
  <SectionLink href="/<<your namespace>>" icon-left="/public/icons/<<your icon>>.svg">
    {t("label")}
  </SectionLink>
</Cell>
```

## Français

### Comment ajouter un namespace

1. Créez un fichier : `src/namespaces/[Namespace].ts`
2. Ajoutez les dépendances :

```ts
import { API } from "./API"
import { generateTablePage } from "../generateTablePage"
import type { Translator } from "../Translator"
```

3. Définissez le fil d'Ariane et initialisez le namespace :

```ts
const Breadcrumbs = (t: Translator) => [
  Hypermedia.Link({ value: t("home_title"), method: "GET", href: "/" }),
  Hypermedia.Link({
    value: t("namespace_title"),
    method: "GET",
    href: "/namespace-slug",
  }),
]

export const NewNamespace = API.new()
```

4. Enregistrez le namespace dans `src/index.ts` :

```ts
import { API } from "./API"
import { NewNamespace } from "./namespaces/Namespace"

// [...]

API.new()
  .path("/", ({ t }) => Home({ t }))
  .path("/documentation", ({ t, output }) => generateDocumentation(t, output))
  .use(NewNamespace) // <-- Add the namespace after the guard
  .use(GeographicalReferences)
  .use(Phytosanitary)
  .use(Viticulture)
  .use(Weather)
  .use(Credits)
```

### Ajouter une page de liste

Une page de liste est utilisée comme table des matières pour un namespace. Il existe un template dédié pour cela.

Ajoutons une page de liste à notre namespace :

```ts
import { AutoList } from "../templates/AutoList" /// <-- Add this

// [...]

export const NewNamespace = API.new()
  // Add the code below
  .path("/namespace-slug", ({ t }) =>
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
// Add these imports
import { generateTablePage } from "../generateTablePage"
import { Hypermedia, HypermediaList } from "../Hypermedia"
import { CreditTable } from "./Credits"

// [...]

export const NewNamespace = API.new()
  // Add the code below
  .path("/namespace-slug/my-resource", async (cxt) =>
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

### Ajouter un filtrage et un formulaire

Vous pouvez ajouter des filtres à votre page de table afin d'aider les utilisateurs à trouver les données dont ils ont besoin.

```ts
// Add these imports
import { Field } from "../templates/components/Form"

// [...]

export const NewNamespace = API.new()
  // Add the code below
  .path("/namespace-slug/my-resource", async (cxt) =>
    generateTablePage(cxt, {
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
    }),
  )
```

### Ajouter une entrée de menu

Aller dans `src/templates/Home.tsx` et ajouter votre namespace avec une icone de votre choix au format svg (que vous placerez dans `public/icons`)

```tsx
<Cell width={6}>
  <SectionLink href="/<<your namespace>>" icon-left="/public/icons/<<your icon>>.svg">
    {t("label")}
  </SectionLink>
</Cell>
```
