-- `region` is the feed a station was polled from (e.g. NSW FuelCheck's NSW feed
-- also carries ACT stations); `state` is where the station physically is.
alter table stations rename column state to region;
alter table stations add column state text;
-- Backfill from postcode; the next poll refines it from the full address.
update stations set state = case
  when postcode between '0200' and '0299' or postcode between '2600' and '2618' or postcode between '2900' and '2920' then 'ACT'
  else region
end;
alter table stations alter column state set not null;
create index stations_state_idx on stations (state);
