#!/bin/bash
set -e

# Setup firewall rules for dev environment
# This script should be run on the remote server

echo "=========================================="
echo "Setting up firewall for dev environment"
echo "=========================================="

# Required ports:
# 22 - SSH (already open)
# 80 - HTTP (already open)
# 443 - HTTPS (already open)
# 5432 - PostgreSQL
# 8100 - Zitadel API
# 8101 - Zitadel Login (optional, uses shared network)

echo ""
echo "Opening PostgreSQL port (5432)..."
ufw allow 5432/tcp

echo ""
echo "Opening Zitadel API port (8100)..."
ufw allow 8100/tcp

echo ""
echo "Current firewall status:"
ufw status | grep -E "(5432|8100|22|80|443)"

echo ""
echo "=========================================="
echo "Firewall setup complete!"
echo "=========================================="
echo ""
echo "Test database connection from local machine:"
echo "  PGPASSWORD=spec psql -h <SERVER_IP> -U spec -d zitadel"
echo ""
echo "Test Zitadel API:"
echo "  curl http://<SERVER_DOMAIN>:8100/debug/healthz"
echo ""
