const {promisify} = require('util');
const path = require('path');
const glob = promisify(require('glob'));

const MIGRATION_COLLECTION_NAME = 'migrations';

const mongo = require('../lib/mongo');

async function createCollectionIfNeeded () {
  const dbCollections = await mongo.db.listCollections().toArray();

  const hasCollection = (dbCollectionEntry) => dbCollectionEntry.name === MIGRATION_COLLECTION_NAME;

  if (dbCollections.some(hasCollection)) {
    return;
  }

  console.log('Setting up migration collection!');

  await mongo.db.createCollection(MIGRATION_COLLECTION_NAME);
  await mongo.db.collection(MIGRATION_COLLECTION_NAME).createIndex(
    {migration: 1},
    {unique: true}
  );
}

async function getAvailableMigrations () {
  const list = await glob('db/migrations/*.js');
  return list.sort();
}

async function getDbMigrations () {
  return mongo.db.collection(MIGRATION_COLLECTION_NAME).find().toArray();
}

function getCurrentMigrationBatch (dbMigrations) {
  return dbMigrations.reduce((maxBatch, dbRow) => Math.max(maxBatch, dbRow.batch), 0);
}

function filterActiveMigrations (dbMigrations, availableMigrations) {
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

async function removeMigration (migrationDBName, migrationFilePath) {
  const modulePath = path.resolve('.', migrationFilePath);
  const module = require(modulePath);

  await module.down(mongo);
  await mongo.db.collection(MIGRATION_COLLECTION_NAME).remove({
    migration: migrationDBName
  });
  await mongo.close();
}

async function up () {
  await mongo.connect();
  await createCollectionIfNeeded();

  const [availableMigrations, dbMigrations] = await Promise.all([
    getAvailableMigrations(),
    getDbMigrations()
  ]);

  const currBatch = getCurrentMigrationBatch(dbMigrations);
  const nextBatch = currBatch + 1;

  const migrationsToInstall = filterActiveMigrations(dbMigrations, availableMigrations);

  if (!migrationsToInstall.length) {
    console.log('No migrations installed!');
    return;
  }

  await Promise.all(migrationsToInstall.map(async (filepath) => {
    const modulePath = path.resolve('.', filepath);
    const module = require(modulePath);

    const migrationName = path.basename(modulePath);

    await module.up(mongo);
    await mongo.db.collection(MIGRATION_COLLECTION_NAME).insertOne({
      migration: migrationName,
      batch: nextBatch
    });
    console.log(`Migration ${migrationName} installed!`);
  }));
}

async function down (removeAllMigrations = false) {
  await mongo.connect();
  const [availableMigrations, dbMigrations] = await Promise.all([
    getAvailableMigrations(),
    getDbMigrations()
  ]);

  const lastBatch = getCurrentMigrationBatch(dbMigrations);

  const filteredDbMigrations = removeAllMigrations
    ? dbMigrations
    : dbMigrations.filter((dbMigration) => dbMigration.batch === lastBatch);

  if (!filteredDbMigrations.length) {
    console.log('No migrations removed!');
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

    await removeMigration(migrationName, availableMigrations[migrationFileIndex]);

    console.log(`Migration ${migrationName} removed!`);
  }));

  await mongo.close();
}
