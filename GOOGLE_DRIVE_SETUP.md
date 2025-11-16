# Google Drive Backup Setup Guide

## Overview
The app includes automatic daily backup functionality that uploads your todo list to Google Drive at 3 AM every day. This guide explains how to set up the required Google Drive authentication.

## Google Cloud Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your Project ID for later use

### 2. Enable Google Drive API

1. In the Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click **Enable**

### 3. Create OAuth 2.0 Credentials

**⚠️ CRITICAL: You need TWO credential types - Android AND iOS (for custom scheme)**

#### Part A: Create Android OAuth Client

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Android** as the application type
4. Enter the following details:
   - **Name**: VitoTodoList Android
   - **Package name**: `app.servimus.vitotodolist`
   - **SHA-1 certificate fingerprint**: Get this by running:
     ```bash
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
     ```
     Or on Windows:
     ```powershell
     keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
     ```
5. Click **Create**

#### Part B: Create iOS OAuth Client

1. Click **Create Credentials** → **OAuth client ID** again
2. Choose **iOS** as the application type
3. Enter the following:
   - **Name**: VitoTodoList iOS
   - **Bundle ID**: `app.servimus.vitotodolist`
4. Click **Create**
5. You'll see it downloads a `.plist` file - **ignore this for now**

#### Part C: Get Client ID and Secret

Since iOS clients don't provide JSON download, you need to create it manually:

1. Click on your **iOS OAuth client** name to view details
2. Copy the **Client ID** (looks like: `192162290350-xxx.apps.googleusercontent.com`)
3. Note: iOS clients don't have a client secret shown, so we'll use a placeholder

4. Create a JSON file with this format:
   ```json
   {
     "installed": {
       "client_id": "YOUR_CLIENT_ID_FROM_STEP_2",
       "client_secret": "",
       "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob"],
       "auth_uri": "https://accounts.google.com/o/oauth2/auth",
       "token_uri": "https://oauth2.googleapis.com/token"
     }
   }
   ```

**Example** (using your Client ID from the screenshot):
```json
{
  "installed": {
    "client_id": "192162290350-s12ksv6qse7lvnakljmlbiqv35vfui6p.apps.googleusercontent.com",
    "client_secret": "",
    "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob"],
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }
}
```

5. Copy this entire JSON - this is what you'll paste in the app

### 4. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace account)
3. Fill in required fields:
   - App name: VitoTodoList
   - User support email: Your email
   - Developer contact: Your email
4. Add scope: `https://www.googleapis.com/auth/drive.file`
5. Add your Google account as a test user

## App Configuration

### OAuth 2.0 Setup (Current Implementation)

The app uses **OAuth 2.0 user authentication** for Google Drive backups. This requires **one-time user authentication**, after which background backups work automatically.

#### How It Works

1. **First-time setup** (one-time only):
   - User taps "Setup Backup" button in the app
   - Pastes OAuth 2.0 credentials JSON
   - Browser opens for Google sign-in
   - User grants permission to access Drive
   - App stores refresh token locally

2. **Background backups** (automatic):
   - Daily at 3 AM, WorkManager runs backup job
   - Uses stored refresh token to get new access token
   - No user interaction needed
   - Refresh token doesn't expire unless revoked

3. **Token refresh**:
   - Access tokens expire after ~1 hour
   - Google APIs library automatically uses refresh token to get new access tokens
   - This happens transparently in background jobs
   - No user sees this happening

#### Initial Setup Steps

1. **Get OAuth 2.0 Credentials from Google Cloud Console**:
   - Go to https://console.cloud.google.com/
   - Select your project: **vitotodolist**
   - Go to **APIs & Services** → **Credentials**
   - Find your Android OAuth 2.0 Client ID
   - Click the **Download JSON** button (download icon)
   - Open the downloaded JSON file and copy its entire contents

2. **Configure in the App**:
   - Open VitoTodoList app
   - Tap **"Setup Backup"** button
   - When prompted, paste the entire OAuth JSON credentials
   - Tap **OK**
   - A browser (Chrome/Firefox) will open automatically
   - Sign in with your Google account
   - Click **"Allow"** to grant Drive access
   - Browser will close and return to app
   - You'll see "Google Drive backup is now configured!" message

3. **Test the Setup**:
   - Tap **"Backup Now"** to test immediately
   - Check your Google Drive folder: **VitoTodoList_BCP**
   - You should see a JSON backup file with timestamp

**Troubleshooting**:
- **"400 invalid_request - loopback flow blocked"**: Use the **iOS credential**, not Android
- **Browser doesn't open (MIUI/HyperOS)**: Use "Manual" method - works on all devices
- **"Authentication failed"**: Check that:
  - You're using the **iOS credential JSON** (created manually from client ID)
  - The JSON format is correct (starts with `{"installed":...`)
  - The client_id is copied exactly from Google Cloud Console
- **"redirect_uri_mismatch"**: The app automatically generates the correct redirect URI from your client ID

#### Important Notes

- **One-time authentication**: You only need to authenticate once. After that, background jobs work automatically.
- **Refresh tokens**: These don't expire unless you revoke access in your Google account settings.
- **Re-authentication**: If you revoke access, just tap "Setup Backup" again.
- **Security**: OAuth tokens are stored in the app's private data directory, not accessible by other apps.

#### Folder Requirements

- **Folder Name**: `VitoTodoList_BCP`
- **Folder ID**: `1zmGasFxgsfpqevZ06G-R04dvNsG3zsWL`
- **Permissions**: Your Google account (the one you authenticate with) must have write access to this folder

## Backup Folder

The app backs up to this specific Google Drive folder:
- **Folder Name**: `VitoTodoList_BCP`
- **Folder ID**: `1zmGasFxgsfpqevZ06G-R04dvNsG3zsWL`
- **URL**: https://drive.google.com/drive/u/0/folders/1zmGasFxgsfpqevZ06G-R04dvNsG3zsWL

Make sure this folder exists in your Google Drive and you have write access to it.

## Backup Schedule

- **Frequency**: Daily at 3:00 AM
- **Queue**: If the device is offline at backup time, the backup is queued
- **Retry**: Failed backups are retried up to 5 times
- **Cleanup**: Old backups (>7 days) are automatically cleaned from the queue

## Testing

To test the backup functionality immediately:

1. Build and run the app
2. The backup worker will be scheduled automatically
3. To trigger an immediate backup for testing, you can add a button that calls:
   ```csharp
   BackupScheduler.TriggerImmediateBackup(Android.App.Application.Context);
   ```

## Troubleshooting

### Backup Not Running
- Check that the app has **INTERNET** and **ACCESS_NETWORK_STATE** permissions
- Verify you have network connectivity
- Check debug logs for error messages

### Authentication Failed
- Verify your Client ID and Secret are correct
- Ensure the SHA-1 fingerprint matches your signing certificate
- Check that your Google account is added as a test user

### Upload Failed
- Verify the Google Drive folder ID is correct
- Check that the folder is shared with your account
- Ensure you have write permissions to the folder

## Security Notes

⚠️ **Important Security Considerations**:

1. **Never commit OAuth credentials to version control**
2. Store credentials securely using Android's encrypted preferences or KeyStore
3. For production, implement proper token refresh and expiration handling
4. Consider using the Google Sign-In SDK for better security and UX
5. Rotate credentials if they are ever compromised

## Support

For issues or questions about the backup feature:
- Check the debug logs in Android Studio or Logcat
- Review the WorkManager logs for background job execution
- Verify Google Drive API quotas haven't been exceeded
