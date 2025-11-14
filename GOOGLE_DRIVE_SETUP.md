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
5. Click **Create**
6. Note down your **Client ID** - you'll need this

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

### Option 1: In-App Authentication (Recommended)

The app will prompt you to authenticate when the first backup runs. You'll need to:

1. Store your OAuth2 credentials in the app data directory
2. Create a file at `/data/data/app.servimus.vitotodolist/files/google_drive_credentials.json`:
   ```json
   {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "client_secret": "YOUR_CLIENT_SECRET"
   }
   ```

**Note**: For production apps, consider using Android's secure storage mechanisms.

### Option 2: Service Account (For Automated Access)

If you want fully automated backups without user interaction:

1. In Google Cloud Console, go to **IAM & Admin** → **Service Accounts**
2. Create a new service account
3. Download the JSON key file
4. Share your Google Drive folder (`VitoTodoList_BCP`) with the service account email
5. Store the service account JSON in the app

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
