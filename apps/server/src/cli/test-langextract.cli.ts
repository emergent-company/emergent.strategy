import { extract, Resolver, FormatType } from 'langextract';
import axios from 'axios';

const apiKey =
  process.env.LANGEXTRACT_API_KEY || 'AIzaSyA_0xmbhwfQVvBki1EMfvpUDSF8j7Sj-Lw';

const testText = `And Adam knew Eve his wife, and she conceived and bore Cain. And Cain went out from the presence of the Lord, and dwelt in the land of Nod, on the east of Eden.`;

const examples = [
  {
    text: 'And Enos lived ninety years, and begat Cainan.',
    extractions: [
      { extractionClass: 'person', extractionText: 'Enos' },
      { extractionClass: 'person', extractionText: 'Cainan' },
    ],
  },
];

async function testRawGeminiAPI() {
  console.log('\n=== RAW GEMINI API TEST ===');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

  const prompt = `Extract all person and place names from the following text.

Text: ${testText}

Return the response as a JSON array like this:
[{"person": "Name1"}, {"place": "Location1"}]`;

  try {
    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
      }
    );

    const rawText = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('Raw response from Gemini:');
    console.log('---');
    console.log(rawText);
    console.log('---');

    // Test the fence regex
    const fenceRegex = /```(?:json|yaml|yml)\n?([\s\S]*?)\n?```/;
    const match = rawText?.match(fenceRegex);
    if (match) {
      console.log('Fence regex matched! Extracted content:');
      console.log(match[1]);
    } else {
      console.log('Fence regex did NOT match');
      // Try to parse directly
      try {
        const parsed = JSON.parse(rawText);
        console.log('Direct JSON parse succeeded:', parsed);
      } catch (e) {
        console.log(
          'Direct JSON parse failed:',
          e instanceof Error ? e.message : e
        );
      }
    }
  } catch (error) {
    console.error(
      'API Error:',
      axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.message
        : error
    );
  }
}

async function testResolverWithRealGeminiFormat() {
  console.log('\n=== RESOLVER TEST WITH REAL GEMINI FORMAT ===');

  // This is the format Gemini actually returns (array, not object with extractions key)
  const fencedJson = `\`\`\`json
[
  {"person": "Adam"},
  {"person": "Eve"},
  {"person": "Cain"},
  {"place": "Nod"},
  {"place": "Eden"}
]
\`\`\``;

  console.log('Input (real Gemini format):');
  console.log(fencedJson);

  const resolver = new Resolver({
    fenceOutput: true,
    formatType: FormatType.JSON,
  });

  try {
    const extractions = resolver.resolve(fencedJson);
    console.log('\nResolver output (before alignment):', extractions);

    // Now try alignment
    const sourceText = testText;
    const alignedExtractions = resolver.align(extractions, sourceText, 0, 0);
    console.log('\nAligned extractions:', alignedExtractions);
  } catch (error) {
    console.error(
      'Resolver error:',
      error instanceof Error ? error.message : error
    );
  }
}

async function testResolverDirectly() {
  console.log('\n=== RESOLVER DIRECT TEST ===');

  // Simulate what LangExtract resolver receives
  const fencedJson = `\`\`\`json
{
  "extractions": [
    {"person": "Adam"},
    {"person": "Eve"},
    {"person": "Cain"}
  ]
}
\`\`\``;

  console.log('Input (fenced JSON):');
  console.log(fencedJson);

  // Test with fenceOutput: true
  const resolver = new Resolver({
    fenceOutput: true,
    formatType: FormatType.JSON,
  });

  try {
    const extractions = resolver.resolve(fencedJson);
    console.log('\nResolver output:', extractions);
  } catch (error) {
    console.error(
      'Resolver error:',
      error instanceof Error ? error.message : error
    );
  }

  // Test with fenceOutput: false (should fail)
  const resolver2 = new Resolver({
    fenceOutput: false,
    formatType: FormatType.JSON,
  });

  try {
    const extractions2 = resolver2.resolve(fencedJson);
    console.log('\nResolver (fenceOutput:false) output:', extractions2);
  } catch (error) {
    console.error(
      '\nResolver (fenceOutput:false) error:',
      error instanceof Error ? error.message : error
    );
  }
}

async function main() {
  console.log('Testing LangExtract with simple text...');
  console.log('Text:', testText);
  console.log('API Key (first 20 chars):', apiKey.slice(0, 20) + '...');

  // First test the resolver directly with the format Gemini actually uses
  await testResolverWithRealGeminiFormat();

  // Then test the resolver with object format
  await testResolverDirectly();

  // Then test raw API to see what we get
  await testRawGeminiAPI();

  // Test 1: With gemini-2.0-flash and fenceOutput: false (default - likely fails)
  console.log(
    '\n=== TEST 1: gemini-2.0-flash with fenceOutput: false (default) ==='
  );
  try {
    const rawResult1 = await extract(testText, {
      promptDescription: 'Extract all person and place names from the text.',
      examples,
      modelType: 'gemini',
      modelId: 'gemini-2.0-flash',
      apiKey,
      temperature: 0.1,
      fenceOutput: false,
    });
    const result1 = Array.isArray(rawResult1) ? rawResult1[0] : rawResult1;
    console.log('Extractions:', result1?.extractions?.length || 0);
    if (result1?.extractions?.length) {
      console.log(JSON.stringify(result1.extractions, null, 2));
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test 2: With gemini-2.0-flash and fenceOutput: true (should work!)
  console.log('\n=== TEST 2: gemini-2.0-flash with fenceOutput: true ===');
  try {
    const rawResult2 = await extract(testText, {
      promptDescription: 'Extract all person and place names from the text.',
      examples,
      modelType: 'gemini',
      modelId: 'gemini-2.0-flash',
      apiKey,
      temperature: 0.1,
      fenceOutput: true,
      formatType: FormatType.JSON, // Explicitly set to JSON
    });
    const result2 = Array.isArray(rawResult2) ? rawResult2[0] : rawResult2;
    console.log('Extractions:', result2?.extractions?.length || 0);
    console.log('Full result keys:', Object.keys(result2 || {}));
    if (result2?.extractions?.length) {
      console.log(JSON.stringify(result2.extractions, null, 2));
    } else {
      console.log(
        'Result object:',
        JSON.stringify(result2, null, 2).slice(0, 500)
      );
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test 3: With gemini-1.5-flash and fenceOutput: true
  console.log('\n=== TEST 3: gemini-1.5-flash with fenceOutput: true ===');
  try {
    const rawResult3 = await extract(testText, {
      promptDescription: 'Extract all person and place names from the text.',
      examples,
      modelType: 'gemini',
      modelId: 'gemini-1.5-flash',
      apiKey,
      temperature: 0.1,
      fenceOutput: true,
    });
    const result3 = Array.isArray(rawResult3) ? rawResult3[0] : rawResult3;
    console.log('Extractions:', result3?.extractions?.length || 0);
    if (result3?.extractions?.length) {
      console.log(JSON.stringify(result3.extractions, null, 2));
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

main();
