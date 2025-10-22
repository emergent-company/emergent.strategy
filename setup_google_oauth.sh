#!/bin/bash
#
# This script automates the setup of a new Google Cloud Project and the
# configuration of an OAuth 2.0 client for the Google Drive API.
#
# Prerequisites:
# 1. Google Cloud SDK (`gcloud`) installed.
# 2. `jq` command-line JSON processor installed.
# 3. You must be authenticated with gcloud (`gcloud auth login`).

set -e

# --- Color Codes for Output ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Functions ---

setup_environment() {
    if [ ! -f .env ]; then
        echo -e "${YELLOW}The .env file was not found.${NC}"
        echo "Please copy the '.env.example' file to '.env', fill in your details, and run this script again."
        exit 1
    fi

    echo -e "${BLUE}Loading environment variables from .env file...${NC}"
    
    # Safely parse the .env file line by line to prevent command execution.
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Trim leading/trailing whitespace
        line=$(echo "$line" | awk '{$1=$1};1')

        # Skip comments and empty lines
        if [[ "$line" =~ ^# ]] || [[ -z "$line" ]]; then
            continue
        fi

        # Process only lines that contain an equals sign
        if [[ "$line" == *"="* ]]; then
            # Split into key and value at the first '='
            key="${line%%=*}"
            value="${line#*=}"

            # Check if the key is a valid bash identifier
            if [[ "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
                # Remove quotes from the value if they surround it
                if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
                    value="${value:1:${#value}-2}"
                fi
                
                # Export the sanitized key and value
                export "$key=$value"
            fi
        fi
    done < .env

    if [ -z "$GCP_PROJECT_ID" ] || [ -z "$GOOGLE_REDIRECT_URL" ]; then
        echo -e "${YELLOW}Error: GCP_PROJECT_ID and GOOGLE_REDIRECT_URL must be set in the .env file.${NC}"
        exit 1
    fi
}

check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    if ! command -v gcloud &> /dev/null; then
        echo -e "${YELLOW}gcloud command not found. Please install the Google Cloud SDK.${NC}"
        exit 1
    fi
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}jq command not found. Please install jq (e.g., 'sudo apt-get install jq' or 'brew install jq').${NC}"
        exit 1
    fi
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        echo -e "${YELLOW}You are not logged in to gcloud. Please run 'gcloud auth login'.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Prerequisites satisfied.${NC}"
}

create_project() {
    echo -e "\n${BLUE}--- Step 2: Creating Google Cloud Project ---${NC}"
    if ! gcloud projects describe "$PROJECT_ID" &> /dev/null; then
        echo "Creating project '$PROJECT_ID'..."
        gcloud projects create "$PROJECT_ID"
        echo -e "${GREEN}Project created successfully.${NC}"
    else
        echo -e "${YELLOW}Project '$PROJECT_ID' already exists. Skipping creation.${NC}"
    fi
    gcloud config set project "$PROJECT_ID"
    echo "Switched gcloud context to project '$PROJECT_ID'."
}

link_billing() {
    echo -e "\n${BLUE}--- Step 3: Link Billing Account ---${NC}"
    echo -e "${YELLOW}Enabling APIs requires a billing account to be linked to the project.${NC}"
    
    # List available billing accounts
    gcloud beta billing accounts list --format="table(ACCOUNT_ID, DISPLAY_NAME)"
    
    read -p "Enter the Billing Account ID from the list above to link to the project (or press Enter to skip): " BILLING_ACCOUNT_ID

    if [ -n "$BILLING_ACCOUNT_ID" ]; then
        if gcloud beta billing projects link "$PROJECT_ID" --billing-account "$BILLING_ACCOUNT_ID"; then
            echo -e "${GREEN}Successfully linked billing account '$BILLING_ACCOUNT_ID'.${NC}"
        else
            echo -e "${YELLOW}Failed to link billing account. Please do it manually in the console.${NC}"
        fi
    else
        echo -e "${YELLOW}Skipping automatic billing setup. Please ensure a billing account is linked manually.${NC}"
    fi
}

enable_apis() {
    echo -e "\n${BLUE}--- Step 4: Enabling Necessary APIs ---${NC}"
    echo "Enabling Google Drive API... (This may take a moment)"
    gcloud services enable drive.googleapis.com
    echo "Enabling IAM API..."
    gcloud services enable iam.googleapis.com
    echo -e "${GREEN}APIs enabled successfully.${NC}"
}

guide_oauth_creation() {
    echo -e "\n${BLUE}--- Step 5: Create OAuth 2.0 Credentials (Manual Step) ---${NC}"
    echo -e "The final step is to create the OAuth Client ID in the Google Cloud Console."
    echo -e "This is best done manually to ensure the consent screen is configured correctly."

    local CREDENTIALS_URL="https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
    
    echo -e "\n${YELLOW}Please open the following URL in your browser to continue:${NC}"
    echo -e "${GREEN}$CREDENTIALS_URL${NC}"

    echo -e "\n${BLUE}Follow these instructions carefully:${NC}"
    echo "1. Click '+ CREATE CREDENTIALS' at the top of the page and select 'OAuth client ID'."
    echo "2. If prompted, you must configure the 'OAuth consent screen'."
    echo "   - Select 'External' for User Type and click 'CREATE'."
    echo "   - App name: 'My Nango App' (or your preferred name)."
    echo "   - User support email: Select your email address."
    echo "   - Developer contact information: Enter your email address."
    echo "   - Click 'SAVE AND CONTINUE' through the Scopes and Test Users pages."
    echo "   - Finally, click 'BACK TO DASHBOARD'."
    echo "3. You should be back on the Credentials page. Repeat step 1."
    echo "4. For 'Application type', select 'Web application'."
    echo "5. Under 'Authorized redirect URIs', click '+ ADD URI' and enter the URI you provided:"
    echo -e "   ${YELLOW}$REDIRECT_URI${NC}"
    echo "6. Click the 'CREATE' button."
}

final_output() {
    echo -e "\n${BLUE}--- Step 6: Collect Your Credentials ---${NC}"
    echo -e "A popup will appear showing your 'Client ID' and 'Client Secret'."
    echo -e "${YELLOW}Copy these values now.${NC}"
    echo "You will need to add them to your self-hosted Nango configuration (e.g., in the providers.yaml or as environment variables)."
    echo -e "\n${GREEN}Setup script finished!${NC}"
}


# --- Main Execution ---
main() {
    setup_environment
    check_prerequisites
    
    PROJECT_ID=$GCP_PROJECT_ID
    REDIRECT_URI=$GOOGLE_REDIRECT_URL
    
    echo -e "\n${BLUE}--- Using Configuration from .env ---${NC}"
    echo "Project ID:   $PROJECT_ID"
    echo "Redirect URI: $REDIRECT_URI"

    create_project
    link_billing
    enable_apis
    guide_oauth_creation
    final_output
}

main
