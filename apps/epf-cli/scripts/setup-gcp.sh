#!/bin/bash

set -euo pipefail

PROJECT="outblocks"
REGION="europe-west1"
SERVICE="epf-strategy"
REPO="epf"
IMAGE_NAME="epf-server"
CUSTOM_DOMAIN="strategy.emergent-company.ai"
WIF_POOL="github-actions"
WIF_PROVIDER="github"
DEPLOY_SA_NAME="epf-deploy"
RUNTIME_SA_NAME="epf-runtime"
GITHUB_REPO=""
DRY_RUN=false
FORCE_SECRET_UPDATE=false
ROTATE_SESSION_SECRET=false

usage() {
    cat <<'EOF'
Usage: ./scripts/setup-gcp.sh [options]

One-time bootstrap for the EPF multi-tenant Cloud Run deployment.

Options:
  --github-repo <OWNER/REPO>      GitHub repository allowed to deploy via WIF
  --force-secret-update           Upload new secret versions even if one already exists
  --rotate-session-secret         Always rotate EPF_SESSION_SECRET
  --dry-run                       Print commands without executing them
  -h, --help                      Show this help text

Before running, export these environment variables so the script can store them
in Secret Manager when needed:
  EPF_OAUTH_CLIENT_ID
  EPF_OAUTH_CLIENT_SECRET
  EPF_GITHUB_APP_ID
  EPF_GITHUB_APP_PRIVATE_KEY

Optional environment variables:
  EPF_GITHUB_APP_CLIENT_ID
  EPF_GITHUB_APP_CLIENT_SECRET
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --github-repo) GITHUB_REPO="$2"; shift 2 ;;
        --force-secret-update) FORCE_SECRET_UPDATE=true; shift ;;
        --rotate-session-secret) ROTATE_SESSION_SECRET=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown flag: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

run() {
    echo "+ $*"
    if [[ "$DRY_RUN" == false ]]; then
        "$@"
    fi
}

artifact_repo_exists() {
    if [[ "$DRY_RUN" == true ]]; then
        return 1
    fi

    gcloud artifacts repositories describe "$REPO" \
        --location "$REGION" \
        --project "$PROJECT" >/dev/null 2>&1
}

service_account_exists() {
    if [[ "$DRY_RUN" == true ]]; then
        return 1
    fi

    gcloud iam service-accounts describe "$1" --project "$PROJECT" >/dev/null 2>&1
}

wif_pool_exists() {
    if [[ "$DRY_RUN" == true ]]; then
        return 1
    fi

    gcloud iam workload-identity-pools describe "$WIF_POOL" \
        --location=global \
        --project "$PROJECT" >/dev/null 2>&1
}

wif_provider_exists() {
    if [[ "$DRY_RUN" == true ]]; then
        return 1
    fi

    gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
        --location=global \
        --workload-identity-pool="$WIF_POOL" \
        --project "$PROJECT" >/dev/null 2>&1
}

