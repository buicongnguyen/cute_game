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
