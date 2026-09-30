import { spawn } from 'node:child_process';
import { createGameServer } from './server.mjs';
const server = await createGameServer();
console.log(`Online worlds ready at ${server.url}`);
const client = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit', windowsHide: true });
let stopping = false;
async function close(code = 0) { if (stopping) return; stopping = true; client.kill(); await server.close(); process.exit(code); }
client.on('exit', code => close(code || 0));
client.on('error', error => { console.error(error.message); close(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => close());
