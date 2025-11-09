package crc64a59205c7b1c3ee7a;


public class TodoWidgetProvider
	extends android.appwidget.AppWidgetProvider
	implements
		mono.android.IGCUserPeer
{
/** @hide */
	public static final String __md_methods;
	static {
		__md_methods = 
			"n_onUpdate:(Landroid/content/Context;Landroid/appwidget/AppWidgetManager;[I)V:GetOnUpdate_Landroid_content_Context_Landroid_appwidget_AppWidgetManager_arrayIHandler\n" +
			"";
		mono.android.Runtime.register ("VitoTodoList.Platforms.Android.Widgets.TodoWidgetProvider, VitoTodoList", TodoWidgetProvider.class, __md_methods);
	}


	public TodoWidgetProvider ()
	{
		super ();
		if (getClass () == TodoWidgetProvider.class) {
			mono.android.TypeManager.Activate ("VitoTodoList.Platforms.Android.Widgets.TodoWidgetProvider, VitoTodoList", "", this, new java.lang.Object[] {  });
		}
	}


	public void onUpdate (android.content.Context p0, android.appwidget.AppWidgetManager p1, int[] p2)
	{
		n_onUpdate (p0, p1, p2);
	}

	private native void n_onUpdate (android.content.Context p0, android.appwidget.AppWidgetManager p1, int[] p2);

	private java.util.ArrayList refList;
	public void monodroidAddReference (java.lang.Object obj)
	{
		if (refList == null)
			refList = new java.util.ArrayList ();
		refList.add (obj);
	}

	public void monodroidClearReferences ()
	{
		if (refList != null)
			refList.clear ();
	}
}
