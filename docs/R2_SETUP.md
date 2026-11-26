# Cloudflare R2 setup for the hosted database

This turns on durable storage for the hosted Wildcatter API on Render's free plan. Litestream copies the SQLite database to a Cloudflare R2 bucket and restores it every time Render starts a fresh instance. Accounts, trades and workspaces then survive deploys, restarts and idle spin-downs.

The code is already in the repository ([litestream.yml](../litestream.yml), [scripts/start-hosted.sh](../scripts/start-hosted.sh), [scripts/fetch-litestream.sh](../scripts/fetch-litestream.sh), [render.yaml](../render.yaml)). Until the three settings in step 3 exist, the server runs exactly as before, with a database that resets.

Time needed: about 15 minutes.

## Before you start

- The Litestream changes must be committed and pushed to `main`, or Render will keep running the old start command.
- You need access to the Cloudflare account that already has R2 enabled and to the Render workspace that owns the `wildcatter` service.
- R2's free allowance (10 GB of storage plus monthly request limits) is shared by every bucket in the account. Wildcatter's database is a few megabytes, so it fits unless your existing bucket is already near the limit. Check usage on the R2 overview page.

## Step 1: Create the bucket

1. Open the Cloudflare dashboard and go to **R2 Object Storage**.
2. Note your **Account ID**, shown on the R2 overview page. You need it in step 3.
3. Click **Create bucket**.
4. Name: `wildcatter-db`.
5. Location: choose **Asia-Pacific (APAC)** as the location hint (the Render service runs in Singapore). Leave the jurisdiction as default.
6. Default storage class: **Standard**.
7. Click **Create bucket**.

Do not make the bucket public and do not attach a custom domain. Only the server reads it.

## Step 2: Create an API token for this bucket only

1. On the R2 overview page, open **Manage API tokens** (also labelled **API** → **Manage API tokens**).
2. Click **Create Account API token**. If your plan only shows **Create User API token**, use that.
3. Token name: `wildcatter-litestream`.
4. Permissions: **Object Read & Write**.
5. Specify bucket(s): **Apply to specific buckets only**, then pick `wildcatter-db`.
6. TTL: **Forever**, or a date you will remember to rotate before.
7. Client IP address filtering: leave empty. Render's outbound addresses can change.
8. Click **Create API token**.
9. Copy these two values now. Cloudflare shows the secret only once:
   - **Access Key ID**
   - **Secret Access Key**

Keep them out of chat, commits and screenshots. A password manager is the right place.

## Step 3: Add the settings in Render

1. Open the Render dashboard → service **wildcatter** → **Environment**.
2. Add these three variables. Replace `<ACCOUNT_ID>` with the value from step 1.

| Key                            | Value                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `LITESTREAM_REPLICA_URL`       | `s3://wildcatter-db/wildcatter?endpoint=https://<ACCOUNT_ID>.r2.cloudflarestorage.com&region=auto` |
| `LITESTREAM_ACCESS_KEY_ID`     | Access Key ID from step 2                                                                     |
| `LITESTREAM_SECRET_ACCESS_KEY` | Secret Access Key from step 2                                                                 |

3. Click **Save changes**. Choose **Save only** if Render offers it; the deploy in step 5 picks them up.

The URL has no spaces and no trailing slash. `wildcatter` after the bucket name is the folder Litestream writes into.

## Step 4: Check the build and start commands

Open **Settings** on the same service and compare:

| Field         | Must be                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| Build Command | `npm ci --include=dev && npm run build && sh scripts/fetch-litestream.sh`   |
| Start Command | `sh scripts/start-hosted.sh`                                                |

If the service is synced from the Blueprint, these update by themselves after the push. If they still show the old values (`node dist-server/server/index.js`), paste the new ones and save.

## Step 5: Deploy

1. Push the commit to `main`, or use **Manual Deploy** → **Deploy latest commit**.
2. Watch the build log. Near the end it prints `0.5.18` (the Litestream version) after `bin/litestream-0.5.18-linux-x86_64.tar.gz: OK`.
3. Watch the service log after the deploy goes live. On the very first start you should see, in order:
   - `attempting restore before replication`
   - `no backup found, starting fresh`
   - `replicating to` … `type=s3`
   - `snapshot complete`
   - `Server listening at …`

On later starts, the second line reads `restore completed` instead.

## Step 6: Prove it works

1. In Cloudflare, open the `wildcatter-db` bucket. A `wildcatter/ltx/` folder should exist within a minute of the deploy.
2. Open the app at https://wildcatter-welcome.onrender.com, finish onboarding with a recognisable display name, and place one trade.
3. Wait 15 seconds (changes upload every 10 seconds).
4. In Render: **Manual Deploy** → **Restart service**.
5. When the service is back, reload the app in the same browser. The display name, balance and trade should still be there.

If they are, you are done.

## Troubleshooting

| Log line or symptom                                                        | Cause and fix                                                                                                                            |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `start-hosted: LITESTREAM_REPLICA_URL unset; database is ephemeral`        | The variable is missing or misspelled on this service. Add it (step 3) and redeploy.                                                     |
| `./bin/litestream: not found`                                              | The build command is still the old one. Fix it (step 4) and redeploy.                                                                    |
| `sha256sum: WARNING: 1 computed checksum did NOT match`                    | The download was corrupted or tampered with. Redeploy once; if it repeats, stop and investigate before changing the pinned checksum.     |
| `AccessDenied` or `SignatureDoesNotMatch`                                  | Wrong key pair, a space pasted into a value, or the token is not allowed on `wildcatter-db`. Re-check step 2 and step 3.                |
| `NoSuchBucket`                                                             | Bucket name in `LITESTREAM_REPLICA_URL` does not match the bucket. Names are case-sensitive.                                             |
| `no such host` or a DNS error mentioning `r2.cloudflarestorage.com`        | The Account ID in the endpoint is wrong.                                                                                                 |
| Server never starts after a restore error                                  | Delete `LITESTREAM_REPLICA_URL` in Render to boot with an empty database, then fix the cause. The backup in R2 is untouched.             |
| Data from the last few seconds before a deploy is missing                  | Known limit of the free plan: the old and new instance overlap briefly during a deploy. A paid instance with a disk removes the overlap. |

## Later maintenance

- **Rotate the token** at least yearly, or immediately if it leaks: create a new token (step 2), update both Render variables, redeploy, then delete the old token in Cloudflare.
- **Take a local copy** of the hosted database from any machine with Litestream installed:

  ```sh
  export LITESTREAM_ACCESS_KEY_ID=...
  export LITESTREAM_SECRET_ACCESS_KEY=...
  litestream restore -o wildcatter-copy.sqlite "s3://wildcatter-db/wildcatter?endpoint=https://<ACCOUNT_ID>.r2.cloudflarestorage.com&region=auto"
  ```

- **Watch the free allowance** on the R2 overview page once a month. Normal demo traffic stays far below it.
- **What is not backed up:** AI provider overrides saved under `data/providers/` are files, not database rows, and still reset when the instance restarts.
