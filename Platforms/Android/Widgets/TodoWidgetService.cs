using Android.App;
using Android.Content;
using Android.Widget;

namespace VitoTodoList.Platforms.Android.Widgets;

[Service(Permission = "android.permission.BIND_REMOTEVIEWS", Exported = false)]
public class TodoWidgetService : RemoteViewsService
{
    public override IRemoteViewsFactory? OnGetViewFactory(Intent? intent)
    {
        return new TodoWidgetFactory(this.ApplicationContext);
    }
}
