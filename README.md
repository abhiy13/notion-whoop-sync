# WHOOP → Notion Worker

This is a native [Notion Worker](https://developers.notion.com/workers/get-started/overview)
that runs entirely on Notion's infrastructure. It authenticates directly with
WHOOP, creates a managed **WHOOP Daily Health** database, and updates it every
day. There is no GitHub Actions job, external server, Notion API token, or
pre-created database to maintain.

Each row represents one WHOOP physiological cycle and includes day strain,
calories, heart rate, recovery, HRV, sleep stages and scores, respiratory rate,
and aggregate workout data.

Rows use the WHOOP cycle ID as their stable primary key, so later runs update
existing days instead of creating duplicates. The daily sync revisits the last
seven days to capture late or recalculated scores. A separate manual backfill
can import the complete account history.

## Requirements

- A Notion **Business or Enterprise** workspace with Workers enabled by an owner.
- Node.js 22+ and npm 10+ for local development and deployment.
- A WHOOP membership and a WHOOP developer app.

Workers are currently in beta. Notion hosts the code and database. During the
beta, Workers are free to try on eligible plans; Notion says credit billing
starts on October 15, 2026.

## Set up

### 1. Install the project and Notion CLI

```bash
npm install
npm install --global ntn
ntn login
```

If your workspace owner has not already done so, enable Workers in Notion's
workspace settings. Developer Mode makes deployed Workers and their logs visible
in the Notion sidebar.

### 2. Register the Worker and get its OAuth callback

The first deployment registers the Worker and creates its managed database.
Empty OAuth credentials are expected on this first deployment.

```bash
ntn workers deploy --name whoop-sync
ntn workers oauth show-redirect-url
```

Copy the redirect URL printed by the second command.

### 3. Create the WHOOP app

1. Open the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com/).
2. Create an app and paste the Worker redirect URL into its redirect URL field.
3. Copy the WHOOP client ID and client secret.

The Worker requests only these scopes:

```text
offline read:cycles read:recovery read:sleep read:workout
```

### 4. Store credentials and connect WHOOP

Store the credentials in Notion's encrypted Worker environment, redeploy the
manifest, and complete WHOOP's OAuth flow:

```bash
ntn workers env set WHOOP_CLIENT_ID=your-client-id WHOOP_CLIENT_SECRET=your-client-secret
ntn workers deploy
ntn workers oauth start whoopAuth
```

Notion stores the access and refresh tokens and refreshes them automatically.
This matters because WHOOP invalidates the old refresh token whenever it issues
a new one.

### 5. Preview, run, and backfill

Preview the daily result without writing anything, then run it:

```bash
ntn workers sync trigger whoopDaily --preview
ntn workers sync trigger whoopDaily
```

After that, Notion runs `whoopDaily` every day. To import all historical WHOOP
cycles, trigger the manual replace-mode backfill once:

```bash
ntn workers sync trigger whoopBackfill --preview
ntn workers sync trigger whoopBackfill
```

The managed **WHOOP Daily Health** database appears with the Worker in Notion.
You can add your own editable properties and views; properties controlled by the
sync are read-only by design.

## Development and operations

```bash
npm run check                               # Type-check
npm test                                    # Offline model tests
ntn workers sync status                     # Live sync status
ntn workers runs list                       # Recent runs
ntn workers runs logs <run-id>              # Logs for one run
ntn workers capabilities disable whoopDaily # Pause the schedule
ntn workers capabilities enable whoopDaily  # Resume it
```

For local Worker execution after OAuth is connected:

```bash
ntn workers env pull
ntn workers sync trigger whoopDaily --preview --local
```

Keep the generated `.env` private; it is ignored by git.

## How the two syncs behave

- `whoopDaily` is incremental and runs every 24 hours. It fetches and upserts
  the latest seven days, leaving older rows untouched.
- `whoopBackfill` is manual and replace-mode. It paginates all cycles and, only
  after a fully successful run, removes rows that no longer exist upstream.
- Both syncs share a WHOOP API pacer and Notion's OAuth connection.

The Worker manifest is in [`src/index.ts`](src/index.ts), WHOOP HTTP access is
isolated in [`src/whoop.ts`](src/whoop.ts), and the testable mapping is in
[`src/model.ts`](src/model.ts).
