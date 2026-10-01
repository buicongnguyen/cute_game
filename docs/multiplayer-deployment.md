# Multiplayer deployment: Render + Neon

The repository is prepared for one Render web service and a Neon PostgreSQL database. No remote service is created by adding these files. Perform the setup below when you are ready to deploy.

The Render service serves the built game, `/api/*`, and `/socket` from one HTTPS address. Open that new Render address to play online. [GitHub Pages](https://buicongnguyen.github.io/cute_game/) remains a separate solo edition; it does not become multiplayer when the server is deployed.

## What is configured

| Setting | Value |
| --- | --- |
| Runtime | Node.js 24, selected by `.node-version` |
| Service | One free Render Node web service |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| Health check | `/api/health`, including database readiness |
| Automatic code deploys | Off; deploy updates manually |
| Database | User-supplied Neon `DATABASE_URL` secret |
| Game/API/WebSocket paths | `/`, `/api/`, `/socket` on the same origin |

[`render.yaml`](../render.yaml) sets `HOST=0.0.0.0`, `COOKIE_SECURE=1`, `DATABASE_REQUIRED=1`, `VITE_BASE_PATH=/`, and `VITE_STATIC_HOST=false`. Render supplies `PORT`; do not replace it with a fixed port. The build explicitly includes development dependencies because Vite and TypeScript are needed to compile the game.

The Blueprint uses `autoDeployTrigger: off`, the current equivalent of `autoDeploy: false`. It defines no Render database, disk, worker, or paid service. Creating the Blueprint starts its initial deployment; later code deployments are manual. Blueprint configuration sync is a separate setting: choose **Auto Sync: No** in the Blueprint settings if you also want to apply future `render.yaml` changes manually. [Render Blueprint reference](https://render.com/docs/blueprint-spec), [Blueprint sync settings](https://render.com/docs/infrastructure-as-code).

## 1. Prepare Neon and the local project

1. In your Neon account, create or choose the database that will hold this game's accounts. Select the Free plan if that is your intended budget, and choose a region near your Render service.
2. Open the database's **Connect** dialog and copy the PostgreSQL connection string for the intended database and role. Keep the TLS options provided by Neon. Both the host and password are credentials; store the whole string as `DATABASE_URL`, never as a `VITE_*` variable.
3. Use Node.js 24 locally, install the locked dependencies, and run the checks:

   ```sh
   npm ci --include=dev
   npm test
   npm run build
   ```

4. Copy `.env.example` to `.env`, put the Neon connection string in `DATABASE_URL`, and set `DATABASE_REQUIRED=1`. `.env` is ignored by Git; `.env.example` contains no credentials. The server and database CLI scripts load `.env`; hosting or shell variables override its values.
5. Verify the database connection:

   ```sh
   npm run db:check
   ```

The database must be reachable and its role must have permission to create and use the game's tables. Do not paste the connection string into source files, issue reports, screenshots, or the browser. [Neon connection guide](https://neon.com/docs/connect/connect-from-any-app).

## 2. Optionally import existing local accounts

Skip this section for a new game database. Import is an explicit, one-time operation into an **empty destination**; starting the server does not import `accounts.json` automatically.

Stop the local account service before making a private backup of `data/accounts.json`. Keep that backup and point your local `.env` at the intended Neon database. Then run:

```sh
npm run db:import -- --path "C:\path\to\accounts.json"
npm run db:check
```

Run the import before allowing players to register in the new deployment. It accepts version-1 and version-2 account files and preserves account IDs, password hashes, profiles, save revisions, friendships, friend requests, private gameplay records and durable action receipts. Version-2 receipts are validated and imported in the same transaction as accounts; retrying an imported command cannot grant its reward again. It is transactional and refuses a nonempty destination instead of merging or overwriting accounts. Never commit the input file. A browser's offline save is separate and is not part of this account import.

## 3. Create the Render service when ready

1. Confirm the deployment files and tested server changes are on `main` in [the existing GitHub repository](https://github.com/buicongnguyen/cute_game). Local pushes continue to use the existing Git SSH remote; Render connects to GitHub through your Render account.
2. In Render, choose **New → Blueprint**, connect that repository, and select `main`. Render reads `render.yaml` from the repository root.
3. Review the proposed resources: exactly one **Free** web service, one instance, and no Render database or disk. Use the chosen region and a unique service name if needed.
4. Supply the Neon connection string when Render prompts for `DATABASE_URL`. It is declared with `sync: false`, so the credential stays in Render's environment settings rather than Git. Keep `DATABASE_REQUIRED=1` and `COOKIE_SECURE=1`.
5. Create the Blueprint to start the initial build and deployment. Review the build and startup logs. The configured health endpoint must become healthy before sharing the address.
6. Open the service's assigned `https://…onrender.com/` address, then choose **Play together** and register or sign in. Share this address with the other player.

If the database URL is missing when `DATABASE_REQUIRED=1`, or the configured database cannot be opened, startup fails. It does not silently switch to `accounts.json` on Render's temporary filesystem. A database outage also makes the health check unhealthy.

## 4. Verify multiplayer and saved progress

Use two separate browser profiles or devices with two different accounts on the **same Render address**. Confirm that both can sign in, exchange a chat message, join the same party, and see each other in a shared wild area. Make a small progress change, wait for **Saved online**, sign out, and sign back in to confirm that it persisted.

Check `https://…onrender.com/api/health` for a successful response. If it reports an error, inspect the Render logs and the Neon connection settings; do not disable `DATABASE_REQUIRED` to bypass it. For a private connection check from your computer, use `npm run db:check` with the same Neon database configured in `.env`.

GitHub Pages, localhost, and the Render address each have separate browser-local storage. An installed Pages app still opens the solo Pages game. To install the online edition, open the Render address and use that browser's install option. Installation caches the game client; accounts, chat, and shared worlds still require the running server and an internet connection.

## Persistence and free-tier limits

Neon stores account credentials, profiles, save revisions, friends, friend requests and durable action receipts. Profile/private records include crop generations and timers, animal stock, weapon forging, daily theft allowances, fishing tickets, shared drops, death bags and recent committed events. Compact receipts store the original result rather than duplicating an entire profile; replay returns that result with the current profile/revision. Keep database backups appropriate to your Neon plan. `DATA_DIR/accounts.json` remains the default for local development only when no `DATABASE_URL` is set and `DATABASE_REQUIRED` is off.

Sign-in sessions, connected players, parties, chat history, and active world-room state are held in server memory. A restart or deployment disconnects players and clears that temporary state. Players sign in again and recreate their party; their last successfully saved account progress remains in Neon. Keep this deployment at **one instance** because these live sessions, rooms and active-world claim coordination are not shared between server processes. Inventory and command outcomes persist; an active encounter or environmental hazard is not a durable room simulation.

Render Free services sleep after 15 minutes without incoming HTTP traffic or WebSocket messages. Waking a sleeping service can take about a minute, and Render can restart free instances. Its local filesystem is temporary, which is why the deployment requires Neon instead of an account JSON file. Free services also lack a remote shell, so run optional database import/check commands from your own computer. Check both providers' current free-plan quotas and billing controls before creating resources. [Render free-service limits](https://render.com/docs/free), [Render WebSockets](https://render.com/docs/websocket).

## Updates and local development

After testing an update and pushing it to GitHub, use Render's manual deploy action for the desired commit. Automatic code deploys are disabled in this template. Update `DATABASE_URL` directly in Render's environment settings if you rotate the Neon credentials; never add the new credential to `render.yaml`.

For local file-based play, leave `DATABASE_URL` empty and `DATABASE_REQUIRED=0`, use `HOST=127.0.0.1` and `COOKIE_SECURE=0`, then run `npm run dev`. For local testing against Neon, set its URL and `DATABASE_REQUIRED=1` but keep `COOKIE_SECURE=0` while using HTTP localhost. Render uses HTTPS and keeps secure cookies enabled.