infer_github_repo() {
    local remote_url repo

    remote_url="$(git remote get-url origin 2>/dev/null || true)"
    if [[ -z "$remote_url" ]]; then
        return 1
    fi

    repo="$remote_url"
    repo="${repo#git@github.com:}"
    repo="${repo#https://github.com/}"
    repo="${repo%.git}"

    if [[ "$repo" == */* ]]; then
        printf '%s\n' "$repo"
        return 0
    fi

    return 1
}

secret_exists() {
    if [[ "$DRY_RUN" == true ]]; then
        return 1
    fi

    gcloud secrets describe "$1" --project "$PROJECT" >/dev/null 2>&1
}

secret_has_enabled_version() {
    local version

    if [[ "$DRY_RUN" == true ]]; then
        return 1
    fi

    version="$(gcloud secrets versions list "$1" \
        --project "$PROJECT" \
        --filter="state=enabled" \
        --limit=1 \
        --format="value(name)" 2>/dev/null || true)"

    [[ -n "$version" ]]
}

ensure_secret() {
    local secret_name="$1"

    if secret_exists "$secret_name"; then
        echo "  (secret '$secret_name' already exists)"
        return
    fi

    run gcloud secrets create "$secret_name" \
        --replication-policy=automatic \
        --project "$PROJECT"
}

grant_secret_access() {
    local secret_name="$1"

    run gcloud secrets add-iam-policy-binding "$secret_name" \
        --project "$PROJECT" \
        --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
        --role="roles/secretmanager.viewer" \
        --quiet >/dev/null

    run gcloud secrets add-iam-policy-binding "$secret_name" \
        --project "$PROJECT" \
        --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet >/dev/null

    run gcloud secrets add-iam-policy-binding "$secret_name" \
        --project "$PROJECT" \
        --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet >/dev/null
}

upload_secret_value() {
    local secret_name="$1"
    local value="$2"

    if [[ "$DRY_RUN" == true ]]; then
        echo "+ gcloud secrets versions add $secret_name --data-file=- --project $PROJECT"
        return
    fi

    printf '%s' "$value" | gcloud secrets versions add "$secret_name" \
        --data-file=- \
        --project "$PROJECT" >/dev/null
}

store_secret_from_env() {
    local secret_name="$1"
    local env_name="$2"
    local required="$3"
    local value="${!env_name:-}"

    ensure_secret "$secret_name"
    grant_secret_access "$secret_name"

    if secret_has_enabled_version "$secret_name" && [[ "$FORCE_SECRET_UPDATE" == false ]]; then
        echo "  (keeping existing version for '$secret_name')"
        return
    fi

    if [[ -z "$value" ]]; then
        if [[ "$required" == true ]]; then
            MISSING_ENV_VARS+=("$env_name")
        else
            echo "  (optional env '$env_name' not set; skipping '$secret_name')"
        fi
        return
    fi

    upload_secret_value "$secret_name" "$value"
}

ensure_session_secret() {
    local secret_name="epf-session-secret"
    local session_secret

    ensure_secret "$secret_name"
    grant_secret_access "$secret_name"

    if secret_has_enabled_version "$secret_name" && [[ "$ROTATE_SESSION_SECRET" == false ]]; then
        echo "  (keeping existing version for '$secret_name')"
        return
    fi

    session_secret="$(openssl rand -hex 32)"
    upload_secret_value "$secret_name" "$session_secret"
}

if [[ -z "$GITHUB_REPO" ]]; then
    GITHUB_REPO="$(infer_github_repo || true)"
fi

if [[ -z "$GITHUB_REPO" ]]; then
    GITHUB_REPO="emergent-company/emergent.strategy"
fi

DEPLOY_SA_EMAIL="${DEPLOY_SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
RUNTIME_SA_EMAIL="${RUNTIME_SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
REGISTRY_HOST="${REGION}-docker.pkg.dev"
REGISTRY_IMAGE="${REGISTRY_HOST}/${PROJECT}/${REPO}/${IMAGE_NAME}"
MISSING_ENV_VARS=()

echo "============================================="
echo "EPF Cloud Run Bootstrap"
echo "============================================="
echo "Project:             $PROJECT"
echo "Region:              $REGION"
echo "Service:             $SERVICE"
echo "Artifact Registry:   $REGISTRY_IMAGE"
echo "Custom domain:       $CUSTOM_DOMAIN"
echo "GitHub repository:   $GITHUB_REPO"
echo "Dry run:             $DRY_RUN"
echo "============================================="
echo ""

echo "--- Step 1: Enable required APIs ---"
run gcloud services enable \
    artifactregistry.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    run.googleapis.com \
    secretmanager.googleapis.com \
    --project "$PROJECT"
echo ""

echo "--- Step 2: Ensure Artifact Registry exists ---"
if artifact_repo_exists; then
    echo "  (repository '$REPO' already exists)"
else
    run gcloud artifacts repositories create "$REPO" \
        --repository-format=docker \
        --location="$REGION" \
        --description="EPF Cloud Run release images" \
        --project "$PROJECT"
fi
echo ""

echo "--- Step 3: Ensure service accounts exist ---"
if service_account_exists "$DEPLOY_SA_EMAIL"; then
    echo "  (service account '$DEPLOY_SA_NAME' already exists)"
else
    run gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
        --display-name="EPF Deploy (GitHub Actions)" \
        --project "$PROJECT"
fi

if service_account_exists "$RUNTIME_SA_EMAIL"; then
    echo "  (service account '$RUNTIME_SA_NAME' already exists)"
else
    run gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
        --display-name="EPF Cloud Run Runtime" \
        --project "$PROJECT"
fi

for role in roles/run.admin roles/artifactregistry.writer; do
    run gcloud projects add-iam-policy-binding "$PROJECT" \
        --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
        --role="$role" \
        --condition=None \
        --quiet >/dev/null
done

run gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
    --project "$PROJECT" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="roles/iam.serviceAccountUser" \
    --quiet >/dev/null
echo ""

echo "--- Step 4: Ensure Workload Identity Federation exists ---"
if wif_pool_exists; then
    echo "  (workload identity pool '$WIF_POOL' already exists)"
else
    run gcloud iam workload-identity-pools create "$WIF_POOL" \
        --location=global \
        --display-name="GitHub Actions" \
        --project "$PROJECT"
fi

if wif_provider_exists; then
    echo "  (workload identity provider '$WIF_PROVIDER' already exists)"
else
    run gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
        --location=global \
        --workload-identity-pool="$WIF_POOL" \
        --display-name="GitHub" \
        --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.ref=assertion.ref,attribute.repository=assertion.repository" \
        --attribute-condition="assertion.repository=='${GITHUB_REPO}' && (assertion.ref.startsWith('refs/tags/v') || assertion.ref=='refs/heads/main')" \
        --issuer-uri="https://token.actions.githubusercontent.com" \
        --project "$PROJECT"
fi

if [[ "$DRY_RUN" == false ]]; then
    PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")"
    WIF_PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
        --location=global \
        --workload-identity-pool="$WIF_POOL" \
        --project "$PROJECT" \
        --format="value(name)")"
    WIF_POOL_NAME="$(gcloud iam workload-identity-pools describe "$WIF_POOL" \
        --location=global \
        --project "$PROJECT" \
        --format="value(name)")"
else
    PROJECT_NUMBER="PROJECT_NUMBER"
    WIF_PROVIDER_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
    WIF_POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}"
fi

run gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
    --project "$PROJECT" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${WIF_POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
    --quiet >/dev/null
echo ""

echo "--- Step 5: Ensure Secret Manager secrets exist ---"
store_secret_from_env "epf-oauth-client-id" "EPF_OAUTH_CLIENT_ID" true
store_secret_from_env "epf-oauth-client-secret" "EPF_OAUTH_CLIENT_SECRET" true
store_secret_from_env "epf-github-app-id" "EPF_GITHUB_APP_ID" true
store_secret_from_env "epf-github-app-private-key" "EPF_GITHUB_APP_PRIVATE_KEY" true
store_secret_from_env "epf-github-app-client-id" "EPF_GITHUB_APP_CLIENT_ID" false
store_secret_from_env "epf-github-app-client-secret" "EPF_GITHUB_APP_CLIENT_SECRET" false
ensure_session_secret
echo ""

if (( ${#MISSING_ENV_VARS[@]} > 0 )); then
    echo "Missing required environment variables for first-time secret population:" >&2
    for env_name in "${MISSING_ENV_VARS[@]}"; do
        echo "  - ${env_name}" >&2
    done
    echo "" >&2
    echo "Export them and re-run the bootstrap, or populate the secrets manually later." >&2
    exit 1
fi

echo "============================================="
echo "Bootstrap complete"
echo "============================================="
echo ""
echo "GitHub repository secrets to configure:"
echo "  GCP_WIF_PROVIDER    = ${WIF_PROVIDER_NAME}"
echo "  GCP_SERVICE_ACCOUNT = ${DEPLOY_SA_EMAIL}"
echo "  EPF_CANONICAL_TOKEN = <GitHub token for cloning emergent-company/epf-canonical>"
echo ""
echo "Runtime configuration baked into workflows:"
echo "  Project             = ${PROJECT}"
echo "  Region              = ${REGION}"
echo "  Service             = ${SERVICE}"
echo "  Runtime SA          = ${RUNTIME_SA_EMAIL}"
echo "  Registry image      = ${REGISTRY_IMAGE}"
echo "  CORS                = *"
echo "  Scaling             = 0..10"
echo ""
echo "After the first successful deploy, map the custom domain:"
echo "  gcloud beta run domain-mappings create \\
    --service=${SERVICE} \\
    --domain=${CUSTOM_DOMAIN} \\
    --region=${REGION} \\
    --project=${PROJECT}"
echo ""
echo "Then follow the DNS records printed by:"
echo "  gcloud beta run domain-mappings describe \\
    --domain=${CUSTOM_DOMAIN} \\
    --region=${REGION} \\
    --project=${PROJECT}"
