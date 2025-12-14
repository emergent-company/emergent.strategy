#!/bin/bash
# Combine all Bible books into one document

OUTPUT="complete-bible.md"

echo "# The Complete Bible" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Combined from 66 books for knowledge graph extraction testing." >> "$OUTPUT"
echo "" >> "$OUTPUT"

for book in books/*.md; do
  bookname=$(basename "$book" .md | sed 's/^[0-9]*_//' | sed 's/_/ /g')
  echo "Adding: $bookname"
  echo "---" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  cat "$book" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
done

echo "Created: $OUTPUT"
wc -c "$OUTPUT"
wc -w "$OUTPUT"
