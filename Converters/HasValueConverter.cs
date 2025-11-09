using System.Globalization;

namespace VitoTodoList.Converters
{
    public class HasValueConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is DateTime dateTime)
                return true;
            if (value == null)
                return false;
            if (value is string str)
                return !string.IsNullOrWhiteSpace(str);
            return value != null;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
