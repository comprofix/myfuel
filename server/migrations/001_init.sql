create table users (
  id serial primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  id text primary key, -- sha256 of the cookie token
  user_id int not null references users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_expires_idx on sessions (expires_at);

-- One row per data provider (e.g. 'nsw' = NSW FuelCheck, which also serves TAS)
create table data_sources (
  id text primary key,
  enabled boolean not null default false,
  credentials text,          -- AES-GCM encrypted JSON
  token text,                -- AES-GCM encrypted cached access token
  token_expires_at timestamptz,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Every outbound call to a provider, for monthly quota tracking
create table api_calls (
  id bigserial primary key,
  source_id text not null,
  kind text not null,
  region text,
  status int,
  at timestamptz not null default now()
);
create index api_calls_source_at_idx on api_calls (source_id, at);

create table poll_runs (
  id bigserial primary key,
  source_id text not null,
  region text not null,
  trigger text not null,     -- 'schedule' | 'manual'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  stations int,
  prices int,
  changed int,
  error text
);
create index poll_runs_source_region_idx on poll_runs (source_id, region, started_at desc);

create table stations (
  id serial primary key,
  source_id text not null,
  state text not null,
  code text not null,
  name text not null,
  brand text,
  address text,
  postcode text,
  lat double precision not null,
  lng double precision not null,
  last_seen_at timestamptz not null default now(),
  unique (source_id, state, code)
);
create index stations_lat_lng_idx on stations (lat, lng);

create table fuel_types (
  code text primary key,
  name text not null,
  sort int not null
);
insert into fuel_types (code, name, sort) values
  ('U91', 'Unleaded 91', 10),
  ('E10', 'Ethanol 94 (E10)', 20),
  ('P95', 'Premium 95', 30),
  ('P98', 'Premium 98', 40),
  ('DL', 'Diesel', 50),
  ('PDL', 'Premium Diesel', 60),
  ('E85', 'Ethanol 105 (E85)', 70),
  ('B20', 'Biodiesel 20', 80),
  ('LPG', 'LPG', 90),
  ('LNG', 'LNG', 100),
  ('CNG', 'CNG/NGV', 110),
  ('H2', 'Hydrogen', 120);

create table current_prices (
  station_id int not null references stations on delete cascade,
  fuel_type text not null,
  price double precision not null,  -- cents per litre
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (station_id, fuel_type)
);
create index current_prices_fuel_idx on current_prices (fuel_type, price);

-- A row each time a station's price for a fuel changes
create table price_history (
  id bigserial primary key,
  station_id int not null references stations on delete cascade,
  fuel_type text not null,
  price double precision not null,
  source_updated_at timestamptz,
  recorded_at timestamptz not null default now()
);
create index price_history_station_fuel_idx on price_history (station_id, fuel_type, recorded_at desc);

-- Postcode/suburb gazetteer (GeoNames, CC BY 4.0) for search
create table localities (
  id serial primary key,
  postcode text not null,
  name text not null,
  state text not null,
  lat double precision not null,
  lng double precision not null
);
create index localities_postcode_idx on localities (postcode);
create index localities_name_idx on localities (lower(name) text_pattern_ops);
