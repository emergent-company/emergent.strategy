package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/template"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var schemasCmd = &cobra.Command{
	Use:   "schemas",
	Short: "List available EPF schemas",
	Long: `List all available EPF schemas that have been loaded from the schemas directory.

This shows all artifact types, their schema files, phases, and descriptions.

Examples:
  epf-cli schemas                           # List all schemas
  epf-cli schemas --phase READY             # List only READY phase schemas
  epf-cli schemas --json                    # Output as JSON`,
	Run: func(cmd *cobra.Command, args []string) {
		// Get schemas directory (may be empty if using embedded)
		schemasPath, _ := GetSchemasDir()

		// Create validator (which loads schemas, with embedded fallback)
		val, err := validator.NewValidator(schemasPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error loading schemas: %v\n", err)
			os.Exit(1)
		}

		loader := val.GetLoader()
		schemas := loader.ListSchemas()

		// Sort by phase, then by artifact type
		sort.Slice(schemas, func(i, j int) bool {
			if schemas[i].Phase != schemas[j].Phase {
				phaseOrder := map[schema.Phase]int{
					schema.PhaseREADY: 1,
					schema.PhaseFIRE:  2,
					schema.PhaseAIM:   3,
					"":                4,
				}
				return phaseOrder[schemas[i].Phase] < phaseOrder[schemas[j].Phase]
			}
			return schemas[i].ArtifactType < schemas[j].ArtifactType
		})

		// Filter by phase if specified
		phaseFilter, _ := cmd.Flags().GetString("phase")
		if phaseFilter != "" {
			var filtered []*schema.SchemaInfo
			for _, s := range schemas {
				if string(s.Phase) == phaseFilter {
					filtered = append(filtered, s)
				}
			}
			schemas = filtered
		}

		// Print schemas with source info
		fmt.Printf("EPF Schemas (loaded from %s)\n\n", loader.Source())

		currentPhase := ""
		for _, s := range schemas {
			phase := string(s.Phase)
			if phase == "" {
				phase = "Other"
			}
			if phase != currentPhase {
				currentPhase = phase
				fmt.Printf("## %s Phase\n\n", phase)
			}
			fmt.Printf("  %-30s %s\n", s.ArtifactType, s.SchemaFile)
			if s.Description != "" {
				fmt.Printf("  %-30s %s\n", "", s.Description)
			}
		}

		fmt.Printf("\nTotal: %d schemas\n", len(schemas))
	},
}

func init() {
	rootCmd.AddCommand(schemasCmd)
	schemasCmd.Flags().StringP("phase", "p", "", "filter by phase (READY, FIRE, AIM)")

	// Add show subcommand
	schemasCmd.AddCommand(schemasShowCmd)
	schemasShowCmd.Flags().StringP("path", "", "", "show only a specific path within the schema (e.g., 'strengths')")
	schemasShowCmd.Flags().BoolP("json", "j", false, "output raw JSON schema")
	schemasShowCmd.Flags().BoolP("with-examples", "e", false, "include template examples for each field")
	schemasShowCmd.Flags().StringP("file", "f", "", "compare against a specific file to show current values")
}

