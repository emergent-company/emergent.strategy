#!/bin/bash

# Test Chat System (Phase 3)
# Runs the TypeScript API verification script

echo "🚀 Starting Chat System Verification..."

if [ ! -f "scripts/test-chat-api.ts" ]; then
  echo "❌ scripts/test-chat-api.ts not found!"
  exit 1
fi

echo "Running API tests..."
npx tsx scripts/test-chat-api.ts

if [ $? -eq 0 ]; then
  echo "✅ Chat System Verification Passed!"
else
  echo "❌ Chat System Verification Failed!"
  exit 1
fi
