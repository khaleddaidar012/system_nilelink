-- Initial application storage. The complete JSON document preserves unknown
-- fields, array order, absent-vs-null, subdocument IDs, and historical values.
-- Indexed generated columns are read-only projections: no dual-write drift.
-- Dates in data use UTC ISO strings; ObjectIds use their original hex strings.
-- Import must retain original BSON separately and reject unsupported BSON types.
-- This migration does not connect or switch the existing MongoDB application.

CREATE TABLE customers (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  companyName TEXT GENERATED ALWAYS AS (json_extract(data, '$.companyName')) VIRTUAL,
  contactEmail TEXT GENERATED ALWAYS AS (json_extract(data, '$.contactEmail')) VIRTUAL,
  commercialRegisterNumber TEXT GENERATED ALWAYS AS (json_extract(data, '$.commercialRegisterNumber')) VIRTUAL,
  accountStatus TEXT GENERATED ALWAYS AS (json_extract(data, '$.accountStatus')) VIRTUAL,
  assignedStaffId TEXT GENERATED ALWAYS AS (json_extract(data, '$.assignedStaffId')) VIRTUAL REFERENCES users(id),
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX customers_status_created ON customers(accountStatus, createdAt DESC);
CREATE INDEX customers_company ON customers(companyName);
CREATE INDEX customers_register ON customers(commercialRegisterNumber);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  email TEXT GENERATED ALWAYS AS (json_extract(data, '$.email')) VIRTUAL NOT NULL UNIQUE,
  username TEXT GENERATED ALWAYS AS (json_extract(data, '$.username')) VIRTUAL,
  role TEXT GENERATED ALWAYS AS (json_extract(data, '$.role')) VIRTUAL,
  status TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  customerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.customerId')) VIRTUAL REFERENCES customers(id),
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
-- Mongo unique sparse includes explicit null but excludes a missing field.
CREATE UNIQUE INDEX users_username_value ON users(username)
  WHERE json_type(data, '$.username') IS NOT NULL AND username IS NOT NULL;
CREATE UNIQUE INDEX users_username_null ON users((1))
  WHERE json_type(data, '$.username') = 'null';
CREATE INDEX users_customer ON users(customerId);
CREATE INDEX users_role_status ON users(role, status);

CREATE TABLE role_configs (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  title TEXT GENERATED ALWAYS AS (json_extract(data, '$.title')) VIRTUAL NOT NULL UNIQUE
);

CREATE TABLE system_settings (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  settingKey TEXT GENERATED ALWAYS AS (json_extract(data, '$.settingKey')) VIRTUAL NOT NULL UNIQUE
);

CREATE TABLE service_configs (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  serviceKey TEXT GENERATED ALWAYS AS (json_extract(data, '$.serviceKey')) VIRTUAL NOT NULL UNIQUE
);

CREATE TABLE pricing_rules (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  serviceKey TEXT GENERATED ALWAYS AS (json_extract(data, '$.serviceKey')) VIRTUAL,
  pricingType TEXT GENERATED ALWAYS AS (json_extract(data, '$.pricingType')) VIRTUAL
);
CREATE INDEX pricing_rules_service_type ON pricing_rules(serviceKey, pricingType);

CREATE TABLE customer_requests (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  customerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.customerId')) VIRTUAL NOT NULL REFERENCES customers(id),
  requestedBy TEXT GENERATED ALWAYS AS (json_extract(data, '$.requestedBy')) VIRTUAL REFERENCES users(id),
  assignedStaffId TEXT GENERATED ALWAYS AS (json_extract(data, '$.assignedStaffId')) VIRTUAL REFERENCES users(id),
  trackingNumber TEXT GENERATED ALWAYS AS (json_extract(data, '$.trackingNumber')) VIRTUAL NOT NULL UNIQUE,
  status TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX requests_customer_status ON customer_requests(customerId, status, createdAt DESC);

CREATE TABLE request_services (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  requestId TEXT GENERATED ALWAYS AS (json_extract(data, '$.requestId')) VIRTUAL NOT NULL REFERENCES customer_requests(id),
  serviceKey TEXT GENERATED ALWAYS AS (json_extract(data, '$.serviceKey')) VIRTUAL,
  status TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL
);
CREATE INDEX request_services_request_key ON request_services(requestId, serviceKey);

CREATE TABLE documents (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  customerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.customerId')) VIRTUAL NOT NULL REFERENCES customers(id),
  uploadedBy TEXT GENERATED ALWAYS AS (json_extract(data, '$.uploadedBy')) VIRTUAL REFERENCES users(id),
  reviewedBy TEXT GENERATED ALWAYS AS (json_extract(data, '$.reviewedBy')) VIRTUAL REFERENCES users(id),
  category TEXT GENERATED ALWAYS AS (json_extract(data, '$.category')) VIRTUAL,
  status TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  isArchived INTEGER GENERATED ALWAYS AS (json_extract(data, '$.isArchived')) VIRTUAL,
  storageKey TEXT GENERATED ALWAYS AS (json_extract(data, '$.storageKey')) VIRTUAL,
  fileHash TEXT GENERATED ALWAYS AS (json_extract(data, '$.fileHash')) VIRTUAL,
  expiryDate TEXT GENERATED ALWAYS AS (json_extract(data, '$.expiryDate')) VIRTUAL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX documents_customer_status ON documents(customerId, status, createdAt DESC);
CREATE INDEX documents_customer_category_archive ON documents(customerId, category, isArchived);
CREATE INDEX documents_expiry ON documents(expiryDate);
CREATE INDEX documents_storage ON documents(storageKey);
CREATE INDEX documents_hash ON documents(fileHash);

CREATE TABLE document_activity_logs (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  documentId TEXT GENERATED ALWAYS AS (json_extract(data, '$.documentId')) VIRTUAL NOT NULL,
  customerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.customerId')) VIRTUAL NOT NULL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
-- Historical audit references may outlive deleted entities. Never cascade-delete logs.
CREATE INDEX document_logs_document_date ON document_activity_logs(documentId, createdAt DESC);
CREATE INDEX document_logs_customer_date ON document_activity_logs(customerId, createdAt DESC);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  customerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.customerId')) VIRTUAL NOT NULL REFERENCES customers(id),
  requestId TEXT GENERATED ALWAYS AS (json_extract(data, '$.requestId')) VIRTUAL NOT NULL REFERENCES customer_requests(id),
  quoteNumber TEXT GENERATED ALWAYS AS (json_extract(data, '$.quoteNumber')) VIRTUAL NOT NULL UNIQUE,
  status TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX quotes_customer_status ON quotes(customerId, status, createdAt DESC);
CREATE INDEX quotes_request ON quotes(requestId);

CREATE TABLE quote_items (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  quoteId TEXT GENERATED ALWAYS AS (json_extract(data, '$.quoteId')) VIRTUAL NOT NULL REFERENCES quotes(id),
  requestServiceId TEXT GENERATED ALWAYS AS (json_extract(data, '$.requestServiceId')) VIRTUAL REFERENCES request_services(id)
);
CREATE INDEX quote_items_quote_service ON quote_items(quoteId, requestServiceId);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  customerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.customerId')) VIRTUAL REFERENCES customers(id),
  relatedQuoteId TEXT GENERATED ALWAYS AS (json_extract(data, '$.relatedQuoteId')) VIRTUAL REFERENCES quotes(id),
  relatedRequestId TEXT GENERATED ALWAYS AS (json_extract(data, '$.relatedRequestId')) VIRTUAL REFERENCES customer_requests(id),
  invoiceNumber TEXT GENERATED ALWAYS AS (json_extract(data, '$.invoiceNumber')) VIRTUAL NOT NULL UNIQUE,
  token TEXT GENERATED ALWAYS AS (json_extract(data, '$.token')) VIRTUAL NOT NULL UNIQUE,
  status TEXT GENERATED ALWAYS AS (json_extract(data, '$.status')) VIRTUAL,
  currency TEXT GENERATED ALWAYS AS (json_extract(data, '$.currency')) VIRTUAL,
  issueDate TEXT GENERATED ALWAYS AS (json_extract(data, '$.issueDate')) VIRTUAL,
  dueDate TEXT GENERATED ALWAYS AS (json_extract(data, '$.dueDate')) VIRTUAL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
-- Monetary values remain in data without affinity casts or recalculation.
CREATE INDEX invoices_customer_status_date ON invoices(customerId, status, createdAt DESC);
CREATE INDEX invoices_customer_issue_status ON invoices(customerId, issueDate, status);
CREATE INDEX invoices_status_issue ON invoices(status, issueDate DESC);
CREATE INDEX invoices_request ON invoices(relatedRequestId);

CREATE TABLE invoice_sequences (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  seq INTEGER GENERATED ALWAYS AS (json_extract(data, '$.seq')) VIRTUAL NOT NULL
    CHECK (json_type(data, '$.seq') = 'integer' AND seq >= 0 AND seq <= 9007199254740991)
);

CREATE TABLE invoice_activity_logs (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  invoiceId TEXT GENERATED ALWAYS AS (json_extract(data, '$.invoiceId')) VIRTUAL NOT NULL,
  customerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.customerId')) VIRTUAL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX invoice_logs_invoice_date ON invoice_activity_logs(invoiceId, createdAt DESC);
CREATE INDEX invoice_logs_customer_date ON invoice_activity_logs(customerId, createdAt DESC);

CREATE TABLE payments (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  invoiceId TEXT GENERATED ALWAYS AS (json_extract(data, '$.invoiceId')) VIRTUAL NOT NULL REFERENCES invoices(id),
  customerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.customerId')) VIRTUAL NOT NULL REFERENCES customers(id),
  currency TEXT GENERATED ALWAYS AS (json_extract(data, '$.currency')) VIRTUAL,
  paymentDate TEXT GENERATED ALWAYS AS (json_extract(data, '$.paymentDate')) VIRTUAL
);
CREATE INDEX payments_invoice_date ON payments(invoiceId, paymentDate DESC);
CREATE INDEX payments_customer_date ON payments(customerId, paymentDate);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  recipientUserId TEXT GENERATED ALWAYS AS (json_extract(data, '$.recipientUserId')) VIRTUAL,
  recipientCustomerId TEXT GENERATED ALWAYS AS (json_extract(data, '$.recipientCustomerId')) VIRTUAL,
  targetAudience TEXT GENERATED ALWAYS AS (json_extract(data, '$.targetAudience')) VIRTUAL,
  isRead INTEGER GENERATED ALWAYS AS (json_extract(data, '$.isRead')) VIRTUAL,
  relatedDocumentId TEXT GENERATED ALWAYS AS (json_extract(data, '$.relatedDocumentId')) VIRTUAL,
  type TEXT GENERATED ALWAYS AS (json_extract(data, '$.type')) VIRTUAL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX notifications_recipient_read_date ON notifications(recipientUserId, isRead, createdAt DESC);
CREATE INDEX notifications_audience_read_date ON notifications(targetAudience, isRead, createdAt DESC);
CREATE INDEX notifications_document_type_date ON notifications(relatedDocumentId, type, createdAt DESC);

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  type TEXT GENERATED ALWAYS AS (json_extract(data, '$.type')) VIRTUAL,
  page TEXT GENERATED ALWAYS AS (json_extract(data, '$.page')) VIRTUAL,
  ipHash TEXT GENERATED ALWAYS AS (json_extract(data, '$.ipHash')) VIRTUAL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX analytics_type_date ON analytics_events(type, createdAt DESC);
CREATE INDEX analytics_page ON analytics_events(page);
CREATE INDEX analytics_ip ON analytics_events(ipHash);

CREATE TABLE system_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'
    AND json_type(data, '$._id') IS 'text' AND json_extract(data, '$._id') = id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  event TEXT GENERATED ALWAYS AS (json_extract(data, '$.event')) VIRTUAL NOT NULL,
  backupId TEXT GENERATED ALWAYS AS (json_extract(data, '$.backupId')) VIRTUAL,
  jobId TEXT GENERATED ALWAYS AS (json_extract(data, '$.jobId')) VIRTUAL,
  createdAt TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX system_audit_date ON system_audit_logs(createdAt DESC);
CREATE INDEX system_audit_backup_date ON system_audit_logs(backupId, createdAt DESC);
CREATE INDEX system_audit_event_date ON system_audit_logs(event, createdAt DESC);
-- event is always present: Mongo's compound sparse index therefore includes
-- rows with a missing jobId as well as explicit null. Both share one null key.
CREATE UNIQUE INDEX system_audit_job_event_value ON system_audit_logs(jobId, event) WHERE jobId IS NOT NULL;
CREATE UNIQUE INDEX system_audit_job_event_null ON system_audit_logs(event) WHERE jobId IS NULL;
