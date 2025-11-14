using Google.Apis.Auth.OAuth2;
using Google.Apis.Drive.v3;
using Google.Apis.Services;
using Google.Apis.Upload;
using Google.Apis.Util.Store;
using System.Text;

namespace VitoTodoList.Services;

/// <summary>
/// Service for uploading backup files to Google Drive.
/// Note: Requires OAuth2 credentials to be configured. See README for setup instructions.
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
            var credential = await GetCredentialAsync();
            if (credential == null)
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: No credentials available");
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
    /// Gets OAuth2 credentials for Google Drive access.
    /// This method needs to be implemented based on your authentication strategy.
    /// </summary>
    private async Task<UserCredential?> GetCredentialAsync()
    {
        try
        {
            // Check if we have stored credentials
            var credentialPath = Path.Combine(FileSystem.AppDataDirectory, "google_drive_credentials.json");
            
            if (!File.Exists(credentialPath))
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: No credentials file found. User needs to authenticate.");
                return null;
            }

            var credentialJson = await File.ReadAllTextAsync(credentialPath);
            
            // Load credentials from file
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(credentialJson));
            var credential = await GoogleWebAuthorizationBroker.AuthorizeAsync(
                GoogleClientSecrets.FromStream(stream).Secrets,
                _scopes,
                "user",
                CancellationToken.None,
                new FileDataStore(Path.Combine(FileSystem.AppDataDirectory, "DriveApiStore"), true)
            );

            return credential;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Failed to get credentials - {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Initiates OAuth2 authentication flow.
    /// This should be called from UI when user wants to setup backup.
    /// </summary>
    public async Task<bool> AuthenticateAsync(string clientId, string clientSecret)
    {
        try
        {
            var clientSecrets = new ClientSecrets
            {
                ClientId = clientId,
                ClientSecret = clientSecret
            };

            var credential = await GoogleWebAuthorizationBroker.AuthorizeAsync(
                clientSecrets,
                _scopes,
                "user",
                CancellationToken.None,
                new FileDataStore(Path.Combine(FileSystem.AppDataDirectory, "DriveApiStore"), true)
            );

            // Save credentials for future use
            var credentialPath = Path.Combine(FileSystem.AppDataDirectory, "google_drive_credentials.json");
            var credentialJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                client_id = clientId,
                client_secret = clientSecret
            });
            await File.WriteAllTextAsync(credentialPath, credentialJson);

            return credential != null;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Authentication failed - {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Checks if the user has authenticated with Google Drive.
    /// </summary>
    public bool IsAuthenticated()
    {
        var credentialPath = Path.Combine(FileSystem.AppDataDirectory, "google_drive_credentials.json");
        var storePath = Path.Combine(FileSystem.AppDataDirectory, "DriveApiStore");
        return File.Exists(credentialPath) && Directory.Exists(storePath);
    }
}
