CREATE TABLE _nilelink_delivery_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  requestKey TEXT GENERATED ALWAYS AS (json_extract(data, '$.requestKey')) VIRTUAL NOT NULL UNIQUE,
  state TEXT GENERATED ALWAYS AS (json_extract(data, '$.state')) VIRTUAL NOT NULL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX delivery_jobs_state_created ON _nilelink_delivery_jobs(state, createdAt);
