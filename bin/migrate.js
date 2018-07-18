#!/usr/bin/env node

const program = require('commander');

const {version} = require('../package.json');
const Migrator = require('../lib');

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

// TODO: show optional variables and default values

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
  .action(async () => {
    await initMigrator();
    await migrator.up();
    await migrator.close();
    process.exit(0);
  });

program
  .command('down')
  .option('-a, --all', 'Remove all migrations')
  .description('Remove migrations')
  .action(async (cmd) => {
    await initMigrator();
    const removeAllMigrations = !!cmd.all;
    await migrator.down(removeAllMigrations);
    await migrator.close();
    process.exit(0);
  });

// Show on unknown commands
program.on('command:*', () => {
  console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
  process.exit(1);
});

// Show help if no command passed
// Reference: https://github.com/tj/commander.js/issues/7#issuecomment-48854967
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
