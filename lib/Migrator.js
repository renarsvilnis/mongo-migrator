const {promisify} = require('util');
const path = require('path');
const glob = promisify(require('glob'));
const {MongoClient} = require('mongodb');
const merge = require('lodash.merge');

function getCurrentBatchFromList (dbMigrations) {
  return dbMigrations.reduce((maxBatch, dbRow) => Math.max(maxBatch, dbRow.batch), 0);
}

function filterActiveMigrations (dbMigrations, availableMigrations) {
  const migrationsToInstall = [];
  availableMigrations.forEach((availableMigration, i) => {
    const migrationName = path.basename(availableMigration);

    const dbMigrationIndex = dbMigrations.findIndex((dbM) => dbM.migration === migrationName);

    if (dbMigrationIndex === -1) {
      migrationsToInstall.push(availableMigration);
      return;
    }

    if (dbMigrationIndex !== i) {
      throw new Error('Migration found which epoch timestamp is older than already timestamps. Make sure new migrations have newer timestamps then currently installed');
    }

    // Skip migration as already installed
  });

  return migrationsToInstall;
}

class Migrator {
  constructor (options) {
    this.options = merge({}, this.constructor.defaultOptions, options);

    if (!this.options.url) {
      throw new Error('Missing MongoDB connection url');
    }

    if (!this.options.url) {
      throw new Error('Missing database name');
    }

    if (!this.options.collection) {
      throw new Error('Missing collection name');
    }

    this.client = null;
    this.db = null;
  }

  // ###########################################################################
  // Private API
  // ###########################################################################

  log () {
    // Only output log if user wants it
    if (!this.options.silent) {
      console.log(...arguments);
    }
  }

  async createCollectionIfNeeded () {
    const availablDbCollections = await this.db.listCollections().toArray();

    const hasCollection = (dbCollectionEntry) => dbCollectionEntry.name === this.options.collection;

    if (availablDbCollections.some(hasCollection)) {
      this.log('Skipping migration collection creations as collection already exists!');
      return;
    }

    this.log('Setting up migration collection!');

    await this.db.createCollection(this.options.collection);
    await this.db.collection(this.options.collection).createIndex(
      {migration: 1},
      {unique: true}
    );

    this.log('Migration collection was setup successfully');
  }

  // FS Migrations
  async getAvailableMigrations () {
    const pathToMigrations = path.resolve(this.options.migrationFolder, '*.js');
    const list = await glob(pathToMigrations);
    // Make sure migrations are sorted by timestamp as file names have this pattern "<epoch-timestamp>-<migration-name>"
    return list.sort();
  }

  // Database migrations
  async getDbMigrations () {
    // Already sorted by db index
    return this.db.collection(this.options.collection).find().toArray();
  }

  async removeMigration (migrationDBName, migrationFilePath) {
    const modulePath = path.resolve('.', migrationFilePath);
    const module = require(modulePath);

    await module.down(this.db);
    await this.db.collection(this.options.collection).remove({
      migration: migrationDBName
    });
  }

  // #############################################################################
  // Public API
  // #############################################################################

  async connect () {
    this.client = await MongoClient.connect(this.options.url, {useNewUrlParser: true});
    this.db = this.client.db(this.options.database);
  }

  async close () {
    await this.client.close();
  }

  async up () {
    await this.createCollectionIfNeeded();

    const [availableMigrations, dbMigrations] = await Promise.all([
      this.getAvailableMigrations(),
      this.getDbMigrations()
    ]);

    const currBatch = getCurrentBatchFromList(dbMigrations);
    const nextBatch = currBatch + 1;

    const migrationsToInstall = filterActiveMigrations(dbMigrations, availableMigrations);

    if (!migrationsToInstall.length) {
      this.log('No migrations installed!');
      return;
    }

    await Promise.all(migrationsToInstall.map(async (filepath) => {
      const modulePath = path.resolve('.', filepath);
      const module = require(modulePath);

      const migrationName = path.basename(modulePath);

      await module.up(this.db);
      await this.db.collection(this.options.collection).insertOne({
        migration: migrationName,
        batch: nextBatch
      });
      this.log(`Migration ${migrationName} installed!`);
    }));
  }

  async down (removeAllMigrations = false) {
    // await this.connect();
    const [availableMigrations, dbMigrations] = await Promise.all([
      this.getAvailableMigrations(),
      this.getDbMigrations()
    ]);

    const lastBatch = getCurrentBatchFromList(dbMigrations);

    const filteredDbMigrations = removeAllMigrations
      ? dbMigrations
      : dbMigrations.filter((dbMigration) => dbMigration.batch === lastBatch);

    if (!filteredDbMigrations.length) {
      this.log('No migrations removed!');
      return;
    }

    await Promise.all(filteredDbMigrations.map(async (dbMigration) => {
      const migrationName = dbMigration.migration;

      const migrationFileIndex = availableMigrations.findIndex((availableMigration) => {
        return path.basename(availableMigration) === migrationName;
      });

      if (migrationFileIndex === -1) {
        // TODO: add promt remove db entry anyway
        throw new Error('Database contains migration which doesn\'t match a migration file');
      }

      await this.removeMigration(migrationName, availableMigrations[migrationFileIndex]);

      this.log(`Migration ${migrationName} removed!`);
    }));
  }
}

Migrator.defaultOptions = {
  /**
   * Database connection url
   * @type string
   */
  url: null,
  /**
   * Name of database
   * @type string
   */
  database: null,
  /**
   * Migration collection name
   * @type string
   */
  collection: 'migrations',
  /**
   *
   */
  migrationFolder: './migrations',
  /**
   * Silence console output
   */
  silent: true
};

module.exports = Migrator;
