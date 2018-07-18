#!/usr/bin/env node

const program = require('commander');

const {version} = require('../package.json');
const Migrator = require('../lib/Migrator');

// ###########################################################################
// Migrate UP
// ###########################################################################
// NOTES: future methods
// https://www.youtube.com/watch?v=qwAEYnfC3K8
// db:seed
// db:seed:undo
// db:model:create
// db:seed:create

let migrator = null;
async function initMigrator () {
  const config = {
    url: program.url,
    database: program.database,
    collection: program.col || undefined,
    // migrationFolder: ,
    silent: program.silent || false
  };

  migrator = new Migrator(config);
  await migrator.connect();
}

program
  .version(version)
  .description('Simple MongoDB Database migration manager')
  .option('-u, --url <value>', 'MongoDB connection url')
  .option('-db, --database <value>', 'Database name')
  .option('-col, --collection [value]', 'Collection name name')
  .option('-s, --silent', 'Silence all console output');

program
  .command('up')
  .description('Migrate database up')
  .action(async (cmd) => {
    await initMigrator(cmd);
    // await up();
    process.exit(0);
  });

program
  .command('down')
  .option('-a, --all', 'Remove all migrations')
  .description('Remove migrations')
  .action(async (cmd) => {
    const removeAllMigrations = !!cmd.all;
    // await down(removeAllMigrations);
    process.exit(0);
  });

// error on unknown commands
// program.on('command:*', function () {
//   console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
//   process.exit(1);
// });

program.parse(process.argv);
