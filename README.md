# WHOOP → Notion Worker

This project runs entirely on [Notion Workers](https://developers.notion.com/workers/get-started/overview).
It connects directly to WHOOP with OAuth, creates a managed Notion database,
and refreshes recent health data every day. It does not need GitHub Actions, an
external server, a Notion API token, or a pre-created database.

Each row represents one WHOOP physiological cycle and includes strain,
calories, heart rate, recovery, HRV, sleep stages and scores, respiratory rate,
and aggregate workout data. The WHOOP cycle ID is the stable primary key, so
later runs update existing days instead of creating duplicates.

The Worker provides two syncs:

- `whoopDaily` revisits the latest seven days every 24 hours to capture new or
  recalculated WHOOP scores.
- `whoopBackfill` is a manual full-history import.

## Requirements

- A Notion **Business or Enterprise** workspace with Workers enabled by a
  workspace owner.
- A WHOOP membership.
- A free WHOOP developer account and app.
- Node.js 22+ and npm 10.9.2+ on the computer used for setup.

Workers are currently in beta. Notion hosts the code, schedule, OAuth tokens,
and managed database.

## Fresh installation

### 1. Clone and validate the project

```bash
git clone https://github.com/abhiy13/notion-whoop-sync.git
cd notion-whoop-sync
npm install
npm run check
npm test
```

Install the Notion CLI and sign in to the workspace that should own the Worker
and database:

```bash
npm install --global ntn
ntn login
ntn doctor
```

Check the workspace shown by `ntn doctor` before continuing. A Worker belongs
to one Notion workspace.

If Workers are not available, ask a workspace owner to enable them. To see
Workers in Notion, open **Settings → Developer Mode**, enable it, then use the
**Developer → Workers** section in the sidebar. Developer Mode is enabled
separately in the browser and desktop app and is not available on mobile.

### 2. Register the Worker and obtain its callback URL

Deploy once to register the Worker. Empty OAuth credentials are expected on
this bootstrap deployment:

```bash
ntn workers deploy --name whoop-sync
ntn workers oauth show-redirect-url
```

The callback currently printed by Notion is:

```text
https://app.notion.com/workers/oauth/callback
```

Use the value printed by your CLI as the source of truth. The callback is
hosted by Notion; this project does not need to expose its own web endpoint.

The first command creates the managed database with its default name,
`WHOOP Daily DB`. It also writes a local `workers.json` that associates this
checkout with the deployed Worker. That file is intentionally ignored by git
because it is specific to your workspace. On later deployments, omit `--name`;
the CLI targets the Worker identified by `workers.json`.

### 3. Create the app in WHOOP

1. Sign in to the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com/)
   with your WHOOP account.
2. Create a developer team if WHOOP prompts you to do so.
3. Create a new app. A name such as `Notion WHOOP Sync` makes its purpose clear.
4. Add the exact Notion callback URL from the previous step as a **Redirect
   URI**. WHOOP requires the URI in the authorization request to match the
   registered value. Do not add a trailing slash.
5. Enable these WHOOP data permissions:
   - `read:cycles`
   - `read:recovery`
   - `read:sleep`
   - `read:workout`
6. Create/save the app, then copy its **Client ID** and **Client Secret**.

The Worker requests the following OAuth scope string:

```text
offline read:cycles read:recovery read:sleep read:workout
```

`offline` is required for a refresh token so the daily job can continue without
asking you to sign in again. The authorization and token endpoints are already
configured in [`src/index.ts`](src/index.ts); they are not callback URLs and do
not need to be entered in the WHOOP dashboard.

Treat the Client Secret as a password. Do not put it in this repository, a
GitHub issue, screenshots, or command output shared with someone else.

### 4. Store configuration and deploy

Store the WHOOP credentials in Notion's encrypted Worker environment. Quote the
entire `KEY=value` argument so shell-special characters are handled safely:

```bash
ntn workers env set \
  'WHOOP_CLIENT_ID=your-actual-client-id' \
  'WHOOP_CLIENT_SECRET=your-actual-client-secret'
```

`NOTION_DATABASE_NAME` is optional and defaults to `WHOOP Daily DB`. It is used
only when Notion first creates a managed database binding. The standard
bootstrap above creates the database before remote environment variables can be
stored, so rename an existing database directly in Notion if you want a
different title. Changing the variable later does not rename it.

Confirm the variable names are present. Notion never prints their values:

```bash
ntn workers env list
```

Redeploy so the OAuth capability receives the stored credentials:

```bash
ntn workers deploy
```

The deployment registers these capabilities:

```text
oauth  whoopAuth
sync   whoopDaily
sync   whoopBackfill
```

Verify the deployment if desired:

```bash
ntn workers capabilities list
ntn workers databases list
```

### 5. Authorize your WHOOP account

Start the OAuth flow:

```bash
ntn workers oauth start whoopAuth
```

Sign in to WHOOP and grant the requested permissions. WHOOP redirects the
browser to Notion, and Notion securely stores the access and refresh tokens.
The Worker runtime refreshes the access token automatically.

