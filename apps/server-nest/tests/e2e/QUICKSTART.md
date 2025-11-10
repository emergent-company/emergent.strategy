# ClickUp Real API Integration Tests - Quick Start

## 🚀 Get Started in 3 Steps

### Step 1: Run the Setup Script

```bash
./apps/server-nest/test/setup-clickup-tests.sh
```

The script will:
- ✅ Prompt you for your ClickUp API token
- ✅ Prompt you for your workspace ID
- ✅ Create `.env.test.local` file (gitignored)
- ✅ Test your credentials automatically
- ✅ Confirm everything is working

### Step 2: Provide Your Credentials

When prompted, enter:

**API Token** (from [ClickUp Settings → Apps](https://app.clickup.com/settings/apps))
```
pk_123456_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890
```

**Workspace ID** (from URL: `app.clickup.com/WORKSPACE_ID/...`)
```
12345678
```

### Step 3: Run the Tests

```bash
cd apps/server-nest
npm run test:integration:clickup
```

## 📊 What You'll See

```
🔍 Testing with ClickUp credentials:
   Token: pk_1234567...
   Workspace: 12345678

✅ Authenticated as: john.doe (john@example.com)
✅ Found workspace: My Workspace (12345678)
   Members: 5

✅ Found 3 spaces:
   - Marketing (space_123)
   - Engineering (space_456)
   - Product (space_789)

... [more test output]

✅ All ClickUp real API tests completed successfully!
   Your ClickUp integration is working correctly.

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Time:        15.432s
```

## 🔒 Security Notes

- Your credentials are stored in `.env.test.local` (gitignored)
- Tests are **READ-ONLY** - they never modify your ClickUp data
- The script sets file permissions to 600 (owner-only access)
- Never commit `.env.test.local` to version control

## 📚 Full Documentation

See [README-CLICKUP-INTEGRATION-TESTS.md](./README-CLICKUP-INTEGRATION-TESTS.md) for:
- Detailed test descriptions
- Troubleshooting guide
- Performance benchmarks
- CI/CD integration
- Security best practices

## ❓ Need Help?

### Get your ClickUp credentials:
1. **API Token**: https://app.clickup.com/settings/apps
2. **Workspace ID**: Check any ClickUp URL

### Common issues:
- "Invalid token" → Regenerate in ClickUp settings
- "Workspace not found" → Check URL for correct ID
- "Rate limit exceeded" → Wait 60 seconds and retry

---

**Ready to test?** Run: `./apps/server-nest/test/setup-clickup-tests.sh`
