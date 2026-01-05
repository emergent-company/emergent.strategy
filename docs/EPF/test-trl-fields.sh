#!/usr/bin/env bash

artifact_file="_instances/twentyfirst/READY/05_roadmap_recipe.yaml"

echo "Checking TRL fields in: $artifact_file"
echo ""

for field in trl_start trl_target trl_progression technical_hypothesis; do
  echo "Field: $field"
  count=$(yq eval ".roadmap.tracks[].okrs[].key_results[] | select(has(\"$field\")) | .id" "$artifact_file" 2>/dev/null | wc -l | tr -d ' ')
  echo "  Found in $count KRs"
  
  if [ "$count" -eq "9" ]; then
    echo "  ✅ All 9 KRs have this field"
  else
    echo "  ❌ Missing from some KRs"
  fi
  echo ""
done
