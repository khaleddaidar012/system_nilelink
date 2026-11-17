-- A zero-row optimistic update is not a SQL error. These temporary guard rows
-- deliberately fail CHECK when changes() != 1, rolling back the entire batch.
-- Each successful batch deletes its own guard rows before committing.
CREATE TABLE _nilelink_write_guards (
  id TEXT PRIMARY KEY NOT NULL,
  valid INTEGER NOT NULL CHECK (valid = 1)
);
