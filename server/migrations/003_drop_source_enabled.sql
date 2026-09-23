-- Polling is now controlled per region in settings.regions; the source-wide switch is gone.
alter table data_sources drop column enabled;
