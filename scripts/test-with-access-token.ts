import { config } from 'dotenv';

config();
config({ path: '.env.local' });

const NEW_CLIENT_SECRET = 'd8f4fe2cf200ef5a592fa3450326f7d9d2826bebb6d0600d65e4e3e21e362dca';

async function testWithAccessToken() {
  console.log('\n🔐 Testing Infisical API with Access Token\n');
  
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const siteUrl = process.env.INFISICAL_SITE_URL;
  const projectId = process.env.INFISICAL_PROJECT_ID;
  
  try {
    // Step 1: Get access token
    console.log('📡 Step 1: Getting access token...');
    const loginResponse = await fetch(`${siteUrl}/api/v1/auth/universal-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientId,
        clientSecret: NEW_CLIENT_SECRET,
      }),
    });
    
    const loginData = await loginResponse.json();
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    
    const accessToken = loginData.accessToken;
    console.log(`   ✅ Got access token: ${accessToken.substring(0, 20)}...\n`);
    
    // Step 2: Fetch secrets from /workspace
    console.log('📂 Step 2: Fetching secrets from /workspace...');
    const workspaceUrl = `${siteUrl}/api/v3/secrets/raw?workspaceId=${projectId}&environment=dev&secretPath=/workspace`;
    console.log(`   URL: ${workspaceUrl}`);
    
    const workspaceResponse = await fetch(workspaceUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    console.log(`   Status: ${workspaceResponse.status}`);
    
    if (!workspaceResponse.ok) {
      const errorText = await workspaceResponse.text();
      console.error(`   Error: ${errorText}`);
      throw new Error(`Failed to fetch secrets: ${workspaceResponse.status}`);
    }
    
    const workspaceData = await workspaceResponse.json();
    const workspaceSecrets = workspaceData.secrets || [];
    console.log(`   ✅ Found ${workspaceSecrets.length} secrets in /workspace`);
    console.log(`   Examples: ${workspaceSecrets.slice(0, 5).map((s: any) => s.secretKey).join(', ')}\n`);
    
    // Step 3: Fetch secrets from /server
    console.log('📂 Step 3: Fetching secrets from /server...');
    const serverUrl = `${siteUrl}/api/v3/secrets/raw?workspaceId=${projectId}&environment=dev&secretPath=/server`;
    
    const serverResponse = await fetch(serverUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    console.log(`   Status: ${serverResponse.status}`);
    
    if (!serverResponse.ok) {
      const errorText = await serverResponse.text();
      console.error(`   Error: ${errorText}`);
      throw new Error(`Failed to fetch secrets: ${serverResponse.status}`);
    }
    
    const serverData = await serverResponse.json();
    const serverSecrets = serverData.secrets || [];
    console.log(`   ✅ Found ${serverSecrets.length} secrets in /server`);
    console.log(`   Examples: ${serverSecrets.slice(0, 5).map((s: any) => s.secretKey).join(', ')}\n`);
    
    const total = workspaceSecrets.length + serverSecrets.length;
    
    console.log('='.repeat(60));
    console.log(`✅ SUCCESS! Loaded ${total} secrets from Infisical`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error: any) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ FAILED');
    console.error(`Error: ${error.message || String(error)}`);
    console.error('='.repeat(60) + '\n');
  }
}

testWithAccessToken();
