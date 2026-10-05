-- Keep account identity unique while preserving existing save and password formats.
-- Profile and friendship updates read the latest JSON under row locks in one transaction.
CREATE TABLE IF NOT EXISTS zoo_accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    account JSONB NOT NULL,
    CONSTRAINT zoo_accounts_identity CHECK (
        jsonb_typeof(account) = 'object'
        AND account->>'id' = id
        AND account->>'username' = username
    )
);

-- @statement
-- Durable idempotency results are independent of the latest profile revision.
CREATE TABLE IF NOT EXISTS zoo_action_receipts (
    actor_id TEXT NOT NULL REFERENCES zoo_accounts(id),
    request_id TEXT NOT NULL,
    receipt JSONB NOT NULL,
    PRIMARY KEY(actor_id,request_id)
);

-- @statement
-- Sign-ins share the durable account database; cookie values are never stored.
CREATE TABLE IF NOT EXISTS zoo_sessions (
    token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    account_id TEXT NOT NULL REFERENCES zoo_accounts(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
);

-- @statement
CREATE TABLE IF NOT EXISTS zoo_store_metadata (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);
