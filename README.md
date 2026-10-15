# ⚽ Football Dashboard

A live football dashboard covering:

- UEFA Champions League
- UEFA Europa League
- UEFA Conference League
- UEFA Nations League
- English Premier League
- LaLiga
- Serie A
- Ligue 1
- MLS
- Saudi Pro League
- Bundesliga
- Eredivisie

## Features

- **Matches**: live scores, fixtures and results for any day or week, across every competition at once or one at a time. You can filter by Live, Upcoming or Finished. Live matches refresh every 30 seconds.
- **Match details** (click any match): goals, cards and substitutions timeline, team stats (possession, shots, corners, fouls…), lineups with formations and subs, recent head-to-head, venue, attendance, referee and broadcasters.
- **Tables**: full league tables (P, W, D, L, GF, GA, GD, Pts) with qualification and relegation zones colour-coded, group tables for the Nations League and MLS conferences, and past seasons.
- **UCL Calendar**: Champions League fixtures for the rest of the season, starting with today's match (or "no match today") and the next kick-off, grouped by date and shown in your local time. The **Download .ics** button saves them as a calendar file you can add to Apple Calendar, Google Calendar or Outlook.
- **Top Scorers**: the top 20 goal scorers and assist providers in each competition, with matches played. This tab uses the same season picker as Tables.
- **News**: the latest headlines for the selected competitions.
- The page address remembers the tab, competition, date and season, so you can bookmark or share a view (e.g. `#view=standings&league=eng.1`).
- A live-match counter on the Matches tab.
- Light and dark themes, and a layout that works on phones.

Data comes from ESPN's public sports API, so you don't need an API key.

## Run it

Option 1: open `index.html` in your browser.

Option 2: use the built-in server, which also proxies the API in case your browser or network blocks direct requests:

```bash
node server.js        # then open http://localhost:8080
```

You need Node.js 18 or newer. There are no dependencies to install.

## Put it online (free, with GitHub Pages)

1. In the repository on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, then click **Save**.
3. The site will be at `https://<your-username>.github.io/<repo-name>/` and updates every time `main` changes.