var schemasShowCmd = &cobra.Command{
	Use:   "show <schema-name>",
	Short: "Show schema structure for an artifact type",
	Long: `Display the schema structure in a human-readable format.

This helps you understand what fields are required, their types, and constraints.

Examples:
  epf-cli schemas show insight_analyses              # Show full schema
  epf-cli schemas show insight_analyses --path strengths  # Show only strengths section
  epf-cli schemas show feature_definition --json     # Output raw JSON
  epf-cli schemas show insight_analyses -e           # Include template examples
  epf-cli schemas show insight_analyses -f file.yaml # Compare against file`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		schemaName := args[0]
		pathFilter, _ := cmd.Flags().GetString("path")
		jsonOutput, _ := cmd.Flags().GetBool("json")
		withExamples, _ := cmd.Flags().GetBool("with-examples")
		compareFile, _ := cmd.Flags().GetString("file")

		// Get schemas directory (may be empty if using embedded)
		schemasPath, _ := GetSchemasDir()

		// Create validator (which loads schemas, with embedded fallback)
		val, err := validator.NewValidator(schemasPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error loading schemas: %v\n", err)
			os.Exit(1)
		}

		loader := val.GetLoader()

		// Convert string to ArtifactType
		artifactType, err := schema.ArtifactTypeFromString(schemaName)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			fmt.Fprintf(os.Stderr, "\nAvailable schema types:\n")
			for _, s := range loader.ListSchemas() {
				fmt.Fprintf(os.Stderr, "  %s\n", s.ArtifactType)
			}
			os.Exit(1)
		}

		// Get the schema
		schemaInfo, err := loader.GetSchema(artifactType)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		// Parse the schema JSON
		var schemaData map[string]interface{}
		if err := json.Unmarshal(schemaInfo.Schema, &schemaData); err != nil {
			fmt.Fprintf(os.Stderr, "Error parsing schema: %v\n", err)
			os.Exit(1)
		}

		// Load template if examples requested
		var templateData map[string]interface{}
		if withExamples {
			templateData = loadTemplateData(artifactType)
		}

		// Load file data if comparison requested
		var fileData map[string]interface{}
		if compareFile != "" {
			fileData = loadFileData(compareFile)
		}

		// If path filter is specified, navigate to that section
		if pathFilter != "" {
			schemaData = navigateToPath(schemaData, pathFilter)
			if schemaData == nil {
				fmt.Fprintf(os.Stderr, "Error: path '%s' not found in schema\n", pathFilter)
				os.Exit(1)
			}
			if templateData != nil {
				templateData = navigateToYAMLPath(templateData, pathFilter)
			}
			if fileData != nil {
				fileData = navigateToYAMLPath(fileData, pathFilter)
			}
		}

		// Output
		if jsonOutput {
			output, err := json.MarshalIndent(schemaData, "", "  ")
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error formatting JSON: %v\n", err)
				os.Exit(1)
			}
			fmt.Println(string(output))
		} else {
			fmt.Printf("Schema: %s\n", schemaInfo.ArtifactType)
			if schemaInfo.Description != "" {
				fmt.Printf("Description: %s\n", schemaInfo.Description)
			}
			fmt.Printf("Phase: %s\n", schemaInfo.Phase)
			if withExamples && templateData != nil {
				fmt.Println("(Showing template examples)")
			}
			if compareFile != "" && fileData != nil {
				fmt.Printf("(Comparing against: %s)\n", compareFile)
			}
			fmt.Println()
			printSchemaStructureWithContext(schemaData, templateData, fileData, 0, pathFilter == "")
		}
	},
}

// navigateToPath finds a specific path in the schema (e.g., "strengths" or "definition.personas")
func navigateToPath(schemaData map[string]interface{}, path string) map[string]interface{} {
	parts := strings.Split(path, ".")

	current := schemaData
	for _, part := range parts {
		// Look in properties first
		if props, ok := current["properties"].(map[string]interface{}); ok {
			if prop, ok := props[part].(map[string]interface{}); ok {
				current = prop
				continue
			}
		}
		// Look in items for arrays
		if items, ok := current["items"].(map[string]interface{}); ok {
			if props, ok := items["properties"].(map[string]interface{}); ok {
				if prop, ok := props[part].(map[string]interface{}); ok {
					current = prop
					continue
				}
			}
		}
		// Direct lookup
		if prop, ok := current[part].(map[string]interface{}); ok {
			current = prop
			continue
		}
		return nil
	}
	return current
}

