using Google.Apis.Auth.OAuth2;
using Google.Apis.Drive.v3;
using Google.Apis.Services;
using Google.Apis.Upload;
using Google.Apis.Util.Store;
using System.Text;
using System.Text.Json;

namespace VitoTodoList.Services;

/// <summary>
/// Service for uploading backup files to Google Drive using OAuth2 authentication.
/// Requires one-time user authentication, then uses refresh tokens for background jobs.
/// </summary>
public class GoogleDriveService
{
    private const string FolderName = "VitoTodoList_BCP";
    private const string FolderId = "1zmGasFxgsfpqevZ06G-R04dvNsG3zsWL";
    private readonly string[] _scopes = { DriveService.Scope.DriveFile };
    private const string CredentialsFileName = "google_oauth_credentials.json";
    private const string TokenStoreFolderName = "DriveTokenStore";

    /// <summary>
    /// Uploads a JSON backup file to Google Drive.
    /// Uses stored OAuth2 tokens (refresh token automatically gets new access tokens).
    /// </summary>
    /// <param name="jsonContent">The JSON content to upload</param>
    /// <param name="fileName">The name of the file</param>
    /// <returns>True if upload succeeded, false otherwise</returns>
    public async Task<bool> UploadBackupAsync(string jsonContent, string fileName)
    {
        try
        {
            var credential = await GetUserCredentialAsync();
            if (credential == null)
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: No user credentials available. User needs to authenticate first.");
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
    /// Gets OAuth2 user credentials. Uses stored refresh token to automatically obtain new access tokens.
    /// This works in background jobs without user interaction after initial authentication.
    /// </summary>
    private async Task<UserCredential?> GetUserCredentialAsync()
    {
        try
        {
            var credentialsPath = Path.Combine(FileSystem.AppDataDirectory, CredentialsFileName);
            
            if (!File.Exists(credentialsPath))
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: No OAuth credentials file found");
                return null;
            }

            var credentialsJson = await File.ReadAllTextAsync(credentialsPath);
            var clientSecrets = JsonSerializer.Deserialize<ClientSecretsJson>(credentialsJson);
            
            if (clientSecrets?.installed == null)
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: Invalid credentials format");
                return null;
            }

            var secrets = new ClientSecrets
            {
                ClientId = clientSecrets.installed.client_id,
                ClientSecret = clientSecrets.installed.client_secret
            };

            var tokenStorePath = Path.Combine(FileSystem.AppDataDirectory, TokenStoreFolderName);
            
            // This will use stored refresh token to get new access token automatically
            var credential = await GoogleWebAuthorizationBroker.AuthorizeAsync(
                secrets,
                _scopes,
                "user",
                CancellationToken.None,
                new FileDataStore(tokenStorePath, true)
            );

            System.Diagnostics.Debug.WriteLine("GoogleDriveService: Successfully loaded OAuth credentials");
            return credential;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Failed to get OAuth credentials - {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Initiates OAuth2 authentication flow using WebAuthenticator (works on mobile).
    /// User must complete this once, then background jobs work automatically.
    /// </summary>
    /// <param name="credentialsJson">The OAuth2 client credentials JSON from Google Cloud Console</param>
    public async Task<bool> AuthenticateAsync(string credentialsJson)
    {
        try
        {
            // Save credentials file
            var credentialsPath = Path.Combine(FileSystem.AppDataDirectory, CredentialsFileName);
            await File.WriteAllTextAsync(credentialsPath, credentialsJson);

            // Parse credentials
            var clientSecrets = JsonSerializer.Deserialize<ClientSecretsJson>(credentialsJson);
            
            if (clientSecrets?.installed == null)
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: Invalid credentials JSON format");
                return false;
            }

            var clientId = clientSecrets.installed.client_id;
            var clientSecret = clientSecrets.installed.client_secret;
            
            // Use reversed client ID format for Android OAuth (com.googleusercontent.apps.CLIENT_ID_PREFIX)
            var clientIdPrefix = clientId.Split('.')[0];
            var redirectUri = $"com.googleusercontent.apps.{clientIdPrefix}:/oauth2redirect";
            
            // Use WebAuthenticator for mobile OAuth2 flow
            var authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
                $"client_id={Uri.EscapeDataString(clientId)}" +
                $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                $"&response_type=code" +
                $"&scope={Uri.EscapeDataString(string.Join(" ", _scopes))}" +
                $"&access_type=offline" +
                $"&prompt=consent";

            var callbackUrl = redirectUri;
            
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Starting WebAuthenticator with URL: {authUrl}");
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Callback URL: {callbackUrl}");

            WebAuthenticatorResult? authResult = null;
            
            try
            {
                authResult = await WebAuthenticator.AuthenticateAsync(
                    new Uri(authUrl),
                    new Uri(callbackUrl)
                );
            }
            catch (TaskCanceledException)
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: WebAuthenticator was cancelled by user");
                return false;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"GoogleDriveService: WebAuthenticator failed - {ex.GetType().Name}: {ex.Message}");
                
                // Fallback: Copy URL to clipboard and let user open it manually
                await Clipboard.SetTextAsync(authUrl);
                throw new Exception($"Could not open browser automatically. The authentication URL has been copied to your clipboard. Please:\n\n1. Open Chrome or Firefox\n2. Paste the URL (long press in address bar)\n3. Sign in and grant access\n4. After 'redirect_uri_mismatch' error, copy the ENTIRE URL from browser\n5. Return to app and tap 'Setup Backup' again\n\nFor now, setup failed. Error: {ex.Message}");
            }

            if (authResult != null && authResult.Properties.TryGetValue("code", out var authCode))
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: Got authorization code, exchanging for tokens");
                
                // Exchange authorization code for tokens
                var tokenResponse = await ExchangeCodeForTokensAsync(authCode, clientId, clientSecret, redirectUri);
                
                if (tokenResponse != null)
                {
                    // Save tokens
                    var tokenStorePath = Path.Combine(FileSystem.AppDataDirectory, TokenStoreFolderName);
                    Directory.CreateDirectory(tokenStorePath);
                    
                    var tokenFilePath = Path.Combine(tokenStorePath, "Google.Apis.Auth.OAuth2.Responses.TokenResponse-user");
                    await File.WriteAllTextAsync(tokenFilePath, JsonSerializer.Serialize(tokenResponse));
                    
                    System.Diagnostics.Debug.WriteLine("GoogleDriveService: Authentication successful, tokens saved");
                    return true;
                }
            }

            System.Diagnostics.Debug.WriteLine("GoogleDriveService: Authentication failed - no authorization code received");
            return false;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Authentication failed - {ex.Message}");
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Stack trace - {ex.StackTrace}");
            return false;
        }
    }

    /// <summary>
    /// Generates authentication URL for manual OAuth flow.
    /// </summary>
    public async Task<string?> GetAuthenticationUrlAsync(string credentialsJson)
    {
        try
        {
            var clientSecrets = JsonSerializer.Deserialize<ClientSecretsJson>(credentialsJson);
            
            if (clientSecrets?.installed == null)
            {
                return null;
            }

            var clientId = clientSecrets.installed.client_id;
            // Use reversed client ID format for Android OAuth
            var clientIdPrefix = clientId.Split('.')[0];
            var redirectUri = $"com.googleusercontent.apps.{clientIdPrefix}:/oauth2redirect";
            
            var authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
                $"client_id={Uri.EscapeDataString(clientId)}" +
                $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                $"&response_type=code" +
                $"&scope={Uri.EscapeDataString(string.Join(" ", _scopes))}" +
                $"&access_type=offline" +
                $"&prompt=consent";

            await Task.CompletedTask;
            return authUrl;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Failed to generate auth URL - {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Completes authentication with manual authorization code entry.
    /// </summary>
    public async Task<bool> CompleteAuthenticationAsync(string credentialsJson, string authorizationCode)
    {
        try
        {
            // Save credentials file
            var credentialsPath = Path.Combine(FileSystem.AppDataDirectory, CredentialsFileName);
            await File.WriteAllTextAsync(credentialsPath, credentialsJson);

            var clientSecrets = JsonSerializer.Deserialize<ClientSecretsJson>(credentialsJson);
            
            if (clientSecrets?.installed == null)
            {
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: Invalid credentials JSON");
                return false;
            }

            var clientId = clientSecrets.installed.client_id;
            var clientSecret = clientSecrets.installed.client_secret;
            // Use reversed client ID format for Android OAuth
            var clientIdPrefix = clientId.Split('.')[0];
            var redirectUri = $"com.googleusercontent.apps.{clientIdPrefix}:/oauth2redirect";

            // Exchange authorization code for tokens
            var tokenResponse = await ExchangeCodeForTokensAsync(authorizationCode, clientId, clientSecret, redirectUri);
            
            if (tokenResponse != null)
            {
                // Save tokens
                var tokenStorePath = Path.Combine(FileSystem.AppDataDirectory, TokenStoreFolderName);
                Directory.CreateDirectory(tokenStorePath);
                
                var tokenFilePath = Path.Combine(tokenStorePath, "Google.Apis.Auth.OAuth2.Responses.TokenResponse-user");
                await File.WriteAllTextAsync(tokenFilePath, JsonSerializer.Serialize(tokenResponse));
                
                System.Diagnostics.Debug.WriteLine("GoogleDriveService: Manual authentication successful");
                return true;
            }

            return false;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Manual authentication failed - {ex.Message}");
            return false;
        }
    }

    private async Task<TokenResponseData?> ExchangeCodeForTokensAsync(string authCode, string clientId, string clientSecret, string redirectUri)
    {
        try
        {
            var tokenEndpoint = "https://oauth2.googleapis.com/token";
            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                { "code", authCode },
                { "client_id", clientId },
                { "client_secret", clientSecret },
                { "redirect_uri", redirectUri },
                { "grant_type", "authorization_code" }
            });

            using var client = new HttpClient();
            var response = await client.PostAsync(tokenEndpoint, content);
            var responseContent = await response.Content.ReadAsStringAsync();
            
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Token response: {responseContent}");

            if (response.IsSuccessStatusCode)
            {
                var tokenData = JsonSerializer.Deserialize<Dictionary<string, object>>(responseContent);
                
                if (tokenData != null)
                {
                    return new TokenResponseData
                    {
                        AccessToken = tokenData.ContainsKey("access_token") ? tokenData["access_token"].ToString() : null,
                        RefreshToken = tokenData.ContainsKey("refresh_token") ? tokenData["refresh_token"].ToString() : null,
                        ExpiresInSeconds = tokenData.ContainsKey("expires_in") ? long.Parse(tokenData["expires_in"].ToString()!) : 3600,
                        IssuedUtc = DateTime.UtcNow
                    };
                }
            }

            return null;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Token exchange failed - {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Checks if user has authenticated (has valid OAuth tokens stored).
    /// </summary>
    public bool IsAuthenticated()
    {
        try
        {
            var credentialsPath = Path.Combine(FileSystem.AppDataDirectory, CredentialsFileName);
            var tokenStorePath = Path.Combine(FileSystem.AppDataDirectory, TokenStoreFolderName);
            
            // Check if both credentials file and token store exist
            return File.Exists(credentialsPath) && Directory.Exists(tokenStorePath);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Clears all stored authentication data.
    /// </summary>
    public async Task<bool> RevokeAuthenticationAsync()
    {
        try
        {
            var credentialsPath = Path.Combine(FileSystem.AppDataDirectory, CredentialsFileName);
            var tokenStorePath = Path.Combine(FileSystem.AppDataDirectory, TokenStoreFolderName);

            if (File.Exists(credentialsPath))
            {
                File.Delete(credentialsPath);
            }

            if (Directory.Exists(tokenStorePath))
            {
                Directory.Delete(tokenStorePath, true);
            }

            System.Diagnostics.Debug.WriteLine("GoogleDriveService: Authentication revoked");
            await Task.CompletedTask;
            return true;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GoogleDriveService: Failed to revoke authentication - {ex.Message}");
            return false;
        }
    }

    // Helper classes for OAuth2
    private class ClientSecretsJson
    {
        public InstalledApp? installed { get; set; }
    }

    private class InstalledApp
    {
        public string client_id { get; set; } = string.Empty;
        public string client_secret { get; set; } = string.Empty;
        public string[] redirect_uris { get; set; } = Array.Empty<string>();
    }

    private class TokenResponseData
    {
        public string? AccessToken { get; set; }
        public string? RefreshToken { get; set; }
        public long? ExpiresInSeconds { get; set; }
        public DateTime IssuedUtc { get; set; }
    }
}
