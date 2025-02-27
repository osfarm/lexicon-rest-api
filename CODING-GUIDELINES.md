# Lexicon coding style

## 1 - Formatting

All code formatting specification are inforced by the `.prettierrc` file. If you want to contribute without having to think about formatting, you should definitely install Prettier.

Otherwise, here are the rules we are using:

- **No semicolons.** They are distateful and don't bring anythig to the table.
- **2 spaces per indentation level.**
- **Print width of 90.** Most people use 80, but it gets a bit limiting at time, and 100 is defintely too much.
- **Use trailing commas**

## 2 - Naming

In programming, naming things requires good taste and judgement.

Be descriptive when naming variables and functions while avoiding noise words. If your name contains noisy and undescriptive words like `get`, or `set`, it's probably not a good name.

As for the case conventions:

- Constants names use UPPERCASE and are put on the upper part of the files
- Types names use PascalCase and are put on the upper part of the files
- Variables names use camelCase
- Most functions names use camelCase
- Constructor functions names use PascalCase
- Endpoints paths use kebab-case
- In JSON responses, keys use kebab-case

## 3 - Mutability

Safe and comprehensible come comes from clear and straightforward execution flows.

Immutability helps us reach this goal.

Use the `const` keyword when declaring a variable. If you think really need mutability, use the `let` keyword. **Never** use `var`.

When writing object types definitions, use the `Readonly<T>` wrapper to make its properties immutable too.

Avoid classes when you can, they tend to hide control flow and create confusion because they are difficult to write correctly.
Use types and functions instead.

## 4 - Functions

In programming, there are 2 types of functions: pure functions, and impure functions.

A pure function is a deterministic function that has no side-effect: what you see is what you get. No IO, no networking, nothing. For a given set of parameters, a pure functions always returnds the same value.
In a way, a pure function can always be replaced by a infinite-sized look-up table.

A pure function should have a declarative name, telling its user what is its utility.
e.g. we'll prefer `isEmail(): boolean` instead of `validateEmail(): boolean`

On the contrary, impure functions introduce side-effects and rely on IO and networking to work. A database layer is nothing more than a set of impure functions.
In Typescript, you can often identify an impure function witgh the keyword `async`. Most of the time, async functions rely on I/O operations, this is why they need to be asynchronous.
This notion introduces what we call "function coloring", where calling an `async` function makes its caller `async` too. The same goes with impure functions, where a function calling an impure function will always be impure too.

An impure function should have an imperative name, informing the user of the side-effects its introduces.
e.g. `database.read()`

## 5 - High-level assembly

Even though we use high-level languages, some developers still use low-level unsafe instructions.

If `goto` should be considered harmful, so should be any other instructions that break the flow of execution.

Avoid instructions such as `switch`, `break`, `continue`, as they introduce avoidable mistakes and disorganize the control flow.

Like anything in programming, you may someday need to use these, but until then, you should avoid them as much as you can.

## 6 - Comments

Like naming things, good comments require good taste and judgement too.

Instead of writing comments to explain how your code work, make your code clear enough so that other people can understand it just by reading it.

As a rule of thumb, never write comments to explain **how** the code works, but rather **why** it needs to be this way, and only when it is actually necessary.

## 7 - Git

New features and bud fixes should be developed in their own branch or in forks.

Commit messages should follow Git's recommendations:

```sh
A summary of 72 characters or less on the first line, written in an imperative manner

A detailed description of the changes and an explaination of design choices.
```

A properly formed git commit subject should always be able to complete the following sentence: "If applied, this commit will [your subject line here]"

e.g.

```sh
Add a cache for the database queries

To enhance the API response delay, we need to make heavy operations shorter.
As some of these operations are directly executed on the DB side, we need to add a cache to the API to avoid awaiting several seconds for information we ave already asked before.
```

Pull-requests should be compared to the `main` branch, and contain a descriptive message that summarize the changes and the design choices.

Once the pull-request is validated, the changes are ready to be included in production versions.

Production versions are created by tagging the `main` branch.

## 8 - User land is sacred

API versioning is a pain.
It makes things confusing for users, and it makes things harder for maintainers.
We should avoid versioning while we can.

Avoiding versioning is easy enough if we apply a simple rule: never break user space.
When a feature becomes public, it is there to stay forever. And when user start to rely on bugs, those bugs become features, and are there to stay forever too.

So, be careful what you make public.
Do not do things that will be difficult to undo.
