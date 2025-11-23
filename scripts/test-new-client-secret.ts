import { config } from 'dotenv';
import { InfisicalSDK } from '@infisical/sdk';

// Load env files
config();
config({ path: '.env.local' });

const NEW_CLIENT_SECRET = 'd8f4fe2cf200ef5a592fa3450326f7d9d2826bebb6d0600d65e4e3e21e362dca';

async function testNewSecret() {
  console.log('\n🔐 Testing Infisical with New Client Secret\n');
  
  const clientId = process.env.INFISICAL_CLIENT_ID;
  console.log(`Client ID: ${clientId}`);
  console.log(`New Secret: ${NEW_CLIENT_SECRET.substring(0, 10)}...`);
  console.log(`Site URL: ${process.env.INFISICAL_SITE_URL}`);
  console.log(`Project ID: ${process.env.INFISICAL_PROJECT_ID}\n`);
  
  try {
    console.log('📡 Initializing Infisical client...');
    
    const client = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL,
      auth: {
        universalAuth: {
          clientId: clientId!,
          clientSecret: NEW_CLIENT_SECRET,
        },
      },
    });
    
    console.log('✅ Client initialized\n');
    
    console.log('📂 Loading secrets from /workspace...');
    const workspaceResponse = await client.secrets().listSecrets({
      projectId: process.env.INFISICAL_PROJECT_ID!,
      environment: 'dev',
      path: '/workspace',
      recursive: false,
    });
    
    const workspaceSecrets = workspaceResponse.secrets || [];
    console.log(`   ✅ Found ${workspaceSecrets.length} secrets in /workspace`);
    console.log(`   Examples: ${workspaceSecrets.slice(0, 5).map(s => s.secretKey).join(', ')}\n`);
    
    console.log('📂 Loading secrets from /server...');
    const serverResponse = await client.secrets().listSecrets({
      projectId: process.env.INFISICAL_PROJECT_ID!,
      environment: 'dev',
      path: '/server',
      recursive: false,
    });
    
    const serverSecrets = serverResponse.secrets || [];
    console.log(`   ✅ Found ${serverSecrets.length} secrets in /server`);
    console.log(`   Examples: ${serverSecrets.slice(0, 5).map(s => s.secretKey).join(', ')}\n`);
    
    const total = workspaceSecrets.length + serverSecrets.length;
    
    console.log('='.repeat(60));
    console.log(`✅ SUCCESS! Loaded ${total} secrets from Infisical`);
    console.log('='.repeat(60) + '\n');
    
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ FAILED');
    console.error(`Error: ${error.message || String(error)}`);
    console.error('='.repeat(60) + '\n');
    process.exit(1);
  }
}

testNewSecret();
