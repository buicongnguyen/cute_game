import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAccountStore, validateImportedAccounts, validateImportedReceipts } from './account-store.mjs';
import { parseSave } from '../src/model.ts';

const usage = 'Use npm run db:check or npm run db:import -- --path path/to/accounts.json';

/** Explicit operator tools: importing never runs during normal server startup. */
export async function databaseCommand(args, { env = process.env, output = console.log, createStore = createAccountStore } = {}) {
  const [command, ...rest] = args;
  if (command === '--help' || command === 'help') { output(usage); return; }
  if (!['check', 'import'].includes(command) || (command === 'check' && rest.length) ||
      (command === 'import' && (rest.length !== 2 || rest[0] !== '--path' || !rest[1]))) throw new Error(usage);
  if (!env.DATABASE_URL?.trim()) throw new Error('Set DATABASE_URL in your server environment or local .env file first.');
  let records, receipts=[];
  if (command === 'import') {
    const filename = path.resolve(rest[1]), info = await stat(filename);
    if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error('Choose an accounts.json file smaller than 64 MB.');
    const source = JSON.parse(await readFile(filename, 'utf8'));
    if (![1,2].includes(source?.version) || !Array.isArray(source.accounts)) throw new Error('The source must be a version-1 or version-2 accounts.json database.');
    records = validateImportedAccounts(source.accounts.map(account => {
      const profile = parseSave(JSON.stringify(account?.profile));
      if (!profile) throw new Error('An account has an invalid adventure. Nothing was imported.');
      return { ...account, profile };
    }));
    receipts=validateImportedReceipts(source.receipts||[],records);
  }
  const store = await createStore({ databaseUrl: env.DATABASE_URL });
  try {
    await store.health();
    if (command === 'check') output('PostgreSQL is ready. Account storage is available.');
    else {
      const count = await store.importAccounts(records,receipts);
      output(`Imported ${count} accounts. The source file was kept unchanged.`);
    }
  } finally { await store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await databaseCommand(process.argv.slice(2)); }
  catch (error) {
    // Never print a driver error or a connection string containing a database password.
    const safe = error.status === 409 ? error.message :
      !process.env.DATABASE_URL?.trim() ? 'Set DATABASE_URL in your server environment or local .env file first.' :
      'Database command failed. Check the connection, source file, and empty import destination. Existing records were not overwritten.';
    console.error(safe); process.exitCode = 1;
  }
}
