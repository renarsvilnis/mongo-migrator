const {promisify} = require('util');
const path = require('path');
const glob = promisify(require('glob'));
const {MongoClient} = require('mongodb');
const merge = require('lodash.merge');

class Migrator {
  constructor (options) {
    this.options = merge({}, this.constructor.defaultOptions, options);
    this.client = null;
    this.db = null;
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
      return;
    }

    this.log('Setting up migration collection!');

    await this.db.createCollection(this.options.collection);
    await this.db.collection(this.options.collection).createIndex(
      {migration: 1},
      {unique: true}
    );
  }

  // FS Migrations
  async getAvailableMigrations () {
    const list = await glob('db/migrations/*.js');
    return list.sort();
  }

  // Database migrations
  async getDbMigrations () {
    // Already sorted by db index
    return this.db.collection(this.options.collection).find().toArray();
  }

  getCurrentBatchNumber (dbMigrations) {
    return dbMigrations.reduce((maxBatch, dbRow) => Math.max(maxBatch, dbRow.batch), 0);
  }

  filterActiveMigrations (dbMigrations, availableMigrations) {
    const migrationsToInstall = [];
    availableMigrations.forEach((availableMigration, i) => {
      const migrationName = path.basename(availableMigration);

      const exists = dbMigrations[i] && migrationName === dbMigrations[i].migration;

      // TODO: check if new migrations are older then currently installed else throw
      // TODO: improve detecion
      if (!exists) {
        migrationsToInstall.push(availableMigration);
      }
    });

    return migrationsToInstall;
  }

  async removeMigration (migrationDBName, migrationFilePath) {
    const modulePath = path.resolve('.', migrationFilePath);
    const module = require(modulePath);

    await module.down(this.db);
    await this.db.collection(this.options.collection).remove({
      migration: migrationDBName
    });
    await this.close();
  }

  async up () {
    // await this.connect();
    await this.createCollectionIfNeeded();

    const [availableMigrations, dbMigrations] = await Promise.all([
      this.getAvailableMigrations(),
      this.getDbMigrations()
    ]);

    const currBatch = this.getCurrentBatchNumber(dbMigrations);
    const nextBatch = currBatch + 1;

    const migrationsToInstall = this.filterActiveMigrations(dbMigrations, availableMigrations);

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

    const lastBatch = this.getCurrentBatchNumber(dbMigrations);

    const filteredDbMigrations = removeAllMigrations
      ? dbMigrations
      : dbMigrations.filter((dbMigration) => dbMigration.batch === lastBatch);

    if (!filteredDbMigrations.length) {
      this.log('No migrations removed!');
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

    await this.close();
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