If you change the WHOOP app, revoke its access, or need to connect a different
WHOOP account, run the same `oauth start` command again.

### 6. Preview and run the first sync

Previewing calls WHOOP and shows what would be written without changing the
database:

```bash
ntn workers sync trigger whoopDaily --preview
```

If the preview looks correct, run the first write:

```bash
ntn workers sync trigger whoopDaily
```

Notion then runs `whoopDaily` every 24 hours. The schedule is an interval from
the Notion scheduler, not a configurable local clock time or timezone.

To import all historical WHOOP cycles, preview and then trigger the manual
backfill:

```bash
ntn workers sync trigger whoopBackfill --preview
ntn workers sync trigger whoopBackfill
```

The backfill uses replace mode. It only deletes stale rows after every page of a
complete successful run, but previewing it first is still strongly recommended.

## Find and move the database

The managed database is named `WHOOP Daily DB` by default and appears with the
Worker in Notion. To place it in a teamspace or under another page:

1. Open the database as a full page.
2. Select `•••` in the top-right.
3. Select **Move to**.
4. Search for and select the destination teamspace or page.

You can also drag the database page into a teamspace in the sidebar. You need
**Full access** to the database and access to the destination. Moving it inside
the same workspace preserves the Worker binding because the database keeps its
identity. Do not duplicate it or move it to another workspace as a substitute;
that can create a different database that is not connected to this Worker.

Properties controlled by the sync and synced rows are read-only. You can add
your own editable properties and create or customize database views.

## Monitor runs and logs

### In Notion

1. Enable **Settings → Developer Mode**.
2. Open **Developer → Workers** in the sidebar.
3. Select `whoop-sync`.
4. Use **Overview**, **Logs**, **Environment Variables**, and **Settings**.

The Logs view is convenient for quick checks. Deployment and code changes still
use the CLI.

### From the terminal

Run these commands from this repository so the CLI finds its `workers.json`:

```bash
# Live status dashboard; press Ctrl+C to exit
ntn workers sync status

# Print one status snapshot
ntn workers sync status --no-watch

# List recent deploy, OAuth, and sync runs
ntn workers runs list

# Print logs for a run ID returned by the previous command
ntn workers runs logs <run-id>

# Show registered capabilities and database bindings
ntn workers capabilities list
ntn workers databases list

# Run now, bypassing the schedule
ntn workers sync trigger whoopDaily --preview
ntn workers sync trigger whoopDaily

# Temporarily stop or restart scheduled daily execution
ntn workers sync pause whoopDaily
ntn workers sync resume whoopDaily
```

In the recent-runs list, daily executions are named `sync:whoopDaily` and manual
history imports are named `sync:whoopBackfill`. Copy the corresponding run ID
into `ntn workers runs logs <run-id>` when investigating a failure.

## Local development

```bash
npm run check          # Type-check source and tests
npm test               # Run offline unit tests
npm run test:coverage  # Run tests with coverage
npm run build          # Compile the deployable Worker to dist/
```

After OAuth is connected, pull the remote environment and run a local preview:

```bash
ntn workers env pull
ntn workers sync trigger whoopDaily --preview --local
```

`env pull` creates a local `.env` containing secrets and a fresh OAuth access
token. Both `.env` and `workers.json` are ignored by git. Never commit or share
the `.env` file.

## Troubleshooting

### CLI reports no authentication token

```bash
ntn login
ntn doctor
```

Make sure `ntn doctor` resolves the intended workspace and reports Workers
access.

### `Capability "whoopAuth" not found`

The code has not registered successfully yet. Validate, deploy, and inspect the
capability list:

```bash
npm run check
npm run build
ntn workers deploy --verbose
ntn workers capabilities list
```

The list should contain `whoopAuth`, `whoopDaily`, and `whoopBackfill` before
starting OAuth.

### WHOOP reports a redirect mismatch

Compare the Redirect URI in the WHOOP Developer Dashboard with:

```bash
ntn workers oauth show-redirect-url
```

They must match exactly, including protocol, hostname, path, and trailing-slash
behavior. The expected hosted callback is currently
`https://app.notion.com/workers/oauth/callback`.

### A sync fails or produces no rows

```bash
ntn workers sync status --no-watch
ntn workers runs list
ntn workers runs logs <run-id>
ntn workers sync trigger whoopDaily --preview
```

If WHOOP authorization expired or was revoked, reconnect it with:

```bash
ntn workers oauth start whoopAuth
```

## Implementation notes

- The daily sync is incremental and leaves older rows untouched.
- The backfill is manual, paginated, and replace-mode.
- Both syncs share the same WHOOP OAuth connection and API pacer.
- Notion stores OAuth tokens and rotates WHOOP's refresh token safely. WHOOP
  invalidates the previous refresh token whenever it issues a new one.

The Worker manifest is in [`src/index.ts`](src/index.ts), WHOOP HTTP access is
isolated in [`src/whoop.ts`](src/whoop.ts), and data mapping is in
[`src/model.ts`](src/model.ts).
