# Going online later (what is ready, what you do)

Everything below is already in the code and covered by tests (`npm test`): accounts, friend requests, visiting a friend's garden and house, gifts from the bag, watering a friend's crops, parties, chat, and fighting together in the shared wilds.

The public GitHub Pages edition is single-player on purpose. When you create the server, only this changes:

1. Create the Neon database and the Render service as described in [multiplayer-deployment.md](multiplayer-deployment.md) (`render.yaml` is ready).
2. Open the Render address once to confirm `/api/health` says ok, then register two test accounts and make them friends.
3. In the GitHub repository, add the variable **ONLINE_URL** (Settings → Secrets and variables → Actions → Variables) with your Render address. The next push to `main` adds a "Play online with friends" link on the Pages title screen. Without it, nothing changes.

How the world is split: inside the safe circle at home (18 m round the village, and inside the cottage) you are alone in your own home space; friends can visit it. Outside the circle everyone shares one common place where you meet and fight together. Walking back into the circle returns you to your own home.
