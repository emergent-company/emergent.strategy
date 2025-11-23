#!/bin/bash
# One-time setup for Coolify deployment
# Run this on kucharz.net before deploying

echo "🔧 Setting up database logs directory for Coolify deployment..."

# Create logs directory with proper permissions
mkdir -p /home/emergent/db_logs
chmod 777 /home/emergent/db_logs

echo "✅ Created /home/emergent/db_logs with full permissions"
echo ""
echo "Directory details:"
ls -la /home/emergent/db_logs

echo ""
echo "✅ Setup complete! You can now deploy your application in Coolify."
echo ""
echo "To view logs later:"
echo "  ls -lh /home/emergent/db_logs"
echo "  tail -f /home/emergent/db_logs/postgresql-*.log"
