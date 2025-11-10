using Android.Graphics;
using AndroidView = Android.Views.View;
using AndroidPoint = Android.Graphics.Point;

namespace VitoTodoList.Platforms.Android;

public class CustomDragShadowBuilder : AndroidView.DragShadowBuilder
{
    private readonly AndroidView _view;
    private readonly float _opacity;

    public CustomDragShadowBuilder(AndroidView view, float opacity = 0.7f) : base(view)
    {
        _view = view;
        _opacity = opacity;
    }

    public override void OnProvideShadowMetrics(AndroidPoint? shadowSize, AndroidPoint? shadowTouchPoint)
    {
        if (shadowSize != null && shadowTouchPoint != null)
        {
            shadowSize.Set(_view.Width, _view.Height);
            shadowTouchPoint.Set(_view.Width / 2, _view.Height / 2);
        }
    }

    public override void OnDrawShadow(Canvas canvas)
    {
        // Save the current alpha
        var originalAlpha = _view.Alpha;
        
        // Set semi-transparent
        _view.Alpha = _opacity;
        
        // Draw the view
        _view.Draw(canvas);
        
        // Restore original alpha
        _view.Alpha = originalAlpha;
    }
}
