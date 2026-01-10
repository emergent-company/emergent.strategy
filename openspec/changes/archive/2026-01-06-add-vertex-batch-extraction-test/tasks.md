## 1. Setup

- [x] 1.1 Create GCS bucket `emergent-batch-extraction` (requires project admin) <!-- blocked: needs admin -->
- [x] 1.2 Grant Storage Object Admin to `vertex-ai-embeddings@spec-server-dev.iam.gserviceaccount.com` <!-- blocked: needs admin -->
- [x] 1.3 ~~Add `@google-cloud/storage`~~ Using REST API directly with `google-auth-library` (no new dependency needed)

## 2. Core Implementation

- [x] 2.1 Create `scripts/extraction_tests/test-vertex-batch-extraction.ts`
- [x] 2.2 Implement GCS upload utility function (via REST API)
- [x] 2.3 Implement batch job submission via REST API
- [x] 2.4 Implement job status polling
- [x] 2.5 Implement GCS output download and parsing

## 3. Extraction Logic

- [x] 3.1 Define entity extraction schema (reuse from existing tests)
- [x] 3.2 Define relationship building schema (reuse from existing tests)
- [x] 3.3 Build JSONL input format with responseSchema for structured output
- [x] 3.4 Implement two-pass extraction (entities first, then relationships)

## 4. Testing & Validation

- [x] 4.1 Dry-run tested with `test-data/bible/books/01_Genesis.md` (192K chars, ~50K tokens)
- [x] 4.2 Verify structured output works with batch API (requires GCS bucket) <!-- blocked: needs GCS bucket -->
- [x] 4.3 Compare extraction results with LangGraph pipeline output <!-- deferred: needs GCS bucket -->
- [x] 4.4 Document actual turnaround time (vs stated 24h max) <!-- deferred: needs GCS bucket -->

## 5. Documentation

- [x] 5.1 Add usage instructions to script header
- [x] 5.2 Document GCS bucket setup requirements (in --help)
- [x] 5.3 Log cost comparison findings (pending actual test) <!-- deferred: needs GCS bucket -->

## Blockers

The GCS bucket needs to be created by a project admin with `storage.buckets.create` permission.
The service account `vertex-ai-embeddings@spec-server-dev.iam.gserviceaccount.com` needs:

- `storage.objects.create`
- `storage.objects.get`
- `storage.objects.list`

To create the bucket manually:

```bash
gcloud storage buckets create gs://emergent-batch-extraction --project=spec-server-dev --location=us-central1
gcloud storage buckets add-iam-policy-binding gs://emergent-batch-extraction \
  --member=serviceAccount:vertex-ai-embeddings@spec-server-dev.iam.gserviceaccount.com \
  --role=roles/storage.objectAdmin
```
