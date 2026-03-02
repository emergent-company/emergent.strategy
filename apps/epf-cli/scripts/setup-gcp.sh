#!/bin/bash
# setup-gcp.sh — One-time GCP infrastructure setup for EPF Cloud Server
#
# This script creates all required GCP resources for deploying the EPF
# strategy server to Cloud Run. Run it once before the first deploy.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - A GCP project with billing enabled
#   - The GitHub App private key (.pem file)
#
# Usage:
#   ./scripts/setup-gcp.sh --project <GCP_PROJECT_ID>
#
# Optional flags:
#   --region <REGION>       GCP region (default: europe-north1)
#   --service <NAME>        Cloud Run service name (default: epf-server)
#   --repo <NAME>           Artifact Registry repo name (default: epf)
#   --dry-run               Print commands without executing

set -euo pipefail

# --- Defaults ---
PROJECT=""
REGION="europe-north1"
SERVICE="epf-server"
REPO="epf"
DRY_RUN=false

# --- Parse flags ---
while [[ $# -gt 0 ]]; do
    case "$1" in
        --project)   PROJECT="$2"; shift 2 ;;
        --region)    REGION="$2"; shift 2 ;;
        --service)   SERVICE="$2"; shift 2 ;;
        --repo)      REPO="$2"; shift 2 ;;
        --dry-run)   DRY_RUN=true; shift ;;
        -h|--help)
            echo "Usage: $0 --project <GCP_PROJECT_ID> [--region REGION] [--service NAME] [--repo NAME] [--dry-run]"
            exit 0
            ;;
        *)
            echo "Unknown flag: $1" >&2
            exit 1
            ;;
    esac
done

if [ -z "$PROJECT" ]; then
    echo "Error: --project is required" >&2
    echo "Usage: $0 --project <GCP_PROJECT_ID>" >&2
    exit 1
fi

run() {
    echo "+ $*"
    if [ "$DRY_RUN" = false ]; then
        "$@"
    fi
}

echo "============================================="
echo "EPF Cloud Server — GCP Setup"
echo "============================================="
echo "Project:  $PROJECT"
echo "Region:   $REGION"
echo "Service:  $SERVICE"
echo "Registry: $REPO"
echo "Dry run:  $DRY_RUN"
echo "============================================="
echo ""

# --- Step 1: Enable required APIs ---
echo "--- Step 1: Enable GCP APIs ---"
run gcloud services enable \
    artifactregistry.googleapis.com \
    run.googleapis.com \
    secretmanager.googleapis.com \
    cloudbuild.googleapis.com \
    --project "$PROJECT"
echo ""

# --- Step 2: Create Artifact Registry repository (task 4.2) ---
echo "--- Step 2: Create Artifact Registry repository ---"
run gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="EPF Cloud Server container images" \
    --project "$PROJECT" \
    2>/dev/null || echo "  (repository already exists)"
echo ""

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}"
echo "Registry URL: ${REGISTRY}/epf-server"
echo ""

# --- Step 3: Create Secret Manager secrets (task 4.5) ---
echo "--- Step 3: Create Secret Manager secrets ---"
echo "Creating secret placeholders (you'll add values next)..."

for secret in epf-github-app-private-key epf-github-app-id epf-github-app-installation-id epf-canonical-token; do
    run gcloud secrets create "$secret" \
        --replication-policy=automatic \
        --project "$PROJECT" \
        2>/dev/null || echo "  (secret '$secret' already exists)"
done
echo ""

echo "To add the GitHub App private key:"
echo "  gcloud secrets versions add epf-github-app-private-key \\"
echo "    --data-file=path/to/your-app.private-key.pem \\"
echo "    --project $PROJECT"
echo ""
echo "To add other secrets:"
echo "  echo -n 'YOUR_APP_ID' | gcloud secrets versions add epf-github-app-id --data-file=- --project $PROJECT"
echo "  echo -n 'YOUR_INSTALLATION_ID' | gcloud secrets versions add epf-github-app-installation-id --data-file=- --project $PROJECT"
echo "  echo -n 'YOUR_GITHUB_TOKEN' | gcloud secrets versions add epf-canonical-token --data-file=- --project $PROJECT"
echo ""

# --- Step 4: Create Cloud Run service (tasks 4.3, 4.6) ---
echo "--- Step 4: Deploy initial Cloud Run service ---"
echo "The initial deployment happens via the GitHub Actions workflow."
echo "The workflow will:"
echo "  - Build the Docker image and push to Artifact Registry"
echo "  - Deploy to Cloud Run with secrets mounted as env vars"
echo "  - Configure health check on /health endpoint"
echo "  - Set min-instances=0, max-instances=3"
echo "  - Set --no-allow-unauthenticated (IAM-based access control)"
echo ""

# --- Step 5: Set up Workload Identity Federation for GitHub Actions ---
echo "--- Step 5: Set up Workload Identity Federation ---"
echo "This allows GitHub Actions to authenticate to GCP without a service account key."
echo ""

WIF_POOL="github-actions"
WIF_PROVIDER="github"
SA_NAME="epf-deploy"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
GITHUB_REPO="emergent-company/emergent-strategy"

# Create service account
run gcloud iam service-accounts create "$SA_NAME" \
    --display-name="EPF Deploy (GitHub Actions)" \
    --project "$PROJECT" \
    2>/dev/null || echo "  (service account already exists)"

# Grant service account required roles
for role in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor roles/iam.serviceAccountUser; do
    run gcloud projects add-iam-policy-binding "$PROJECT" \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="$role" \
        --condition=None \
        --quiet
done

# Create Workload Identity Pool
run gcloud iam workload-identity-pools create "$WIF_POOL" \
    --location=global \
    --display-name="GitHub Actions" \
    --project "$PROJECT" \
    2>/dev/null || echo "  (pool already exists)"

# Create Workload Identity Provider
run gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --location=global \
    --workload-identity-pool="$WIF_POOL" \
    --display-name="GitHub" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --project "$PROJECT" \
    2>/dev/null || echo "  (provider already exists)"

# Allow GitHub Actions to impersonate the service account
WIF_POOL_ID=$(gcloud iam workload-identity-pools describe "$WIF_POOL" \
    --location=global --project "$PROJECT" --format="value(name)" 2>/dev/null || echo "projects/${PROJECT}/locations/global/workloadIdentityPools/${WIF_POOL}")

run gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${WIF_POOL_ID}/attribute.repository/${GITHUB_REPO}" \
    --project "$PROJECT" \
    --quiet

echo ""
echo "============================================="
echo "Setup complete!"
echo "============================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Add secret values (see commands above)"
echo ""
echo "2. Add these GitHub repository secrets:"
echo "   GCP_PROJECT_ID       = $PROJECT"
echo "   GCP_REGION           = $REGION"
echo "   GCP_WIF_PROVIDER     = projects/${PROJECT}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
echo "   GCP_SERVICE_ACCOUNT  = ${SA_EMAIL}"
echo ""
echo "3. Add these GitHub repository variables:"
echo "   EPF_GITHUB_OWNER          = emergent-company"
echo "   EPF_GITHUB_REPO           = emergent-epf"
echo "   EPF_GITHUB_BASE_PATH      = (optional, e.g. 'docs/EPF/_instances/emergent')"
echo ""
echo "4. Push to main to trigger the deploy workflow"
echo ""
echo "5. (Optional) Configure custom domain:"
echo "   gcloud run domain-mappings create \\"
echo "     --service=$SERVICE --domain=epf.yourdomain.com \\"
echo "     --region=$REGION --project=$PROJECT"
echo ""
