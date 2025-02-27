# Lexicon REST API

[Français](#français) | [English](#english)

## Français

_Note : ce projet est une interface web pour [Lexicon](https://github.com/osfarm/lexicon). Veuillez consulter son dépôt si vous souhaitez contribuer à la base de données._

Pour contribuer au Lexicon, voir [CONTRIBUTING.md](./CONTRIBUTING.md)

## I. Commencer

[Installez Bun si ce n'est pas déjà fait](https://bun.sh/)

### 1. Cloner le dépôt

```sh
$ git clone https://github.com/osfarm/lexicon-rest-api.git
```

### 2. Remplir le fichier d'environnement avec vos identifiants

```sh
$ cd ./lexicon-rest-api
$ cp .env.example .env
$ nano .env
```

Structure du fichier .env :

```env
HOST=0.0.0.0
PORT=8888
DB_HOST=lexicon.osfarm.org
DB_PORT=5432
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=lexicon
DB_SCHEMA=lexicon__6_0_0-ekyviti
```

### 3. Installer les dépendances

```sh
$ bun install
```

### 4. Démarrer le serveur

```sh
$ bun start
```

### 5. Accéder à l'application en local

Une fois le serveur démarré, ouvrez votre navigateur et accédez à :

```sh
http://localhost:8888
```

## II. Hypermedia par conception

L'API REST Lexicon est RESTful, ce qui signifie qu'elle est conçue avec l'hypermedia en tête.

Non seulement une même ressource peut être affichée dans différents formats, mais la perte d'information entre les formats est minimale : quel que soit le format de sortie choisi, les données sont enrichies avec des libellés, des traductions, des interprétations et des hyperliens.

Le format de sortie peut être modifié en ajoutant une extension à un chemin :

- `/viticulture/vine-varieties`
- `/viticulture/vine-varieties.json`
- `/viticulture/vine-varieties.csv`

---

## English

_Note: This project is a web interface for [Lexicon](https://github.com/osfarm/lexicon). Please check its repository if you want to contribute to the database._

To contribute to Lexicon, see [CONTRIBUTING.md](./CONTRIBUTING.md)

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
HOST=0.0.0.0
PORT=8888
DB_HOST=lexicon.osfarm.org
DB_PORT=5432
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=lexicon
DB_SCHEMA=lexicon__6_0_0-ekyviti
```

### 3. Install dependencies

```sh
$ bun install
```

### 4. Start the server

```sh
$ bun start
```

### 5. Access the application locally

Once the server is started, open your browser and navigate to:

```sh
http://localhost:8888
```

## II. Hypermedia by Design

The Lexicon REST API is RESTful, which means it is designed with hypermedia in mind.

Not only can the same resource be displayed in different formats, but information loss between formats is minimal: regardless of the chosen output format, the data is enriched with labels, translations, interpretations, and hyperlinks.

The output format can be changed by adding an extension to a path:

- `/viticulture/vine-varieties`
- `/viticulture/vine-varieties.json`
- `/viticulture/vine-varieties.csv`
