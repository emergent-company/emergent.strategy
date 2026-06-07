package langs

import (
	"github.com/labstack/echo/v4"
)

// LangCookie is the name of the cookie used to persist the user's language preference.
const LangCookie = "lang_pref"

// Middleware returns an Echo middleware that detects the request language.
// Priority: lang_pref cookie > Accept-Language header > English default.
func Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			locale := LocaleEN
			if cookie, err := c.Cookie(LangCookie); err == nil {
				switch Locale(cookie.Value) {
				case LocaleEN, LocaleNB:
					locale = Locale(cookie.Value)
				}
			} else {
				locale = ParseAcceptLanguage(c.Request().Header.Get("Accept-Language"))
			}
			ctx := WithLocale(c.Request().Context(), locale)
			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	}
}

// SupportedLocales returns all locales available for the language picker.
func SupportedLocales() []LocaleInfo {
	return []LocaleInfo{
		{Code: LocaleEN, Label: "English"},
		{Code: LocaleNB, Label: "Norsk (bokmål)"},
	}
}

// LocaleInfo carries display metadata for a single supported locale.
type LocaleInfo struct {
	Code  Locale
	Label string
}
