# Going online later (what is ready, what you do)

Everything below is already in the code and covered by tests (`npm test`): accounts, friend requests, visiting a friend's garden and house, gifts from the bag, watering a friend's crops, parties, chat, and fighting together in the shared wilds.

The public GitHub Pages edition is single-player on purpose. When you create the server, only this changes:

1. Create the Neon database and the Render service as described in [multiplayer-deployment.md](multiplayer-deployment.md) (`render.yaml` is ready).
2. Open the Render address once to confirm `/api/health` says ok, then register two test accounts and make them friends.
3. In the GitHub repository, add the variable **ONLINE_URL** (Settings → Secrets and variables → Actions → Variables) with your Render address. The next push to `main` adds a "Play online with friends" link on the Pages title screen. Without it, nothing changes.

How the world is split: inside the safe circle at home (18 m round the village, and inside the cottage) you are alone in your own home space; friends can visit it. Outside the circle everyone shares one common place where you meet and fight together. Walking back into the circle returns you to your own home.

## Run it on this PC now (ngrok)

Double-click `start-online.cmd` (or run `npm run share`). It builds the game if needed, starts the server on this PC only, opens your ngrok tunnel and prints the public address. Send that address to players and keep the window open. `npm run loadtest -- 1000 100 20` measures how many players the PC copes with.

## What players can do together (modelled on how Zoo Pet works)

- **Friends button** (the 👥 button, with a red number for new friend requests and new guest-diary entries): send a request by username or by tapping another explorer; accept or decline; **cancel** a request you sent; remove a friend.
- **Go to a friend's house and garden** from the friends list. Water their growing plants (10% faster, once per plant, up to 30 a day), give them gifts from your bag, or pick a ripe crop. **Return to my garden** takes you back.
- **Guest diary** (📒): the owner sees who visited, watered, gave a gift or picked a crop, and gets a pop-up message when it happens.
- **Shared wilds**: outside the safe circle everyone meets in one world (24 per world; use a private party for more) and fights together. Your own home area is yours alone, apart from guests.
- Movement is sent as small changes to save bandwidth (about 70% less traffic in the load test).
