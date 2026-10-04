# Things to know

[English](#english) | [Français](#français)

## English

### Error handling

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

### Polymorphism and state management

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

### DB relations

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

### Translations

Translations are stored in the file `src/assets/translations.csv`

We are using a CSV file for parsing and editing convenience.

_Warning_: The API will not automatically reload when you edit the translations file, so you'll have to restart the server manually.

### Templating

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

### Postgres schema permissions when upgrading the Lexicon version

When `DB_SCHEMA` is pointed at a newly imported Lexicon schema (e.g. switching from `lexicon__6_0_0-ekyviti` to `lexicon__6_0_2-full`), the API will crash with:

```
permission denied for schema <new-schema>
```

This is **not** an application bug. The schema name is interpolated raw into every query (`"${DB_SCHEMA}".<table>` in `src/Database.ts`), and Postgres rejects access as soon as the DB user lacks `USAGE` on the target schema. Permissions are per-schema in Postgres and are **not** inherited from older schemas — every Lexicon import requires the grants to be replayed.

Fix on the production DB (run as schema owner or superuser):

```sql
GRANT USAGE ON SCHEMA "lexicon__X_Y_Z-variant" TO <db_user>;
GRANT SELECT ON ALL TABLES IN SCHEMA "lexicon__X_Y_Z-variant" TO <db_user>;
-- so future tables in this schema inherit the right automatically:
ALTER DEFAULT PRIVILEGES IN SCHEMA "lexicon__X_Y_Z-variant"
  GRANT SELECT ON TABLES TO <db_user>;
```

The `pg` pool will pick up the new rights on its next connection — no app redeploy needed.

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

### Permissions Postgres lors d'une montée de version Lexicon

Quand `DB_SCHEMA` est basculé sur un nouveau schéma Lexicon importé (par exemple passage de `lexicon__6_0_0-ekyviti` à `lexicon__6_0_2-full`), l'API plante avec :

```
permission denied for schema <nouveau-schema>
```

Ce n'est **pas** un bug applicatif. Le nom du schéma est interpolé tel quel dans chaque requête (`"${DB_SCHEMA}".<table>` dans `src/Database.ts`), et Postgres refuse l'accès dès que l'utilisateur BDD n'a pas le droit `USAGE` sur le schéma cible. Les permissions sont **par schéma** sous Postgres et ne sont **pas** héritées des anciens schémas — chaque import Lexicon impose de rejouer les `GRANT`.

Correctif à appliquer sur la BDD de prod (en tant que propriétaire du schéma ou superuser) :

```sql
GRANT USAGE ON SCHEMA "lexicon__X_Y_Z-variant" TO <db_user>;
GRANT SELECT ON ALL TABLES IN SCHEMA "lexicon__X_Y_Z-variant" TO <db_user>;
-- pour que les futures tables de ce schéma héritent automatiquement du droit :
ALTER DEFAULT PRIVILEGES IN SCHEMA "lexicon__X_Y_Z-variant"
  GRANT SELECT ON TABLES TO <db_user>;
```

Le pool `pg` prend en compte les nouveaux droits dès la prochaine connexion — pas besoin de redéployer l'app.
