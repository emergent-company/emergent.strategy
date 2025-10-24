import { readFileSync, writeFileSync } from 'fs';

const content = readFileSync('index.ts.bak', 'utf-8');

// Remove import type statements
let result = content.replace(/^import type .*;$/gm, '');

// Remove type annotations from parameters and return types
result = result.replace(/:\s*[A-Za-z<>[\]|&\s,{}'"`.]+(?=\s*[),={])/g, '');

// Remove class property type annotations
result = result.replace(/^\s+(\w+):\s*[A-Za-z<>[\]|&\s,{}'"`.]+;$/gm, '');

// Clean up multiple blank lines
result = result.replace(/\n\n\n+/g, '\n\n');

writeFileSync('index.mjs', result, 'utf-8');
console.log('Stripped TypeScript types from index.ts.bak -> index.mjs');
