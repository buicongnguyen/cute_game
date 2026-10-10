# Going online later (what is ready, what you do)

Everything below is already in the code and covered by tests (`npm test`): accounts, friend requests, visiting a friend's garden and house, gifts from the bag, watering a friend's crops, parties, chat, and fighting together in the shared wilds.

The public GitHub Pages edition is single-player on purpose. When you create the server, only this changes:

1. Create the Neon database and the Render service as described in [multiplayer-deployment.md](multiplayer-deployment.md) (`render.yaml` is ready).
2. Open the Render address once to confirm `/api/health` says ok, then register two test accounts and make them friends.
3. In the GitHub repository, add the variable **ONLINE_URL** (Settings → Secrets and variables → Actions → Variables) with your Render address. The next push to `main` adds a "Play online with friends" link on the Pages title screen. Without it, nothing changes.

How the world is split: inside the safe circle at home (18 m round the village, and inside the cottage) you are alone in your own home space; friends can visit it. Outside the circle everyone shares one common place where you meet and fight together. Walking back into the circle returns you to your own home.

## Run it on this PC now (ngrok)

Double-click `start-online.cmd` (or run `npm run share`). It builds the game if needed, starts the server on this PC only, opens your ngrok tunnel and prints the public address. The launcher rebuilds when the existing output is the solo GitHub Pages edition, uses a different base path, or predates source/configuration changes. It always builds the online edition at `/`. Send that address to players and keep the window open. `npm run loadtest -- 1000 100 20` measures how many players the PC copes with.

## Show the live leaderboard and the "Play online" link on github.io, when your PC is on

The github.io game is a static site: it has no server of its own. It can still talk to the server on your PC, but only while that server is running, and it has to know the address. When the address is known and the server answers:

- the title screen shows **Play online with friends**, and
- the 🏆 **leaderboard** lists the real players on your server (read only, no ranks of the viewer). When the server is off, or nobody set an address, it shows the neighbourhood board (you and the AI neighbours) instead, so it is never empty or broken.

One-time setup:

1. In the free ngrok dashboard, open **Domains** and claim your fixed address (for example `my-name.ngrok-free.app`). A fixed address matters because the github.io build has the address baked in; a random one (cloudflared, or ngrok without a domain) changes at every start.
2. Start the server with that address: in a terminal `set NGROK_DOMAIN=my-name.ngrok-free.app` then `npm run share` (or add the line to `start-online.cmd`).
3. In the GitHub repository set the variable once: `gh variable set ONLINE_URL --body https://my-name.ngrok-free.app` (or Settings → Secrets and variables → Actions → Variables).
4. Re-run the "Test and publish" workflow (or push anything to `main`) so the new address is built in.

After that, whenever you start `start-online.cmd` the live features appear on github.io within a minute, and they disappear again when you close it. The server only lets other sites read the leaderboard list and the health check; everything else (sign-in, saves, friends) stays on the server's own address.

With a random address (no fixed domain) it also works, but you have to repeat steps 3 and 4 after every start.

## What players can do together (modelled on how Zoo Pet works)

- **Friends button** (the 👥 button, with a red number for new friend requests and new guest-diary entries): send a request by username or by tapping another explorer; accept or decline; **cancel** a request you sent; remove a friend.
- **Go to a friend's house and garden** from the friends list. Water their growing plants (10% faster, once per plant, up to 30 a day), give them gifts from your bag, or pick a ripe crop. **Return to my garden** takes you back.
- **Guest diary** (📒): the owner sees who visited, watered, gave a gift or picked a crop, and gets a pop-up message when it happens.
- **Messages**: press "Message" on a friend (their card, or the friends list) to send a short private message, even if they are offline. It lands in their guest diary and pops up if they are playing. Everyone in the same world can also use the world chat.
- **Shared wilds**: outside the safe circle everyone meets in one world (24 per world; use a private party for more) and fights together. Your own home area is yours alone, apart from guests.
- Movement is sent as small changes to save bandwidth (about 70% less traffic in the load test).
