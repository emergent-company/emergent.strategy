package langs

import (
	"github.com/labstack/echo/v4"
)

// Middleware returns an Echo middleware that detects the request language from
// the Accept-Language header and injects a Locale into the request context.
func Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Accept-Language")
			locale := ParseAcceptLanguage(header)
			ctx := WithLocale(c.Request().Context(), locale)
			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	}
}
