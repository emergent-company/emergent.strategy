#!/bin/bash
# Script to check Coolify deployment status on kucharz.net
# This checks the dev Docker Compose setup (docker/docker-compose.yml)

echo "================================"
echo "Docker Container Status"
echo "================================"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "================================"
echo "Container Health Checks"
echo "================================"
docker ps --filter "health=healthy" --format "✅ {{.Names}}"
docker ps --filter "health=unhealthy" --format "❌ {{.Names}}"
docker ps --filter "health=starting" --format "⏳ {{.Names}}"

echo ""
echo "================================"
echo "Database (db) Status & Logs"
echo "================================"
DB_CONTAINER=$(docker ps -aqf "name=db")
if [ -n "$DB_CONTAINER" ]; then
    echo "Container ID: $DB_CONTAINER"
    docker inspect $DB_CONTAINER --format='Status: {{.State.Status}} | Health: {{.State.Health.Status}}'
    echo ""
    echo "--- Last 50 log lines ---"
    docker logs --tail=50 $DB_CONTAINER 2>&1
    echo ""
    echo "--- Database Connectivity Test ---"
    docker exec $DB_CONTAINER pg_isready -U spec -d spec || echo "❌ spec database connection failed"
    docker exec $DB_CONTAINER pg_isready -U zitadel -d zitadel || echo "❌ zitadel database connection failed"
else
    echo "❌ Database container not found"
fi

echo ""
echo "================================"
echo "Zitadel Status & Logs"
echo "================================"
ZITADEL_CONTAINER=$(docker ps -aqf "name=zitadel" | grep -v login)
if [ -n "$ZITADEL_CONTAINER" ]; then
    echo "Container ID: $ZITADEL_CONTAINER"
    docker inspect $ZITADEL_CONTAINER --format='Status: {{.State.Status}} | Health: {{.State.Health.Status}}'
    echo ""
    echo "--- Environment Variables ---"
    docker exec $ZITADEL_CONTAINER env | grep -E "ZITADEL_" | sort | head -20
    echo ""
    echo "--- Last 100 log lines (most important) ---"
    docker logs --tail=100 $ZITADEL_CONTAINER 2>&1
else
    echo "❌ Zitadel container not found"
fi

echo ""
echo "================================"
echo "Zitadel Login UI Status"
echo "================================"
LOGIN_CONTAINER=$(docker ps -aqf "name=login")
if [ -n "$LOGIN_CONTAINER" ]; then
    echo "Container ID: $LOGIN_CONTAINER"
    docker inspect $LOGIN_CONTAINER --format='Status: {{.State.Status}}'
    echo ""
    echo "--- Last 30 log lines ---"
    docker logs --tail=30 $LOGIN_CONTAINER 2>&1
else
    echo "❌ Login container not found"
fi

echo ""
echo "================================"
echo "Docker Compose Services Status"
echo "================================"
# Try to find docker-compose.yml location
if [ -f "docker-compose.yml" ]; then
    docker compose ps
elif [ -f "docker/docker-compose.yml" ]; then
    cd docker && docker compose ps && cd ..
else
    echo "⚠️  Could not find docker-compose.yml"
fi

echo ""
echo "================================"
echo "Network Configuration"
echo "================================"
docker network ls | grep -E "(spec|zitadel|docker)"

echo ""
echo "================================"
echo "Volume Information"
echo "================================"
docker volume ls | grep -E "(spec|zitadel|pg_data)"

echo ""
echo "================================"
echo "Critical Environment Checks"
echo "================================"
if [ -n "$ZITADEL_CONTAINER" ]; then
    echo "Checking critical Zitadel environment variables..."
    docker exec $ZITADEL_CONTAINER env | grep -E "ZITADEL_MASTERKEY|ZITADEL_DB_PASSWORD|ZITADEL_EXTERNALDOMAIN" | \
        sed 's/=.*/=***REDACTED***/'
fi

echo ""
echo "================================"
echo "Port Bindings"
echo "================================"
docker ps --format "{{.Names}}: {{.Ports}}" | grep -E "(db|zitadel|login)"

echo ""
echo "================================"
echo "Summary"
echo "================================"
echo "✅ Healthy containers: $(docker ps --filter 'health=healthy' --format '{{.Names}}' | wc -l)"
echo "❌ Unhealthy containers: $(docker ps --filter 'health=unhealthy' --format '{{.Names}}' | wc -l)"
echo "⏳ Starting containers: $(docker ps --filter 'health=starting' --format '{{.Names}}' | wc -l)"
echo ""
echo "Run this script on kucharz.net to diagnose deployment issues"
