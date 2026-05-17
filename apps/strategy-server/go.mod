module github.com/emergent-company/emergent-strategy/apps/strategy-server

go 1.26.1

require (
	github.com/a-h/templ v0.3.1001
	github.com/alexflint/go-arg v1.6.1
	github.com/emergent-company/emergent-strategy/apps/epf-cli v0.0.0-00010101000000-000000000000
	github.com/emergent-company/go-daisy v0.1.2
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/google/go-github/v68 v68.0.0
	github.com/google/uuid v1.6.0
	github.com/labstack/echo/v4 v4.15.2
	github.com/mark3labs/mcp-go v0.50.0
	github.com/pressly/goose/v3 v3.27.1
	github.com/santhosh-tekuri/jsonschema/v6 v6.0.2
	github.com/uptrace/bun v1.2.18
	github.com/uptrace/bun/dialect/pgdialect v1.2.18
	github.com/uptrace/bun/driver/pgdriver v1.2.18
	golang.org/x/text v0.36.0
	gopkg.in/yaml.v3 v3.0.1
)

replace github.com/emergent-company/emergent-strategy/apps/epf-cli => ../epf-cli

require (
	github.com/alexflint/go-scalar v1.2.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/google/go-querystring v1.2.0 // indirect
	github.com/google/jsonschema-go v0.4.2 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/labstack/gommon v0.5.0 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.22 // indirect
	github.com/mfridman/interpolate v0.0.2 // indirect
	github.com/puzpuzpuz/xsync/v3 v3.5.1 // indirect
	github.com/sethvargo/go-retry v0.3.0 // indirect
	github.com/spf13/cast v1.7.1 // indirect
	github.com/tmthrgd/go-hex v0.0.0-20190904060850-447a3041c3bc // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasttemplate v1.2.2 // indirect
	github.com/vmihailenco/msgpack/v5 v5.4.1 // indirect
	github.com/vmihailenco/tagparser/v2 v2.0.0 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	go.opentelemetry.io/otel v1.43.0 // indirect
	go.opentelemetry.io/otel/trace v1.43.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/crypto v0.50.0 // indirect
	golang.org/x/net v0.53.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.43.0 // indirect
	golang.org/x/time v0.15.0 // indirect
	mellium.im/sasl v0.3.2 // indirect
)
