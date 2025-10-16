# LangChain Extraction E2E Test Guide

## Overview
This guide explains how to run the end-to-end test for the LangChain-based extraction system using the real Google Gemini API and a realistic meeting transcript.

## Prerequisites

### 1. Environment Setup
Set the Google API key that will be used for the test:

```bash
export GOOGLE_API_KEY=AIzaSyA5qbgYiirfeA_CI2K3AE7CnHpajt_MQVw
```

Alternatively, add it to your `.env.test` file:

```bash
GOOGLE_API_KEY=AIzaSyA5qbgYiirfeA_CI2K3AE7CnHpajt_MQVw
```

### 2. Database Setup
Ensure your test database is running and accessible:

```bash
# Start PostgreSQL (if using Docker)
cd docker
docker-compose up -d postgres

# Or ensure your local PostgreSQL is running
```

### 3. Database Migrations
Ensure all migrations are applied:

```bash
npm run migrate:test
```

## Running the Test

### Quick Run (Recommended)
Run only the LangChain E2E test:

```bash
npm run test:e2e -- extraction-langchain-real.e2e-spec.ts
```

### Verbose Output
For detailed logging of the extraction process:

```bash
npm run test:e2e -- extraction-langchain-real.e2e-spec.ts --verbose
```

### Watch Mode
Run in watch mode during development:

```bash
npm run test:e2e -- extraction-langchain-real.e2e-spec.ts --watch
```

## What the Test Does

The test performs a complete end-to-end extraction flow:

### 1. **Setup Phase**
- Creates test organization and project in database
- Verifies LLM provider is configured correctly
- Confirms it's using `LangChain-Gemini` provider

### 2. **Document Ingestion**
- Loads the real meeting transcript from `docs/spec/test_data/meeting_1.md`
- Creates a document record in the database
- Meeting contains 680 lines of unstructured conversation

### 3. **Job Creation**
- Creates an extraction job with all 8 entity types:
  - Requirement
  - Decision
  - Feature
  - Task
  - Risk
  - Issue
  - Stakeholder
  - Constraint
- Sets minimum confidence threshold to 0.5

### 4. **Extraction Processing**
- Calls the extraction worker to process the job
- Worker uses LangChain with Google Gemini API
- Extracts structured entities from unstructured meeting text
- **This step takes 10-30 seconds** (actual API call to Gemini)

### 5. **Verification**
- Validates job completed successfully
- Checks that entities were created in the graph
- Verifies confidence scores and entity properties
- Displays detailed breakdown by entity type

### 6. **Cleanup**
- Removes all test data from database
- Ensures no test pollution

## Expected Output

When running successfully, you'll see output like:

```
🔧 Setup: Creating test organization and project...
   ✓ Test org: test-org-langchain-e2e
   ✓ Test project: test-project-langchain-e2e

📄 Step 1: Loading meeting transcript...
   ✓ Loaded 34,567 characters from meeting transcript

📤 Step 2: Creating document...
   ✓ Document created: abc123...

🤖 Step 3: Creating extraction job...
   ✓ Extraction job created: def456...
   ✓ Status: pending

⚙️  Step 4: Processing extraction job with LangChain + Gemini...
   (This may take 10-30 seconds depending on API response time)
   ✓ Processing completed in 23,456ms

📊 Step 5: Verifying extraction results...
   ✓ Job status: completed

📈 Extraction Summary:
   • Total entities extracted: 42
   • Created objects: 42
   • Processing time: 23,456ms
   • LLM Provider: LangChain-Gemini

   Discovered types:
   • Decision
   • Requirement
   • Task
   • Risk
   • Stakeholder

🔍 Step 6: Verifying created graph objects...
   ✓ Found 42 created objects

📋 Created Objects by Type:
   • Decision: 12
   • Requirement: 15
   • Task: 8
   • Risk: 4
   • Stakeholder: 3

💡 Sample Extracted Entities:

   Decision (12 total):
   1. "Use git repository for specification storage"
      Confidence: 0.92
      Rationale: Team consensus on using markdown files in git for version control...

   2. "Prioritize EC8 requirements over other features"
      Confidence: 0.87
      Rationale: Strategic decision to focus resources on EC8 enterprise integration...

   Requirement (15 total):
   1. "Specification must be version controlled"
      Confidence: 0.89

   2. "LLM needs access to full specification context"
      Confidence: 0.84

   Task (8 total):
   1. "Maciej to spend 25% time on spec development"
      Confidence: 0.78

   2. "Create specification template"
      Confidence: 0.81

   Stakeholder (3 total):
   1. "ECIT"
   2. "Saga"
   3. "Legal Plant"

✅ Step 7: Validation checks...
   • Objects with confidence < 0.5: 0
   • Objects with confidence >= 0.8: 28
   ✓ All objects have valid properties
   ✓ All objects linked to source document

🎉 Test completed successfully!

Summary:
• Processed meeting transcript: 33.8 KB
• Total entities extracted: 42
• Processing time: 23,456ms
• LLM Provider: LangChain-Gemini
• Average confidence: 0.82

🧹 Cleanup: Removing test data...
   ✓ Test data removed
```

