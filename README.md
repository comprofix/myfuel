# MyFuel

Self-hosted, ad-free fuel price map. Search a postcode or town and see nearby stations
coloured cheapest → dearest; tap one for its prices and a **Navigate** button that opens
your phone's maps app. Prices are polled from state government sources into Postgres, so
the map never calls providers directly and API quotas are respected.

| Region | Source | Key needed |
|---|---|---|
| NSW (incl. ACT), TAS | NSW Fuel API (FuelCheck) | API key + secret |
| NT | MyFuel NT | No |
| WA | FuelWatch | No |

Built mobile-first: on phones the map fills the screen with the station list in a bottom
sheet. **Navigate** opens a `geo:` link on Android (your default maps app, usually Google
Maps), Apple Maps on iOS, and Google Maps in a new tab on desktop.

## Stack

| Container | What |
|---|---|
| `app` | Node 24 + Fastify API, poller, and the built React (Vite + Leaflet) front end |
| `db`  | Postgres 17 |

The whole app is behind a login. The first admin user is created from `ADMIN_USERNAME` /
`ADMIN_PASSWORD` on first start.

## Run with Docker

```bash
cp .env.example .env        # set POSTGRES_PASSWORD, APP_SECRET, ADMIN_PASSWORD
docker compose up -d --build
```

Open http://localhost:8080 and sign in. In **Settings → Data sources**, click NSW or TAS to
enter the NSW API key and secret and **Test connection**; NT and WA need no key. Tick **Poll**
for each region you want refreshed on its schedule.

## Local development

```bash
npm install
docker compose up -d db     # Postgres on 127.0.0.1:${POSTGRES_PORT:-5433}
npm run dev                 # API on :8080 (auto-restart), Vite on http://localhost:5173
```

Set `FIXTURE_DIR=../out/fixtures` in `.env` to read `prices-NSW.json` / `prices-TAS.json`
from disk instead of calling the API (saves quota).

```bash
npm test          # server unit tests
npm run typecheck
```

## API quota (NSW free plan: 2,500 calls/month)

Every call to the provider (including token requests) is logged in `api_calls`.
Settings shows calls used this month and the projected monthly usage for the saved
schedule. The poller stops when `monthly limit − reserve` is reached; manual refreshes
stop at the hard limit. Defaults: NSW every 30 min, TAS every 2 h, paused 22:00–05:00
Sydney time ≈ 1,400 calls/month.

## Layout

```
server/src/
  sources/        one adapter per provider (nsw.ts) + credential/quota service
  poller.ts       scheduler; ingest.ts applies a snapshot and records price history
  routes/         stations/search API and admin API
  auth.ts         sessions (httpOnly cookie), scrypt password hashes
server/migrations SQL migrations, applied on startup
server/data       postcode gazetteer
web/src           React app (pages/MapPage, pages/SettingsPage)
```

## Attribution

Postcode/locality data © [GeoNames](https://www.geonames.org/) (CC BY 4.0).
Map tiles © OpenStreetMap contributors. Fuel data © NSW Government (FuelCheck),
[MyFuel NT](https://myfuelnt.nt.gov.au/) (NT Government) and
[FuelWatch](https://www.fuelwatch.wa.gov.au/) (WA Government); each is credited on the map.
