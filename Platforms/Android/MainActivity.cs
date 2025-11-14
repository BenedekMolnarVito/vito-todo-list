using Android.App;
using Android.Content.PM;
using Android.OS;
using VitoTodoList.Platforms.Android.BackgroundJobs;

namespace VitoTodoList;

[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTop, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        
        // Schedule the daily backup job
        BackupScheduler.ScheduleDailyBackup(this);
    }
}
