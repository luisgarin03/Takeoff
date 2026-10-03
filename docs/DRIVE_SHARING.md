# Direct Google Drive sharing setup

This flow stores invitation metadata in Supabase, not file contents. It grants a user `reader` permission on the sender's selected Google Drive files. Google supplies sharing email notifications. The recipient's app downloads bounded chunks from those original files through the authenticated Drive function, checks the invitation and current Drive permission for every chunk, writes selected files to a new local synced-Drive folder, and opens the selected .otk archive.

## Deployment

1. Apply `supabase/migrations/202610030001_project_invitations.sql` after the existing migrations. RLS exposes ready invitations only to the verified recipient email or sender. Clients cannot create or modify invitation rows; the Drive function reserves them through a service-role-only, rate-limited procedure.
2. Enable Google Picker API in the same Google Cloud project as the existing Drive OAuth client. Keep the `drive.file` OAuth scope; no whole-Drive scope is added.
3. Create a Picker API key restricted to the app's web origins and `https://docs.google.com/*`, and to Google Picker API and Google Drive API. Set `OTK_DRIVE_PICKER_KEY` and `OTK_DRIVE_PICKER_APP_ID` (the numeric Google Cloud project number) as Supabase secrets.
4. Set `OTK_SHARE_APP_URL` to the deployed HTTPS app URL. Its origin must appear in `OTK_DRIVE_ALLOWED_ORIGINS`. This URL appears in Google's email message.
5. Deploy the updated `otk-drive` function and frontend. The function still authenticates every non-OAuth-callback request with `auth.getUser`. The Picker receives only the signed-in owner's short-lived access token; refresh tokens remain encrypted server-side and are never given to recipients. Do not log Picker credentials.
6. Verify with two consenting test accounts: select owned files, send an invitation, receive Google's email and the app notification, import only selected files, then remove the recipient permission in Drive and confirm later downloads are refused. No real invitations were sent by the automated fixtures.

Reference: [Google Picker setup](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample) and [Google Drive permissions.create](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/create).

## Semantics and limits

- Only explicitly selected ordinary files owned by the connected Google account can be shared. The picker provides per-file authorization. An .otk project is required; up to 30 files per invitation, 20 invitations per sender per day.
- Existing reader/editor permissions are preserved. Google sends emails only when this flow creates new permissions. A user who already has all file permissions receives the new in-app invitation but no new Google email.
- Invitations refer to live Drive files, not snapshots. At import, current names/sizes/modification times are read. Mid-download changes abort the operation. File contents are never uploaded to Supabase Storage.
- Import writes a new uniquely named folder, never overwrites an existing project, and opens only after all selected writes complete. Corrupt .otk files fail before any folder is created. Imports are capped at 512 MB per file to bound browser memory, although the Drive provider supports larger files elsewhere.
- Import currently uses the File System Access API and Google Drive for desktop. There is no server-side copy into the recipient's Drive account and no automatic folder import on mobile.
- Revoking/expiring an app invitation does not silently delete Drive ACLs. Manage permissions in Google's Share dialog. Existing imported copies remain with the recipient.
- A provider or network failure after granting some permissions may leave partial Drive grants. The app leaves the invitation in draft and reports the incomplete operation; review Google permissions before retrying. Google notification acceptance is not a guarantee of inbox delivery.
