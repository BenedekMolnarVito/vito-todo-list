using Google.Apis.Auth.OAuth2;
using Google.Apis.Drive.v3;
using Google.Apis.Services;
using Google.Apis.Upload;
using System.Text;

namespace VitoTodoList.Services;

/// <summary>
/// Service for uploading backup files to Google Drive using service account authentication.
/// The service account JSON key is embedded as an Android raw resource.
/// </summary>
public class GoogleDriveService
{
    private const string FolderName = "VitoTodoList_BCP";
    private const string FolderId = "1zmGasFxgsfpqevZ06G-R04dvNsG3zsWL";
    private readonly string[] _scopes = { DriveService.Scope.DriveFile };

    /// <summary>
    /// Uploads a JSON backup file to Google Drive.
    /// </summary>
    /// <param name="jsonContent">The JSON content to upload</param>
    /// <param name="fileName">The name of the file</param>
    /// <returns>True if upload succeeded, false otherwise</returns>
    public async Task<bool> UploadBackupAsync(string jsonContent, string fileName)
    {
        try
        {
            var credential = await GetServiceAccountCredentialAsync();
            if (credential == null)
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: No service account credentials available");
                return false;
            }

            var driveService = new DriveService(new BaseClientService.Initializer()
            {
                HttpClientInitializer = credential,
                ApplicationName = "VitoTodoList"
            });

            var fileMetadata = new Google.Apis.Drive.v3.Data.File()
            {
                Name = fileName,
                Parents = new List<string> { FolderId },
                MimeType = "application/json"
            };

            var stream = new MemoryStream(Encoding.UTF8.GetBytes(jsonContent));
            
            var request = driveService.Files.Create(fileMetadata, stream, "application/json");
            request.Fields = "id, name";

            var uploadProgress = await request.UploadAsync();
            
            if (uploadProgress.Status == UploadStatus.Completed)
            {
                System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Successfully uploaded {fileName}");
                return true;
            }
            else
            {
                System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Upload failed with status {uploadProgress.Status}");
                if (uploadProgress.Exception != null)
                {
                    System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Exception - {uploadProgress.Exception.Message}");
                    System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Stack trace - {uploadProgress.Exception.StackTrace}");
                    if (uploadProgress.Exception.InnerException != null)
                    {
                        System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Inner exception - {uploadProgress.Exception.InnerException.Message}");
                    }
                }
                return false;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Upload failed - {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Gets service account credentials from the embedded resource file.
    /// </summary>
    private async Task<GoogleCredential?> GetServiceAccountCredentialAsync()
    {
        try
        {
#if ANDROID
            // Read service account JSON from Android raw resources
            var context = Android.App.Application.Context;
            using var inputStream = context.Resources?.OpenRawResource(Resource.Raw.service_account);
            
            if (inputStream == null)
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: Could not open service account resource");
                return null;
            }

            var credential = GoogleCredential.FromStream(inputStream)
                .CreateScoped(_scopes);

            System.Diagnostics.Debug.WriteLine("GoogleDriveService: Successfully loaded service account credentials");
            return credential;
#else
            System.Diagnostics.Debug.WriteLine("GoogleDriveService: Service account authentication only available on Android");
            await Task.CompletedTask;
            return null;
#endif
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Failed to get service account credentials - {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Checks if service account credentials are available.
    /// </summary>
    public bool IsAuthenticated()
    {
#if ANDROID
        try
        {
            var context = Android.App.Application.Context;
            using var inputStream = context.Resources?.OpenRawResource(Resource.Raw.service_account);
            return inputStream != null;
        }
        catch
        {
            return false;
        }
#else
        return false;
#endif
    }
}
