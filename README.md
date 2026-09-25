# MyFuel

Self-hosted, ad-free fuel price map. Search a postcode or town and see nearby stations
coloured cheapest → dearest; tap one for its prices and a **Navigate** button that opens
your phone's maps app. Prices are polled from state government sources into Postgres, so
the map never calls providers directly and API quotas are respected.

| Region | Source | Key needed |
|---|---|---|
| NSW (incl. ACT), TAS | NSW Fuel API (FuelCheck) | API key + secret |
| NT | MyFuel NT | No |
| QLD | Fuel Prices QLD Direct API | Subscriber token |
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
enter the NSW API key and secret, click QLD to enter the Fuel Prices QLD subscriber token, and
**Test connection**; NT and WA need no key. Tick **Poll**
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

## API

### NSW Fuel API

NSW, ACT and TAS prices come from the NSW Government Fuel API, which needs an API key and
secret:

1. Sign up (or log in) at https://api.nsw.gov.au/Account/Login.
2. Subscribe to the [Fuel API](https://api.nsw.gov.au/Product/Index/22) to get your API key
   and secret.
3. In MyFuel, go to **Settings → Data sources**, click **NSW** or **TAS**, enter the key and
   secret, then **Test connection**.

The key and secret are encrypted before they're stored.

### API quota (NSW free plan: 2,500 calls/month)

Every call to the provider (including token requests) is logged in `api_calls`.
Settings shows calls used this month and the projected monthly usage for the saved
schedule. The poller stops when `monthly limit − reserve` is reached; manual refreshes
stop at the hard limit. Defaults: NSW every 30 min, TAS every 2 h, paused 22:00–05:00
Sydney time ≈ 1,400 calls/month.

### Fuel Prices QLD

QLD prices come from the [Fuel Prices QLD](https://www.fuelpricesqld.com.au/) Direct API
(Informed Sources, for the Queensland Government), host
`https://fppdirectapi-prod.fuelpricesqld.com.au`. It needs a subscriber token:

1. Apply as a data consumer at https://www.fuelpricesqld.com.au/ and accept the licence
   terms; you're emailed a subscriber token (a GUID).
2. In MyFuel, go to **Settings → Data sources**, click **QLD**, paste the token, then
   **Test connection**. Pasting the whole `FPDAPI SubscriberToken=…` header value also works.

- Each refresh makes one prices request for the whole state. Sites, brands, fuel types and
  suburb names are fetched once a day (4 calls) and kept in memory, as the API guide asks.
- Prices come in tenths of a cent (`1679` = 167.9c/L); `9999` means the fuel is
  unavailable and is skipped. Timestamps are UTC.
- Fuel types are matched by name; blends such as `e10/Unleaded` are skipped. **Test
  connection** lists any QLD fuel types that aren't shown. `OPAL` is stored as `LAF`.
- The API asks for no more than one prices call a minute; there's no monthly quota.
- Default refresh: every 30 minutes.

### MyFuel NT

NT prices come from [MyFuel NT](https://myfuelnt.nt.gov.au/), the NT Government's official
fuel price website. No sign-up or key is needed.

- MyFuel NT has no published API. The app requests the site's own results page and reads
  the station and price data embedded in it; one request returns every NT outlet
  (about 214) with all its fuel prices.
- The feed doesn't say when each price was set, so the app shows when it first saw that price.
- Fuels marked out of stock are skipped. `PD` (premium diesel) is stored as `PDL`, and
  `LAF` is Low Aromatic Fuel.
- Because this relies on the page layout, a site change could break it. The refresh then
  fails with an error in **Settings → Activity** and the existing NT prices stay on the map.
- Default refresh: every hour.

### FuelWatch WA

WA prices come from [FuelWatch](https://www.fuelwatch.wa.gov.au/), the WA Government's
official fuel price service, through its public RSS feed
(`https://www.fuelwatch.wa.gov.au/fuelwatch/fuelWatchRSS`). No sign-up or key is needed.

- The feed returns every WA station for one fuel type, so each refresh makes one request
  per fuel type (7 in total).
- WA prices are fixed for the whole day from 6am; tomorrow's prices are published after
  2:30pm.
- The feed has no station IDs or postcodes, so stations are identified by address and
  coordinates, and postcodes are looked up from the suburb name.
- FuelWatch requires credit with a link back to its site; the map shows it.
- Default refresh: every 2 hours.

## Layout

```
server/src/
  sources/        one adapter per provider (nsw.ts, nt.ts, qld.ts, wa.ts) + credential/quota service
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
[MyFuel NT](https://myfuelnt.nt.gov.au/) (NT Government),
[Fuel Prices Queensland](https://www.fuelpricesqld.com.au/) (Queensland Government) and
[FuelWatch](https://www.fuelwatch.wa.gov.au/) (WA Government); each is credited on the map.
