#!/bin/bash
# Local Docker deployment test

set -e

echo "🐳 Testing Docker deployment locally..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Use test environment file
ENV_FILE=".env.test.local"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ $ENV_FILE not found"
    echo "   Create it from: cp .env.test.local.example $ENV_FILE"
    echo "   Or use: cp .env.production.example $ENV_FILE"
    exit 1
fi

echo "✅ Using environment file: $ENV_FILE"
echo ""

# Build
echo "🔨 Building images..."
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

docker compose --env-file "$ENV_FILE" build --parallel || {
    echo "❌ Build failed"
    exit 1
}

echo "✅ Build successful"
echo ""

# Start
echo "🚀 Starting services..."
docker compose --env-file "$ENV_FILE" up -d

echo "⏳ Waiting for services to be healthy..."
echo ""

# Wait for health with timeout
TIMEOUT=120
ELAPSED=0
INTERVAL=5

while [ $ELAPSED -lt $TIMEOUT ]; do
    HEALTHY=$(docker compose ps --format json | jq -r '.[] | select(.Health == "healthy") | .Service' | wc -l)
    TOTAL=$(docker compose ps --format json | jq -r '.[].Service' | wc -l)
    
    echo "   Health status: $HEALTHY/$TOTAL services healthy"
    
    if docker compose ps | grep -q "healthy"; then
        ALL_HEALTHY=true
        docker compose ps --format json | jq -r '.[]' | while read -r service; do
            NAME=$(echo "$service" | jq -r '.Service')
            HEALTH=$(echo "$service" | jq -r '.Health')
            if [[ "$HEALTH" != "healthy" && "$HEALTH" != "" ]]; then
                ALL_HEALTHY=false
            fi
        done
        
        if $ALL_HEALTHY; then
            break
        fi
    fi
    
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    echo ""
    echo "❌ Services did not become healthy within ${TIMEOUT}s"
    echo ""
    echo "Service status:"
    docker compose ps
    echo ""
    echo "Logs:"
    docker compose logs --tail=50
    echo ""
    echo "Cleaning up..."
    docker compose down -v
    exit 1
fi

echo "✅ All services healthy"
echo ""

# Test
echo "🧪 Running tests..."
echo ""

# Test database
echo "   Testing database connection..."
if docker compose exec -T db pg_isready -U spec -d spec > /dev/null 2>&1; then
    echo "   ✅ Database responsive"
else
    echo "   ❌ Database test failed"
    docker compose logs db --tail=20
    docker compose down -v
    exit 1
fi

# Test server health
echo "   Testing server health endpoint..."
sleep 5  # Give server a moment to fully start

if curl -f -s http://localhost:3002/health > /dev/null; then
    HEALTH_RESPONSE=$(curl -s http://localhost:3002/health)
    echo "   ✅ Server health check passed"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo "   ❌ Server health check failed"
    echo ""
    echo "Server logs:"
    docker compose logs server --tail=50
    docker compose down -v
    exit 1
fi

# Test admin
echo "   Testing admin frontend..."
if curl -f -s -o /dev/null http://localhost:3000/; then
    echo "   ✅ Admin accessible"
else
    echo "   ❌ Admin health check failed"
    echo ""
    echo "Admin logs:"
    docker compose logs admin --tail=50
    docker compose down -v
    exit 1
fi

# Test Zitadel
echo "   Testing Zitadel..."
if curl -f -s -o /dev/null http://localhost:8080/; then
    echo "   ✅ Zitadel accessible"
else
    echo "   ⚠️  Zitadel not accessible (may still be starting)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All Docker tests passed!"
echo ""
echo "📋 Service Access:"
echo "   Admin:  http://localhost:3000"
echo "   API:    http://localhost:3002"
echo "   Health: http://localhost:3002/health"
echo "   Zitadel: http://localhost:8080"
echo ""
echo "🔧 Management:"
echo "   View logs:    docker compose logs -f"
echo "   Stop:         docker compose down"
echo "   Clean up:     docker compose down -v"
echo ""

# Ask if user wants to keep running or clean up
read -p "Keep services running? (Y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "🧹 Cleaning up..."
    docker compose down -v
    echo "✅ Cleanup complete"
else
    echo "ℹ️  Services still running. Stop with: docker compose down"
fi

echo ""
echo "🚀 Ready for production deployment!"