// printSchemaStructure prints the schema in a human-readable format
func printSchemaStructure(schemaData map[string]interface{}, indent int, showTopLevel bool) {
	prefix := strings.Repeat("  ", indent)

	// Get required fields
	required := make(map[string]bool)
	if reqList, ok := schemaData["required"].([]interface{}); ok {
		for _, r := range reqList {
			if s, ok := r.(string); ok {
				required[s] = true
			}
		}
	}

	// Print description if present at this level
	if desc, ok := schemaData["description"].(string); ok && desc != "" {
		fmt.Printf("%sDescription: %s\n\n", prefix, truncateString(desc, 100))
	}

	// Print type info if present
	if t, ok := schemaData["type"]; ok && showTopLevel {
		fmt.Printf("%sType: %v\n", prefix, t)
	}

	// Print constraints at this level
	constraints := getConstraints(schemaData)
	if len(constraints) > 0 {
		fmt.Printf("%sConstraints: %s\n", prefix, strings.Join(constraints, ", "))
	}

	// Print enum values if present
	if enum, ok := schemaData["enum"].([]interface{}); ok {
		values := make([]string, len(enum))
		for i, v := range enum {
			values[i] = fmt.Sprintf("%v", v)
		}
		fmt.Printf("%sAllowed values: %s\n", prefix, strings.Join(values, ", "))
	}

	// If this is an array, print item structure
	if items, ok := schemaData["items"].(map[string]interface{}); ok {
		fmt.Printf("\n%sArray item structure:\n", prefix)
		if itemProps, ok := items["properties"].(map[string]interface{}); ok {
			// Get required fields for array items
			itemRequired := make(map[string]bool)
			if reqList, ok := items["required"].([]interface{}); ok {
				for _, r := range reqList {
					if s, ok := r.(string); ok {
						itemRequired[s] = true
					}
				}
			}

			// Sort item property names
			itemNames := make([]string, 0, len(itemProps))
			for n := range itemProps {
				itemNames = append(itemNames, n)
			}
			sort.Strings(itemNames)

			for _, n := range itemNames {
				p := itemProps[n].(map[string]interface{})
				printProperty(n, p, itemRequired[n], indent+1)
			}
		} else {
			// Simple array items (like array of strings)
			itemType := getTypeString(items)
			fmt.Printf("%s  Item type: %s\n", prefix, itemType)
			if itemConstraints := getConstraints(items); len(itemConstraints) > 0 {
				fmt.Printf("%s  Item constraints: %s\n", prefix, strings.Join(itemConstraints, ", "))
			}
		}
		return
	}

	// Print properties if this is an object
	if props, ok := schemaData["properties"].(map[string]interface{}); ok {
		if showTopLevel {
			fmt.Println()
		}
		// Sort property names for consistent output
		names := make([]string, 0, len(props))
		for name := range props {
			names = append(names, name)
		}
		sort.Strings(names)

		for _, name := range names {
			prop := props[name].(map[string]interface{})
			printProperty(name, prop, required[name], indent)
		}
	}
}

// printProperty prints a single property with its type and constraints
func printProperty(name string, prop map[string]interface{}, isRequired bool, indent int) {
	prefix := strings.Repeat("  ", indent)

	// Build type string
	typeStr := getTypeString(prop)

	// Required indicator
	reqStr := ""
	if isRequired {
		reqStr = " [required]"
	}

	// Print the property line
	fmt.Printf("%s%s: %s%s\n", prefix, name, typeStr, reqStr)

	// Print description if present
	if desc, ok := prop["description"].(string); ok && desc != "" {
		fmt.Printf("%s  └─ %s\n", prefix, truncateString(desc, 80))
	}

	// Print enum values if present
	if enum, ok := prop["enum"].([]interface{}); ok {
		values := make([]string, len(enum))
		for i, v := range enum {
			values[i] = fmt.Sprintf("%v", v)
		}
		fmt.Printf("%s  └─ Allowed values: %s\n", prefix, strings.Join(values, ", "))
	}

	// Print constraints
	constraints := getConstraints(prop)
	if len(constraints) > 0 {
		fmt.Printf("%s  └─ Constraints: %s\n", prefix, strings.Join(constraints, ", "))
	}

	// Recursively print nested object properties
	if nestedProps, ok := prop["properties"].(map[string]interface{}); ok {
		// Get required fields for nested object
		nestedRequired := make(map[string]bool)
		if reqList, ok := prop["required"].([]interface{}); ok {
			for _, r := range reqList {
				if s, ok := r.(string); ok {
					nestedRequired[s] = true
				}
			}
		}

		// Sort nested property names
		nestedNames := make([]string, 0, len(nestedProps))
		for n := range nestedProps {
			nestedNames = append(nestedNames, n)
		}
		sort.Strings(nestedNames)

		for _, n := range nestedNames {
			p := nestedProps[n].(map[string]interface{})
			printProperty(n, p, nestedRequired[n], indent+1)
		}
	}

	// Print array item structure if it's an array with object items
	if items, ok := prop["items"].(map[string]interface{}); ok {
		if itemProps, ok := items["properties"].(map[string]interface{}); ok {
			fmt.Printf("%s  └─ Array items:\n", prefix)

			// Get required fields for array items
			itemRequired := make(map[string]bool)
			if reqList, ok := items["required"].([]interface{}); ok {
				for _, r := range reqList {
					if s, ok := r.(string); ok {
						itemRequired[s] = true
					}
				}
			}

			// Sort item property names
			itemNames := make([]string, 0, len(itemProps))
			for n := range itemProps {
				itemNames = append(itemNames, n)
			}
			sort.Strings(itemNames)

			for _, n := range itemNames {
				p := itemProps[n].(map[string]interface{})
				printProperty(n, p, itemRequired[n], indent+2)
			}
		}
	}
}

