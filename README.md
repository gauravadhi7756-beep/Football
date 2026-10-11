# ⚽ Football Dashboard

A live football dashboard covering:

- UEFA Champions League
- UEFA Nations League
- English Premier League
- LaLiga
- Serie A
- Ligue 1
- MLS

## Features

- **Matches**: live scores, fixtures and results for any day or week, across every competition at once or one at a time. You can filter by Live, Upcoming or Finished. Live matches refresh every 30 seconds.
- **Match details** (click any match): goals, cards and substitutions timeline, team stats (possession, shots, corners, fouls…), lineups with formations and subs, recent head-to-head, venue, attendance, referee and broadcasters.
- **Tables**: full league tables (P, W, D, L, GF, GA, GD, Pts) with qualification and relegation zones colour-coded, group tables for the Nations League and MLS conferences, and past seasons.
- **Top Scorers**: the top 20 goal scorers and assist providers in each competition, with matches played. This tab uses the same season picker as Tables.
- **News**: the latest headlines for the selected competitions.
- Light and dark themes, and a layout that works on phones.

Data comes from ESPN's public sports API, so you don't need an API key.

## Run it

Option 1: open `index.html` in your browser.

Option 2: use the built-in server, which also proxies the API in case your browser or network blocks direct requests:

```bash
node server.js        # then open http://localhost:8080
```

You need Node.js 18 or newer. There are no dependencies to install.
