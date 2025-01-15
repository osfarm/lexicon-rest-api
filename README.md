# Lexicon REST API

_Note: this project is a web interface for [Lexicon](https://github.com/osfarm/lexicon). Please consult it if you wish to contribute to the database._

## Get started

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
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SCHEMA=
```

### 3. Install the dependencies

```sh
$ bun
```

### 4. Start the server

```sh
$ bun start
```