// getTypeString returns a human-readable type string
func getTypeString(prop map[string]interface{}) string {
	typeVal, hasType := prop["type"]

	// Check for oneOf/anyOf (union types)
	if oneOf, ok := prop["oneOf"].([]interface{}); ok {
		types := make([]string, 0)
		for _, item := range oneOf {
			if m, ok := item.(map[string]interface{}); ok {
				types = append(types, getTypeString(m))
			}
		}
		return strings.Join(types, " | ")
	}

	if !hasType {
		// Check if it's a $ref
		if ref, ok := prop["$ref"].(string); ok {
			return "ref:" + ref
		}
		return "any"
	}

	switch t := typeVal.(type) {
	case string:
		if t == "array" {
			if items, ok := prop["items"].(map[string]interface{}); ok {
				itemType := getTypeString(items)
				return "array<" + itemType + ">"
			}
			return "array"
		}
		return t
	case []interface{}:
		types := make([]string, len(t))
		for i, v := range t {
			types[i] = fmt.Sprintf("%v", v)
		}
		return strings.Join(types, " | ")
	default:
		return fmt.Sprintf("%v", typeVal)
	}
}

// getConstraints returns a list of constraint descriptions
func getConstraints(prop map[string]interface{}) []string {
	var constraints []string

	if minLen, ok := prop["minLength"].(float64); ok {
		constraints = append(constraints, fmt.Sprintf("min length: %.0f", minLen))
	}
	if maxLen, ok := prop["maxLength"].(float64); ok {
		constraints = append(constraints, fmt.Sprintf("max length: %.0f", maxLen))
	}
	if minItems, ok := prop["minItems"].(float64); ok {
		constraints = append(constraints, fmt.Sprintf("min items: %.0f", minItems))
	}
	if maxItems, ok := prop["maxItems"].(float64); ok {
		constraints = append(constraints, fmt.Sprintf("max items: %.0f", maxItems))
	}
	if pattern, ok := prop["pattern"].(string); ok {
		constraints = append(constraints, fmt.Sprintf("pattern: %s", pattern))
	}
	if min, ok := prop["minimum"].(float64); ok {
		constraints = append(constraints, fmt.Sprintf("min: %.0f", min))
	}
	if max, ok := prop["maximum"].(float64); ok {
		constraints = append(constraints, fmt.Sprintf("max: %.0f", max))
	}

	return constraints
}

// loadTemplateData loads the template for an artifact type and returns it as a map
func loadTemplateData(artifactType schema.ArtifactType) map[string]interface{} {
	// Try to get EPF root
	epfRoot, err := GetEPFRoot()
	if err != nil {
		return nil
	}

	// Create template loader
	tmplLoader := template.NewLoader(epfRoot)
	if err := tmplLoader.Load(); err != nil {
		// Try embedded
		tmplLoader = template.NewEmbeddedLoader()
		if err := tmplLoader.Load(); err != nil {
			return nil
		}
	}

	// Get template
	tmpl, err := tmplLoader.GetTemplate(artifactType)
	if err != nil {
		return nil
	}

	// Parse YAML content
	var data map[string]interface{}
	if err := yaml.Unmarshal([]byte(tmpl.Content), &data); err != nil {
		return nil
	}

	return data
}

// loadFileData loads a YAML file and returns it as a map
func loadFileData(filePath string) map[string]interface{} {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}

	var data map[string]interface{}
	if err := yaml.Unmarshal(content, &data); err != nil {
		return nil
	}

	return data
}

// navigateToYAMLPath navigates to a specific path in YAML data
func navigateToYAMLPath(data map[string]interface{}, path string) map[string]interface{} {
	if data == nil {
		return nil
	}

	parts := strings.Split(path, ".")
	current := data

	for _, part := range parts {
		if val, ok := current[part]; ok {
			switch v := val.(type) {
			case map[string]interface{}:
				current = v
			default:
				// Not a map, can't navigate further
				return nil
			}
		} else {
			return nil
		}
	}

	return current
}

