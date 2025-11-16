using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using VitoTodoList.Platforms.Android.BackgroundJobs;

namespace VitoTodoList;

[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTop, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
[IntentFilter(
    new[] { Intent.ActionView },
    Categories = new[] { Intent.CategoryDefault, Intent.CategoryBrowsable },
    DataSchemes = new[] { "com.googleusercontent.apps.192162290350-s12ksv6qse7lvnakljmlbiqv35vfui6p" },
    DataHost = "oauth2redirect"
)]
public class MainActivity : MauiAppCompatActivity
{
    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        
        // Schedule the daily backup job
        BackupScheduler.ScheduleDailyBackup(this);
    }
}
