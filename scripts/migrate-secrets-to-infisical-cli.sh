#!/bin/bash
# Migrate secrets to Infisical using CLI
# Project: Emergent

set -e

# Configuration
PROJECT_NAME="emergent"
ENVIRONMENT="${1:-dev}"
DRY_RUN="${2:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 Infisical Secret Migration - Project: ${PROJECT_NAME}${NC}"
echo "================================================================================"
echo ""

# Check if infisical CLI is available
if ! command -v infisical &> /dev/null; then
    echo -e "${RED}❌ Infisical CLI not found${NC}"
    echo "Install it with: brew install infisical/infisical-cli/infisical"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Found .env file${NC}"
echo ""

# Parse .env and categorize variables
declare -A workspace_vars server_vars admin_vars docker_vars

# Excluded variables (Infisical bootstrap credentials)
excluded_vars=(
  "INFISICAL_TOKEN"
  "INFISICAL_TOKEN_DEV"
  "INFISICAL_TOKEN_STAGING"
  "INFISICAL_TOKEN_PRODUCTION"
  "INFISICAL_SITE_URL"
)

is_excluded() {
  local var=$1
  for excluded in "${excluded_vars[@]}"; do
    if [ "$var" = "$excluded" ]; then
      return 0
    fi
  done
  return 1
}

# Categorize variables by folder
categorize_var() {
  local key=$1
  
  # Admin variables (VITE_* prefix)
  if [[ $key == VITE_* ]]; then
    echo "admin"
    return
  fi
  
  # Docker/Zitadel variables
  if [[ $key == ZITADEL_* ]] || [[ $key == COMPOSE_* ]] || [[ $key == DB_CONTAINER_NAME ]]; then
    echo "docker"
    return
  fi
  
  # Server variables (database, APIs, secrets)
  if [[ $key == POSTGRES_* ]] || [[ $key == *_SECRET* ]] || [[ $key == *_API_KEY* ]] || \
     [[ $key == *_TOKEN ]] || [[ $key == DATABASE_* ]] || [[ $key == GOOGLE_APPLICATION_CREDENTIALS ]]; then
    echo "server"
    return
  fi
  
  # Workspace variables (everything else - shared config)
  echo "workspace"
}

# Read and categorize .env variables
echo -e "${BLUE}📋 Analyzing .env file...${NC}"
total_count=0
excluded_count=0

while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ $key =~ ^#.*$ ]] && continue
  [[ -z $key ]] && continue
  
  # Remove leading/trailing whitespace
  key=$(echo "$key" | xargs)
  
  # Check if excluded
  if is_excluded "$key"; then
    echo -e "   ${YELLOW}⊘ Skipping bootstrap variable: $key${NC}"
    ((excluded_count++))
    continue
  fi
  
  ((total_count++))
  
  folder=$(categorize_var "$key")
  
  case $folder in
    workspace)
      workspace_vars["$key"]="$value"
      ;;
    server)
      server_vars["$key"]="$value"
      ;;
    admin)
      admin_vars["$key"]="$value"
      ;;
    docker)
      docker_vars["$key"]="$value"
      ;;
  esac
done < .env

echo ""
echo -e "${GREEN}✓ Categorized ${total_count} secrets (excluded ${excluded_count} bootstrap vars)${NC}"
echo ""

# Read docker/.env if it exists
if [ -f docker/.env ]; then
  echo -e "${BLUE}📋 Analyzing docker/.env file...${NC}"
  docker_count=0
  
  while IFS='=' read -r key value; do
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z $key ]] && continue
    key=$(echo "$key" | xargs)
    
    if ! is_excluded "$key"; then
      docker_vars["$key"]="$value"
      ((docker_count++))
      ((total_count++))
    fi
  done < docker/.env
  
  echo -e "${GREEN}✓ Added ${docker_count} Docker secrets${NC}"
  echo ""
fi

# Display summary
echo "================================================================================"
echo -e "${BLUE}MIGRATION SUMMARY - Environment: ${ENVIRONMENT}${NC}"
echo "================================================================================"
echo ""
echo "Workspace vars (/workspace): ${#workspace_vars[@]}"
echo "Server vars    (/server):    ${#server_vars[@]}"
echo "Admin vars     (/admin):     ${#admin_vars[@]}"
echo "Docker vars    (/docker):    ${#docker_vars[@]}"
echo ""
echo "Total: ${total_count} secrets"
echo ""
echo "================================================================================"

if [ "$DRY_RUN" = "true" ]; then
  echo -e "${YELLOW}🔍 DRY RUN MODE - No secrets will be pushed${NC}"
  echo ""
  exit 0
fi

# Confirm before proceeding
echo ""
echo -e "${YELLOW}⚠️  This will push ${total_count} secrets to Infisical${NC}"
echo -e "${YELLOW}   Project: ${PROJECT_NAME}, Environment: ${ENVIRONMENT}${NC}"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo -e "${BLUE}🚀 Migrating secrets...${NC}"
echo ""

# Function to push secrets to a folder
push_secrets() {
  local folder=$1
  shift
  local -n vars=$1
  
  if [ ${#vars[@]} -eq 0 ]; then
    echo -e "${YELLOW}   No secrets for ${folder}${NC}"
    return
  fi
  
  echo -e "${BLUE}📁 Folder: ${folder}${NC}"
  
  local success=0
  local failed=0
  
  for key in "${!vars[@]}"; do
    value="${vars[$key]}"
    
    # Use infisical CLI to set secret
    if infisical secrets set "$key" "$value" \
      --projectId "$PROJECT_NAME" \
      --env "$ENVIRONMENT" \
      --path "$folder" \
      --silent 2>/dev/null; then
      echo -e "   ${GREEN}✓${NC} $key"
      ((success++))
    else
      echo -e "   ${RED}✗${NC} $key"
      ((failed++))
    fi
  done
  
  echo -e "   ${GREEN}Success: ${success}${NC}, ${RED}Failed: ${failed}${NC}"
  echo ""
}

# Push secrets by folder
push_secrets "/workspace" workspace_vars
push_secrets "/server" server_vars
push_secrets "/admin" admin_vars
push_secrets "/docker" docker_vars

echo ""
echo -e "${GREEN}✨ Migration complete!${NC}"
echo ""
echo -e "${BLUE}💡 Next steps:${NC}"
echo "   1. Verify secrets at: https://infiscal.kucharz.net/project/${PROJECT_NAME}/secrets"
echo "   2. Test SDK integration with migrated secrets"
echo "   3. Update .env.example with Infisical bootstrap template"
