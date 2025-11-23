import { config } from 'dotenv';

config();
config({ path: '.env.local' });

const NEW_CLIENT_SECRET = 'd8f4fe2cf200ef5a592fa3450326f7d9d2826bebb6d0600d65e4e3e21e362dca';

async function testUniversalAuthLogin() {
  console.log('\n🔐 Testing Universal Auth Login Manually\n');
  
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const siteUrl = process.env.INFISICAL_SITE_URL;
  
  console.log(`Client ID: ${clientId}`);
  console.log(`Site URL: ${siteUrl}`);
  console.log(`Client Secret: ${NEW_CLIENT_SECRET.substring(0, 10)}...\n`);
  
  try {
    console.log('📡 Calling Universal Auth login endpoint...');
    
    const response = await fetch(`${siteUrl}/api/v1/auth/universal-auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: clientId,
        clientSecret: NEW_CLIENT_SECRET,
      }),
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    console.log('\nResponse:');
    console.log(JSON.stringify(data, null, 2));
    
    if (response.ok && data.accessToken) {
      console.log('\n✅ SUCCESS! Got access token');
      console.log(`Token: ${data.accessToken.substring(0, 20)}...`);
      return data.accessToken;
    } else {
      console.log('\n❌ FAILED to get access token');
      return null;
    }
    
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    return null;
  }
}

testUniversalAuthLogin();