## Understanding the Test Results

### Entities Extracted
The meeting transcript (`meeting_1.md`) is a 57-minute conversation about product development, AI, and specifications. The test extracts:

- **Decisions**: Strategic choices like using git for specs, prioritizing EC8
- **Requirements**: Functional needs like version control, context awareness
- **Tasks**: Work assignments like "spend 25% time on specs"
- **Risks**: Concerns about partnerships, accuracy issues
- **Stakeholders**: Mentioned companies/people (ECIT, Saga, Legal Plant)

### Confidence Scores
- **High (0.8+)**: Clear, explicit statements in the meeting
- **Medium (0.6-0.8)**: Implied or context-dependent information
- **Low (<0.6)**: Ambiguous or inferred entities

### What Makes a Good Result
- **Coverage**: Should extract 30-50+ entities from the 680-line transcript
- **Diversity**: Should find multiple entity types, not just one
- **Accuracy**: High-confidence items should match actual meeting content
- **No Hallucinations**: All entities should be based on actual meeting text

## Troubleshooting

### Test Fails: "GOOGLE_API_KEY environment variable not set"
**Solution**: Set the API key as shown in Prerequisites section

### Test Fails: "Cannot connect to database"
**Solution**: 
1. Check database is running: `pg_isready -h localhost -p 5432`
2. Verify connection string in your `.env.test`
3. Run database setup: `npm run db:setup:test`

### Test Fails: "Extraction job failed"
**Solution**: Check the error message in the test output. Common causes:
- API quota exceeded (unlikely with this key)
- Network timeout (retry the test)
- Malformed document content (check the file exists)

### Test Times Out
**Solution**: 
- Increase Jest timeout (already set to 60s)
- Check network connection
- Verify Gemini API is not experiencing downtime

### Low Extraction Quality
If the test extracts very few entities (<10) or low confidence:
1. Check the meeting transcript is loading correctly
2. Verify the prompt generation in `LangChainGeminiProvider`
3. Try with a different document to isolate the issue

## Cost Considerations

### Per Test Run
- **Input**: ~35KB meeting transcript = ~10,000 tokens
- **Output**: ~40 entities × 50 tokens = ~2,000 tokens
- **Cost**: ~$0.0002 per test run (negligible)

### Safe for CI/CD
- Cost: ~$0.02 per 100 test runs
- Annual cost (1 run/day): ~$0.07/year
- **Conclusion**: Safe to include in CI pipeline

## Next Steps

After successful test:
1. ✅ Verify migration is complete
2. ✅ LangChain provider works with real data
3. ✅ Extraction quality is acceptable
4. → Deploy to staging environment
5. → Monitor production extraction jobs
6. → Collect metrics on extraction quality

## Related Documentation

- **Migration Summary**: `docs/LANGCHAIN_MIGRATION_SUMMARY.md`
- **Testing Guide**: `docs/TESTING_LANGCHAIN_EXTRACTION.md`
- **Specification**: `docs/spec/25-extraction-worker.md`
- **Meeting Transcript**: `docs/spec/test_data/meeting_1.md`
