# Zitadel Login UI with Infisical CLI Integration

FROM ghcr.io/zitadel/zitadel-login:latest AS base

# Switch to root to install Infisical CLI
USER root

# Download and install Infisical CLI
RUN apk add --no-cache wget ca-certificates bash && \
    wget -q https://github.com/Infisical/cli/releases/latest/download/cli_0.43.30_linux_amd64.tar.gz -O /tmp/infisical.tar.gz && \
    tar -xzf /tmp/infisical.tar.gz -C /tmp && \
    mv /tmp/infisical /usr/local/bin/infisical && \
    chmod +x /usr/local/bin/infisical && \
    rm -f /tmp/infisical.tar.gz

# Copy entrypoint script
COPY login-infisical-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use our custom entrypoint that calls Infisical with correct flags
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "/runtime/apps/login/server.js"]
