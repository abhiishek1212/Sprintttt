# 🏆 Sprint Awards — WGU PA Team

A realtime multiplayer party game for a remote team's sprint-complete meeting.
Everyone opens one link on their own laptop while talking in Microsoft Teams.
The server holds all votes; players only see the live count until the host reveals.

## How a game runs

1. One person opens the site, clicks **Create game**, types their name, and gets a 6-letter room code.
2. They post the code in Teams. Everyone else clicks **Join game**, types their name and the code.
3. The host clicks **Start awards** (needs at least 2 players).
4. For each of the 8 awards: a short intro, everyone picks a teammate (never themselves), the counter climbs live, the host clicks **Reveal results**, then **Next award**. Ties are shown as ties.
5. After award 8: the Hall of Fame. Screenshot it for the team channel.

If the host drops for 20 seconds, any player can take over hosting.

## Deploy on Render (free)

1. Push these files to a GitHub repo.
2. On render.com: **New → Web Service**, pick the repo, Runtime **Node**, Build `npm install`, Start `npm start`, Instance type **Free**, Deploy.
3. Your game is at `https://<your-app>.onrender.com/`.

Free services sleep after ~15 min idle and take 30–60 s to wake: open the link 5 minutes before the meeting. Game state is in memory; a redeploy resets rooms.

## Run locally

```bash
npm install
npm start     # http://localhost:3000
```

## Customize

Awards and suggested names live at the top of `awards.js`. The UI is `index.html`.

## Files

- `server.js` — Express + Socket.io bootstrap
- `awards.js` — rooms, votes, reveals (all game logic)
- `index.html` — the game UI
- `render.yaml` — Render Blueprint (optional)
