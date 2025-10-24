const fs = require('fs');
const path = require('path');

const mjsPath = path.join(__dirname, '../.api/apis/clickup/index.mjs');
let content = fs.readFileSync(mjsPath, 'utf-8');

// Fix malformed method signatures like: methodName(...)> {
// Replace with: methodName(...) {
content = content.replace(/(\w+\([^)]*\))>[^{]*\{/g, '$1 {');

// Also fix any remaining partial type annotations
content = content.replace(/(\w+\([^)]*\))[^{]*\{/g, (match, captured) => {
    // If there's a closing paren followed by anything other than whitespace and opening brace, clean it
    if (match.match(/\)[^\s{]/)) {
        return captured + ' {';
    }
    return match;
});

fs.writeFileSync(mjsPath, content, 'utf-8');
console.log('✅ Fixed malformed method signatures in index.mjs');
