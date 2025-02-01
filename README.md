# Lexicon REST API

_Note: this project is a web interface for [Lexicon](https://github.com/osfarm/lexicon). Please consult its repository if you wish to contribute to the database._

Do you wish to contribute to this repo? [Read this](./CONTRIBUTING.md)

## I. Get started

### 1. Clone the repo

```sh
$ git clone https://github.com/osfarm/lexicon-rest-api.git
```

### 2. Fill the environment file with your credentials

```sh
$ cd ./lexicon-rest-api
$ nano .env
```

.env file structure:

```env
PORT=
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SCHEMA=
```

### 3. Install the dependencies

```sh
$ bun install
```

### 4. Start the server

```sh
$ bun start
```

## II. Hypermedia by design

The Lexicon REST API is RESTful, which means it is hypermedia by design.

Not only a same resource can be viewed in different formats, but loss of information between formats is made to be minimal: no matter the output format you choose, data are enriched with labels, translations, interpretations, and hyperlinks.

The output format can be changed by adding a extension to a path:

- `/viticulture/vine-varieties`
- `/viticulture/vine-varieties.json`
- `/viticulture/vine-varieties.csv`
