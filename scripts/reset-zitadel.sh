#!/bin/bash
set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Zitadel Reset Script${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}This will:${NC}"
echo -e "  1. Stop all services"
echo -e "  2. Drop and recreate the Zitadel database"
echo -e "  3. Remove Zitadel secrets"
echo -e "  4. Restart Zitadel container"
echo -e "  5. Run bootstrap script"
echo ""

read -p "Are you sure you want to proceed? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo -e "${RED}Aborted${NC}"
    exit 1
fi

echo -e "${BLUE}[1/7] Stopping services...${NC}"
npm run workspace:stop || true

echo -e "${BLUE}[2/7] Stopping Zitadel container...${NC}"
cd docker
docker compose --project-name spec-2 stop zitadel || true
cd ..

echo -e "${BLUE}[3/7] Dropping Zitadel database...${NC}"
cd docker
docker compose --project-name spec-2 exec -T db psql -U spec -d spec <<-EOSQL
    -- Terminate all connections to the zitadel database
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = 'zitadel' AND pid <> pg_backend_pid();
    
    -- Drop and recreate the database
    DROP DATABASE IF EXISTS zitadel;
    DROP ROLE IF EXISTS zitadel;
    CREATE ROLE zitadel LOGIN PASSWORD 'zitadel';
    CREATE DATABASE zitadel OWNER zitadel;
    GRANT CONNECT, CREATE, TEMP ON DATABASE zitadel TO zitadel;
EOSQL
cd ..

echo -e "${BLUE}[4/7] Removing Zitadel secrets...${NC}"
rm -rf secrets/bootstrap
rm -f apps/server-nest/secrets/zitadel-*.json
mkdir -p secrets/bootstrap

echo -e "${BLUE}[5/7] Restarting Zitadel container...${NC}"
cd docker
docker compose --project-name spec-2 start zitadel
cd ..

echo -e "${BLUE}[6/7] Waiting for Zitadel to be ready (30 seconds)...${NC}"
sleep 30

# Check if Zitadel is ready
for i in {1..30}; do
    if curl -s http://localhost:8200/debug/ready | grep -q "ok"; then
        echo -e "${GREEN}✓ Zitadel is ready!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Error: Zitadel did not become ready in time${NC}"
        exit 1
    fi
    echo -n "."
    sleep 2
done
echo ""

echo -e "${BLUE}[7/7] Running bootstrap script...${NC}"
./scripts/bootstrap-zitadel-fully-automated.sh provision

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Zitadel Reset Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Update your .env files with the new client IDs"
echo -e "  2. Restart services: npm run workspace:start"
