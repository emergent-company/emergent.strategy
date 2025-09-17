#!/usr/bin/env node
// Simple guard script to ensure all *.stories.tsx use makeMeta helper (consistency gate)
// Run via: npm run check:stories
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../apps/admin/src/components/', import.meta.url).pathname

/** Collect all story files recursively */
function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = join(dir, d.name)
        if (d.isDirectory()) return walk(p)
        if (d.isFile() && /\.stories\.(t|j)sx?$/.test(d.name)) return [p]
        return []
    })
}

const files = walk(root)
let failed = false
for (const file of files) {
    const content = readFileSync(file, 'utf8')
    // Skip MDX, only TSX/JSX here
    if (!content.includes('makeMeta')) {
        failed = true
        console.warn(`Missing makeMeta helper in: ${file.replace(root, '')}`)
    }
}

if (failed) {
    console.error('\nStory consistency check failed. Add makeMeta usage to the files above.')
    process.exit(1)
} else {
    console.log('All stories use makeMeta ✅')
}
