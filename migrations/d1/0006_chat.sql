CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data,'$._id')=id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  kind TEXT GENERATED ALWAYS AS (json_extract(data,'$.kind')) VIRTUAL NOT NULL,
  directKey TEXT GENERATED ALWAYS AS (json_extract(data,'$.directKey')) VIRTUAL UNIQUE,
  updatedAt TEXT GENERATED ALWAYS AS (json_extract(data,'$.updatedAt')) VIRTUAL
);
CREATE TABLE chat_members (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data,'$._id')=id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  conversationId TEXT GENERATED ALWAYS AS (json_extract(data,'$.conversationId')) VIRTUAL NOT NULL REFERENCES chat_conversations(id),
  userId TEXT GENERATED ALWAYS AS (json_extract(data,'$.userId')) VIRTUAL NOT NULL REFERENCES users(id),
  active INTEGER GENERATED ALWAYS AS (json_extract(data,'$.active')) VIRTUAL NOT NULL,
  UNIQUE(conversationId,userId)
);
CREATE INDEX chat_member_user ON chat_members(userId,active,conversationId);
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data,'$._id')=id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  conversationId TEXT GENERATED ALWAYS AS (json_extract(data,'$.conversationId')) VIRTUAL NOT NULL REFERENCES chat_conversations(id),
  senderId TEXT GENERATED ALWAYS AS (json_extract(data,'$.senderId')) VIRTUAL NOT NULL REFERENCES users(id),
  sequence INTEGER GENERATED ALWAYS AS (json_extract(data,'$.sequence')) VIRTUAL NOT NULL,
  clientMessageId TEXT GENERATED ALWAYS AS (json_extract(data,'$.clientMessageId')) VIRTUAL NOT NULL,
  UNIQUE(conversationId,sequence),
  UNIQUE(senderId,clientMessageId)
);
CREATE INDEX chat_message_timeline ON chat_messages(conversationId,sequence DESC);
