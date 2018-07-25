# mongo-migrator

[![NPM](https://nodei.co/npm/mongo-migrator.png?downloads=true&downloadRank=true)](https://nodei.co/npm/mongo-migrator/)

Yet another mongo migration toolset, but with a  focus on being easy to use and integrate.

>  Ideal choice when you quickly and painlessly want to add migrations to a project.

Uses  [MongoDB driver](http://mongodb.github.io/node-mongodb-native/) under-the-hood.

Features:

- Manages project migrations
- Allows installing and rollbacking migrations
- Easily integratable into existing project
- Configurable to your project structure
- Can be used trough command-line or as a module

## Installation

```bash
npm install -save-dev mongo-migrator
```

### Requirements

Node `>=8.0.0`

MongoDB `>=3.0.0`

## Usage 

As mention before `mongo-migrator` can be used both trough command-line or as module. The command line has all the functionality, so using the library as a module is only needed if your project requires it.

### Command-line

```bash
# Install all new migrations
mongo-migrator up --url mongodb://127.0.0.1:27017 --db my-database

# Remove down last batch of installed migrations
mongo-migrator down --url mongodb://127.0.0.1:27017 --db my-database 

# Remove all migrations
mongo-migrator down --url mongodb://127.0.0.1:27017 --db my-database --all

# To list all commands and available options 
mongo-migrator -h 
# or
mongo-migrator --help
```

### Module

```javascript
const path = require('path');
const Migrator = require('mongo-migrator');

const config = {
  url: 'mongodb://127.0.0.1:27017',
  database: 'my-database',
  // Folder location where the migration files are stored
  migrationFolder: path.resolve(__dirname, 'db/migrations')
};

const migrator = new Migrator(config);

// First need to create the database connection
await migrator.connect();


await migrator.up();

// Flag whether to remove all migrations
const removeAllMigrations = true;
await migrator.down(removeAllMigrations);
await migrator.close();

```

### Creating a migration

> TODO: documentation



## How it works

As software project develops database collection schemas often change. This is where migrations can help to version and store previous schema. (e.g., users collection needs to have a new collumn with an index).

To make this work it requires:

1. Migrations to bealways installed in the same order:

   - Migrations files must follow the following filename pattern:  `<epoch-timestamp>-<migration-name>.js`.  E.g. `1532435337-create-users-colletions.js`

   - New migrations must have a epoch timestamp that is newer then the last migration.

     > Note: This is done automatically when creating migration file trough command-line *(NOT YET IMPLEMENTED!)

2. To have a persistant (per database) record of installed migrations:

   `mongo-migrator` creates a collection called `migrations` *(can be configured with different name)* in the specificied database. It holds a record of already installed migrations.

   The collection has 2 columns:

   - `migrationName` - filename of a migration. E.g. `1532435337-create-users-colletions.js`

   -  `batch` - integer which increments with each *migration up* . It gives info which migrations where installed a previous *migration up*. Can be helpfull when you only want to *migrate down* only the last group of installed migrations rather than one by one

     > The batch number doesn't alwats increment when used. If a *migration down* is used then the batch number is released and will be reused in the next *migration up*.



`mongo-migrator` wraps this simple principle in a small api surface to make it super-easy to have migrations in your project!  🎉



## Testing

> 🚧 Work-in-progress creating tests

```bash
npm run test
```

## Contributing

All contributions welcomed 😊

Tasks to help out with:

- [ ] Improve usage documentation and document available api and it's arguments
- [ ] Tests
- [ ] Migration file creation trough cli
- [ ] Add database seeding capability
- [ ] Seed file creation trough cli

## License

License under MIT.
