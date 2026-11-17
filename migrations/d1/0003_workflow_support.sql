CREATE TABLE _nilelink_workflow_sequences (
  id TEXT PRIMARY KEY NOT NULL,
  seq INTEGER NOT NULL CHECK (seq >= 1 AND seq <= 9007199254740991)
);
-- Uploaded objects stay in this journal until their metadata commits. A failed
-- or uncertain operation never deletes an object referenced by a document.
CREATE TABLE _nilelink_storage_pending (
  storageKey TEXT PRIMARY KEY NOT NULL,
  ownerId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX documents_entity ON documents(json_extract(data, '$.entityType'), json_extract(data, '$.entityId'), customerId);
