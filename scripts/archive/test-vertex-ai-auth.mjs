#!/usr/bin/env node

/**
 * Minimal Vertex AI authentication test
 *
 * This script tests if Vertex AI credentials are working by:
 * 1. Loading credentials from GOOGLE_APPLICATION_CREDENTIALS
 * 2. Making a simple "Hello" request to Gemini
 * 3. Printing the full response or error details
 */

import { VertexAI } from '@google-cloud/vertexai';

// Configuration from environment
const projectId =
  process.env.GCP_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID;
const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
const model = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

console.log('='.repeat(60));
console.log('Vertex AI Authentication Test');
console.log('='.repeat(60));
console.log('Configuration:');
console.log(`  Project ID: ${projectId || '❌ NOT SET'}`);
console.log(`  Location: ${location}`);
console.log(`  Model: ${model}`);
console.log(`  Credentials: ${credsPath || '❌ NOT SET'}`);
console.log('='.repeat(60));

if (!projectId) {
  console.error(
    '\n❌ ERROR: GCP_PROJECT_ID or VERTEX_AI_PROJECT_ID environment variable not set'
  );
  process.exit(1);
}

if (!credsPath) {
  console.warn(
    '\n⚠️  WARNING: GOOGLE_APPLICATION_CREDENTIALS not set. Will try Application Default Credentials.'
  );
}

async function testVertexAI() {
  try {
    console.log('\n📡 Initializing Vertex AI client...');
    const vertexAI = new VertexAI({
      project: projectId,
      location: location,
    });

    console.log('✅ Client initialized');

    console.log(`\n📡 Getting generative model (${model})...`);
    const generativeModel = vertexAI.getGenerativeModel({
      model: model,
    });

    console.log('✅ Model loaded');

    console.log('\n📡 Sending test prompt: "Say hello!"...');
    const startTime = Date.now();

    const result = await generativeModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Say hello!' }],
        },
      ],
    });

    const duration = Date.now() - startTime;

    console.log(`✅ Response received in ${duration}ms`);
    console.log('\n' + '='.repeat(60));
    console.log('RESPONSE:');
    console.log('='.repeat(60));

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text) {
      console.log(text);
    } else {
      console.log('⚠️  No text in response');
      console.log('Raw response:', JSON.stringify(response, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('METADATA:');
    console.log('='.repeat(60));
    console.log('Finish Reason:', response.candidates?.[0]?.finishReason);
    console.log(
      'Safety Ratings:',
      JSON.stringify(response.candidates?.[0]?.safetyRatings, null, 2)
    );

    if (response.usageMetadata) {
      console.log('Usage:', JSON.stringify(response.usageMetadata, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS: Vertex AI authentication and API call working!');
    console.log('='.repeat(60));
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ ERROR OCCURRED');
    console.log('='.repeat(60));

    if (error instanceof SyntaxError) {
      console.log(
        'Error Type: SyntaxError (likely received HTML instead of JSON)'
      );
      console.log('Error Message:', error.message);
      console.log('\nThis usually means:');
      console.log(
        '  1. Authentication failed (wrong credentials or no credentials)'
      );
      console.log('  2. API is not enabled in GCP project');
      console.log('  3. Service account lacks required permissions');
      console.log('  4. Network/proxy issues');
      console.log(
        '\n⚠️  The actual error response (HTML) is not accessible due to'
      );
      console.log('     how the Vertex AI SDK handles HTTP errors internally.');
    } else {
      console.log('Error Type:', error.constructor?.name || 'Unknown');
      console.log('Error Message:', error.message);

      if (error.code) {
        console.log('Error Code:', error.code);
      }

      if (error.status) {
        console.log('HTTP Status:', error.status);
      }
    }

    console.log('\nFull Error Details:');
    console.log(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    console.log('\n' + '='.repeat(60));
    console.log('Troubleshooting Steps:');
    console.log('='.repeat(60));
    console.log('1. Verify credentials file exists:');
    console.log(`   ls -la ${credsPath || '(not set)'}`);
    console.log('\n2. Verify service account has required role:');
    console.log('   gcloud projects get-iam-policy ' + projectId);
    console.log('   (Look for roles/aiplatform.user on your service account)');
    console.log('\n3. Verify Vertex AI API is enabled:');
    console.log(
      '   gcloud services list --enabled --project=' +
        projectId +
        ' | grep aiplatform'
    );
    console.log('\n4. Test with gcloud CLI:');
    console.log(
      '   gcloud auth activate-service-account --key-file=' +
        (credsPath || 'KEY_FILE')
    );
    console.log(
      '   gcloud ai models list --region=' +
        location +
        ' --project=' +
        projectId
    );

    process.exit(1);
  }
}

testVertexAI();