// printSchemaStructureWithContext prints schema with template examples and file values
func printSchemaStructureWithContext(schemaData, templateData, fileData map[string]interface{}, indent int, showTopLevel bool) {
	prefix := strings.Repeat("  ", indent)

	// Get required fields
	required := make(map[string]bool)
	if reqList, ok := schemaData["required"].([]interface{}); ok {
		for _, r := range reqList {
			if s, ok := r.(string); ok {
				required[s] = true
			}
		}
	}

	// Print description if present at this level
	if desc, ok := schemaData["description"].(string); ok && desc != "" {
		fmt.Printf("%sDescription: %s\n\n", prefix, truncateString(desc, 100))
	}

	// Print type info if present
	if t, ok := schemaData["type"]; ok && showTopLevel {
		fmt.Printf("%sType: %v\n", prefix, t)
	}

	// Print constraints at this level
	constraints := getConstraints(schemaData)
	if len(constraints) > 0 {
		fmt.Printf("%sConstraints: %s\n", prefix, strings.Join(constraints, ", "))
	}

	// Print enum values if present
	if enum, ok := schemaData["enum"].([]interface{}); ok {
		values := make([]string, len(enum))
		for i, v := range enum {
			values[i] = fmt.Sprintf("%v", v)
		}
		fmt.Printf("%sAllowed values: %s\n", prefix, strings.Join(values, ", "))
	}

	// If this is an array, print item structure
	if items, ok := schemaData["items"].(map[string]interface{}); ok {
		fmt.Printf("\n%sArray item structure:\n", prefix)
		if itemProps, ok := items["properties"].(map[string]interface{}); ok {
			// Get required fields for array items
			itemRequired := make(map[string]bool)
			if reqList, ok := items["required"].([]interface{}); ok {
				for _, r := range reqList {
					if s, ok := r.(string); ok {
						itemRequired[s] = true
					}
				}
			}

			// Get template example for first array item
			var itemTemplateData map[string]interface{}
			if templateData != nil {
				if arr, ok := templateData["items"].([]interface{}); ok && len(arr) > 0 {
					if item, ok := arr[0].(map[string]interface{}); ok {
						itemTemplateData = item
					}
				}
			}

			// Sort item property names
			itemNames := make([]string, 0, len(itemProps))
			for n := range itemProps {
				itemNames = append(itemNames, n)
			}
			sort.Strings(itemNames)

			for _, n := range itemNames {
				p := itemProps[n].(map[string]interface{})
				var tmplVal, fileVal interface{}
				if itemTemplateData != nil {
					tmplVal = itemTemplateData[n]
				}
				printPropertyWithContext(n, p, itemRequired[n], tmplVal, fileVal, indent+1)
			}
		} else {
			// Simple array items (like array of strings)
			itemType := getTypeString(items)
			fmt.Printf("%s  Item type: %s\n", prefix, itemType)
			if itemConstraints := getConstraints(items); len(itemConstraints) > 0 {
				fmt.Printf("%s  Item constraints: %s\n", prefix, strings.Join(itemConstraints, ", "))
			}
		}
		return
	}

	// Print properties if this is an object
	if props, ok := schemaData["properties"].(map[string]interface{}); ok {
		if showTopLevel {
			fmt.Println()
		}
		// Sort property names for consistent output
		names := make([]string, 0, len(props))
		for name := range props {
			names = append(names, name)
		}
		sort.Strings(names)

		for _, name := range names {
			prop := props[name].(map[string]interface{})
			var tmplVal, fileVal interface{}
			if templateData != nil {
				tmplVal = templateData[name]
			}
			if fileData != nil {
				fileVal = fileData[name]
			}
			printPropertyWithContext(name, prop, required[name], tmplVal, fileVal, indent)
		}
	}
}

