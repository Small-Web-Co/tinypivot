# TinyPivot Datasource Demo

Interactive demo for testing the TinyPivot datasource connections feature.

## Prerequisites

- Node.js 18+
- PostgreSQL database (for storing datasource configurations)

## Quick Start

### 1. Install dependencies

From the monorepo root:

```bash
pnpm install
pnpm build
```

### 2. Set up the database

Create a PostgreSQL database for the demo (or use an existing one):

```bash
# Create database (optional)
createdb tinypivot_demo

# Run the setup script
cd examples/datasource-demo
DATABASE_URL="postgresql://localhost:5432/tinypivot_demo" node setup-db.js
```

### 3. Start the server

```bash
DATABASE_URL="postgresql://localhost:5432/tinypivot_demo" node server.js
```

Or with custom encryption key:

```bash
DATABASE_URL="postgresql://localhost:5432/tinypivot_demo" \
CREDENTIAL_ENCRYPTION_KEY="your-32-char-secret-key-here!!!" \
node server.js
```

### 4. Open the demo

Navigate to [http://localhost:3456](http://localhost:3456) in your browser.

## Features

The demo lets you:

- **List datasources** - View all configured datasources
- **Add datasources** - Create new PostgreSQL or Snowflake connections
- **Snowflake SSO** - Connect to Snowflake using browser-based SSO
- **Test connections** - Verify datasources can connect
- **Delete datasources** - Remove user-created datasources
- **Raw API** - Test the API directly with custom payloads

## Testing with a Real Database

To test the connection feature with a real database, create a datasource pointing to any PostgreSQL database you have access to:

1. Click "Add Datasource" tab
2. Fill in your database connection details
3. Click "Create Datasource"
4. Click "Test" to verify the connection

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string for storing configs |
| `CREDENTIAL_ENCRYPTION_KEY` | No | 32+ char key for encrypting credentials (default provided for demo) |
| `PORT` | No | Server port (default: 3456) |

### Optional: Org-level Datasource

To test org-level datasources (configured via ENV), add:

```bash
ANALYTICS_HOST="your-analytics-db.example.com"
ANALYTICS_PORT="5432"
ANALYTICS_USER="readonly"
ANALYTICS_PASSWORD="secret"
ANALYTICS_DATABASE="analytics"
```

### Optional: Snowflake with Keypair Auth (Recommended for Production)

For production, use keypair authentication:

```bash
# Option 1: Using SNOWFLAKE_ prefix
SNOWFLAKE_ACCOUNT="xy12345.us-east-1"
SNOWFLAKE_USER="service_account"
SNOWFLAKE_PRIVATE_KEY_PATH="/path/to/rsa_key.p8"
SNOWFLAKE_PRIVATE_KEY_PASSPHRASE="optional-passphrase"
SNOWFLAKE_WAREHOUSE="COMPUTE_WH"
SNOWFLAKE_DATABASE="ANALYTICS"
SNOWFLAKE_SCHEMA="PUBLIC"
SNOWFLAKE_ROLE="ANALYST"

# Option 2: Using SF_ prefix (also supported)
SF_ACCOUNT="xy12345.us-east-1"
SF_USER="service_account"
SF_PRIVATE_KEY_PATH="/path/to/rsa_key.p8"
# ... etc
```

You can also provide the private key content directly:

```bash
SNOWFLAKE_PRIVATE_KEY="-----BEGIN ENCRYPTED PRIVATE KEY-----\n..."
```

**Generating a Keypair:**

```bash
# Generate encrypted private key
openssl genrsa 2048 | openssl pkcs8 -topk8 -v2 aes256 -inform PEM -out rsa_key.p8

# Generate public key
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub

# In Snowflake, assign the public key to your user:
# ALTER USER service_account SET RSA_PUBLIC_KEY='MII...';
```

### Optional: Snowflake with Password Auth

For development/testing with password auth:

```bash
SNOWFLAKE_ACCOUNT="xy12345.us-east-1"
SNOWFLAKE_USER="my_user"
SNOWFLAKE_PASSWORD="my_password"
SNOWFLAKE_WAREHOUSE="COMPUTE_WH"
```

### Optional: Snowflake Browser SSO (OAuth)

For browser-based SSO authentication (requires OAuth setup in Snowflake):

```bash
SNOWFLAKE_OAUTH_ACCOUNT="xy12345.us-east-1"
SNOWFLAKE_OAUTH_CLIENT_ID="your-client-id"
SNOWFLAKE_OAUTH_CLIENT_SECRET="your-client-secret"
SNOWFLAKE_OAUTH_REDIRECT_URI="http://localhost:3456/api/tinypivot/auth/snowflake/callback"
```

**Snowflake OAuth Setup:**

1. Create a security integration:
   ```sql
   CREATE SECURITY INTEGRATION tinypivot_oauth
     TYPE = OAUTH
     ENABLED = TRUE
     OAUTH_CLIENT = CUSTOM
     OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
     OAUTH_REDIRECT_URI = 'http://localhost:3456/api/tinypivot/auth/snowflake/callback'
     OAUTH_ISSUE_REFRESH_TOKENS = TRUE
     OAUTH_REFRESH_TOKEN_VALIDITY = 86400;
   ```
2. Get the client ID and secret:
   ```sql
   SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('TINYPIVOT_OAUTH');
   ```

## API Endpoints

All requests go to `POST /api/tinypivot` with a JSON body:

```javascript
// List all datasources
{ "action": "list-datasources", "userId": "user-123" }

// Create a datasource
{
  "action": "create-datasource",
  "userId": "user-123",
  "userKey": "user-secret",
  "datasourceConfig": {
    "name": "My DB",
    "type": "postgres",
    "connectionConfig": { "host": "localhost", "port": 5432, "database": "mydb" },
    "credentials": { "username": "user", "password": "pass" }
  }
}

// Test connection
{
  "action": "test-datasource",
  "datasourceId": "uuid-here",
  "userId": "user-123",
  "userKey": "user-secret"
}

// Delete datasource
{
  "action": "delete-datasource",
  "datasourceId": "uuid-here",
  "userId": "user-123"
}

// Start Snowflake OAuth flow (returns authorization URL)
{
  "action": "start-snowflake-oauth",
  "userId": "user-123",
  "userKey": "user-secret",
  "snowflakeDatasource": {
    "name": "My Snowflake",
    "account": "xy12345.us-east-1",
    "warehouse": "COMPUTE_WH",
    "database": "ANALYTICS",
    "schema": "PUBLIC"
  }
}
// Response: { "authorizationUrl": "https://..." }
// Open this URL in a popup, user authenticates, callback creates datasource
```

## Security Notes

This demo uses hardcoded user IDs and keys for simplicity. In production:

- `userId` should come from your authentication system
- `userKey` should be derived from the user's authentication (e.g., from their password hash or a separate user-specific secret)
- `CREDENTIAL_ENCRYPTION_KEY` should be a secure, randomly generated 32+ character string stored as a secret
