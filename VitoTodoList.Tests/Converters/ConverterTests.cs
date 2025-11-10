using System.Globalization;
using VitoTodoList.Converters;

namespace VitoTodoList.Tests.Converters;

public class BoolToTextDecorationConverterTests
{
    private readonly BoolToTextDecorationConverter _converter;

    public BoolToTextDecorationConverterTests()
    {
        _converter = new BoolToTextDecorationConverter();
    }

    [Fact]
    public void Convert_True_ShouldReturnStrikethrough()
    {
        // Act
        var result = _converter.Convert(true, typeof(TextDecorations), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(TextDecorations.Strikethrough, result);
    }

    [Fact]
    public void Convert_False_ShouldReturnNone()
    {
        // Act
        var result = _converter.Convert(false, typeof(TextDecorations), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(TextDecorations.None, result);
    }

    [Fact]
    public void Convert_Null_ShouldReturnNone()
    {
        // Act
        var result = _converter.Convert(null, typeof(TextDecorations), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(TextDecorations.None, result);
    }

    [Fact]
    public void ConvertBack_ShouldThrowNotImplementedException()
    {
        // Act & Assert
        Assert.Throws<NotImplementedException>(() => 
            _converter.ConvertBack(TextDecorations.Strikethrough, typeof(bool), null, CultureInfo.InvariantCulture));
    }
}

public class HasValueConverterTests
{
    private readonly HasValueConverter _converter;

    public HasValueConverterTests()
    {
        _converter = new HasValueConverter();
    }

    [Fact]
    public void Convert_Null_ShouldReturnFalse()
    {
        // Act
        var result = _converter.Convert(null, typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(false, result);
    }

    [Fact]
    public void Convert_NullableWithValue_ShouldReturnTrue()
    {
        // Arrange
        DateTime? nullableDate = DateTime.Now;

        // Act
        var result = _converter.Convert(nullableDate, typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(true, result);
    }

    [Fact]
    public void Convert_NonNullValue_ShouldReturnTrue()
    {
        // Act
        var result = _converter.Convert("some value", typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(true, result);
    }

    [Fact]
    public void Convert_EmptyString_ShouldReturnTrue()
    {
        // Act
        var result = _converter.Convert("", typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(true, result);
    }

    [Fact]
    public void ConvertBack_ShouldThrowNotImplementedException()
    {
        // Act & Assert
        Assert.Throws<NotImplementedException>(() => 
            _converter.ConvertBack(true, typeof(DateTime?), null, CultureInfo.InvariantCulture));
    }
}

public class StringToBoolConverterTests
{
    private readonly StringToBoolConverter _converter;

    public StringToBoolConverterTests()
    {
        _converter = new StringToBoolConverter();
    }

    [Fact]
    public void Convert_NonEmptyString_ShouldReturnTrue()
    {
        // Act
        var result = _converter.Convert("some text", typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(true, result);
    }

    [Fact]
    public void Convert_EmptyString_ShouldReturnFalse()
    {
        // Act
        var result = _converter.Convert("", typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(false, result);
    }

    [Fact]
    public void Convert_WhitespaceString_ShouldReturnFalse()
    {
        // Act
        var result = _converter.Convert("   ", typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(false, result);
    }

    [Fact]
    public void Convert_Null_ShouldReturnFalse()
    {
        // Act
        var result = _converter.Convert(null, typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(false, result);
    }

    [Fact]
    public void Convert_NonStringValue_ShouldReturnFalse()
    {
        // Act
        var result = _converter.Convert(123, typeof(bool), null, CultureInfo.InvariantCulture);

        // Assert
        Assert.Equal(false, result);
    }

    [Fact]
    public void ConvertBack_ShouldThrowNotImplementedException()
    {
        // Act & Assert
        Assert.Throws<NotImplementedException>(() => 
            _converter.ConvertBack(true, typeof(string), null, CultureInfo.InvariantCulture));
    }
}