// printPropertyWithContext prints a property with optional template and file values
func printPropertyWithContext(name string, prop map[string]interface{}, isRequired bool, templateVal, fileVal interface{}, indent int) {
	prefix := strings.Repeat("  ", indent)

	// Build type string
	typeStr := getTypeString(prop)

	// Required indicator
	reqStr := ""
	if isRequired {
		reqStr = " [required]"
	}

	// Print the property line
	fmt.Printf("%s%s: %s%s\n", prefix, name, typeStr, reqStr)

	// Print description if present
	if desc, ok := prop["description"].(string); ok && desc != "" {
		fmt.Printf("%s  └─ %s\n", prefix, truncateString(desc, 80))
	}

	// Print enum values if present
	if enum, ok := prop["enum"].([]interface{}); ok {
		values := make([]string, len(enum))
		for i, v := range enum {
			values[i] = fmt.Sprintf("%v", v)
		}
		fmt.Printf("%s  └─ Allowed values: %s\n", prefix, strings.Join(values, ", "))
	}

	// Print constraints
	constraints := getConstraints(prop)
	if len(constraints) > 0 {
		fmt.Printf("%s  └─ Constraints: %s\n", prefix, strings.Join(constraints, ", "))
	}

	// Print template example if available
	if templateVal != nil {
		exampleStr := formatExampleValue(templateVal)
		if exampleStr != "" {
			fmt.Printf("%s  └─ Example: %s\n", prefix, truncateString(exampleStr, 100))
		}
	}

	// Print current file value if available
	if fileVal != nil {
		currentStr := formatExampleValue(fileVal)
		if currentStr != "" {
			fmt.Printf("%s  └─ Current value: %s\n", prefix, truncateString(currentStr, 100))
		}
	}

	// Recursively print nested object properties
	if nestedProps, ok := prop["properties"].(map[string]interface{}); ok {
		// Get required fields for nested object
		nestedRequired := make(map[string]bool)
		if reqList, ok := prop["required"].([]interface{}); ok {
			for _, r := range reqList {
				if s, ok := r.(string); ok {
					nestedRequired[s] = true
				}
			}
		}

		// Get nested template/file data
		var nestedTmpl, nestedFile map[string]interface{}
		if templateVal != nil {
			if m, ok := templateVal.(map[string]interface{}); ok {
				nestedTmpl = m
			}
		}
		if fileVal != nil {
			if m, ok := fileVal.(map[string]interface{}); ok {
				nestedFile = m
			}
		}

		// Sort nested property names
		nestedNames := make([]string, 0, len(nestedProps))
		for n := range nestedProps {
			nestedNames = append(nestedNames, n)
		}
		sort.Strings(nestedNames)

		for _, n := range nestedNames {
			p := nestedProps[n].(map[string]interface{})
			var tmplVal, fVal interface{}
			if nestedTmpl != nil {
				tmplVal = nestedTmpl[n]
			}
			if nestedFile != nil {
				fVal = nestedFile[n]
			}
			printPropertyWithContext(n, p, nestedRequired[n], tmplVal, fVal, indent+1)
		}
	}

	// Print array item structure if it's an array with object items
	if items, ok := prop["items"].(map[string]interface{}); ok {
		if itemProps, ok := items["properties"].(map[string]interface{}); ok {
			fmt.Printf("%s  └─ Array items:\n", prefix)

			// Get required fields for array items
			itemRequired := make(map[string]bool)
			if reqList, ok := items["required"].([]interface{}); ok {
				for _, r := range reqList {
					if s, ok := r.(string); ok {
						itemRequired[s] = true
					}
				}
			}

			// Get template example for first array item
			var itemTmpl map[string]interface{}
			if templateVal != nil {
				if arr, ok := templateVal.([]interface{}); ok && len(arr) > 0 {
					if item, ok := arr[0].(map[string]interface{}); ok {
						itemTmpl = item
					}
				}
			}

			// Sort item property names
			itemNames := make([]string, 0, len(itemProps))
			for n := range itemProps {
				itemNames = append(itemNames, n)
			}
			sort.Strings(itemNames)

			for _, n := range itemNames {
				p := itemProps[n].(map[string]interface{})
				var tmplVal interface{}
				if itemTmpl != nil {
					tmplVal = itemTmpl[n]
				}
				printPropertyWithContext(n, p, itemRequired[n], tmplVal, nil, indent+2)
			}
		}
	}
}

// formatExampleValue formats a value for display as an example
func formatExampleValue(val interface{}) string {
	switch v := val.(type) {
	case string:
		// Truncate long strings and remove newlines
		s := strings.ReplaceAll(v, "\n", " ")
		return s
	case []interface{}:
		if len(v) == 0 {
			return "[]"
		}
		// Show first item type
		if len(v) == 1 {
			return fmt.Sprintf("[%v]", formatExampleValue(v[0]))
		}
		return fmt.Sprintf("[%v, ...] (%d items)", formatExampleValue(v[0]), len(v))
	case map[string]interface{}:
		// Show keys
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		if len(keys) <= 3 {
			return fmt.Sprintf("{%s}", strings.Join(keys, ", "))
		}
		return fmt.Sprintf("{%s, ...} (%d keys)", strings.Join(keys[:3], ", "), len(keys))
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", v)
	}
}

// (truncateString is defined in health.go)
