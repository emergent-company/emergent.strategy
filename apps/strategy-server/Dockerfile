FROM golang:1.26-alpine AS build
ENV GOTOOLCHAIN=auto
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -tags notui -o /app/build/strategy-server -ldflags "-s -w" .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /app/build/strategy-server /app/strategy-server
EXPOSE 8080
ENTRYPOINT ["/app/strategy-server"]
CMD ["server"]
