# **Emergent Strategy: The Master Plan**

**Version:** 3.2 (Unified Writer Edition)

**Date:** February 2026

**Status:** Phase 2 Execution (Kernel Build)

## **1\. Executive Vision**

**Emergent Strategy** (formerly ProductFactoryOS) is a "Local-First Venture Compiler." It shifts the paradigm of company building from "Document Management" to **"Software Engineering."**

It treats **Business Logic** (Strategy, Ops, Commercial) exactly like **Software Logic**. Both are defined in source code (.yaml), versioned in Git, and "compiled" into executable outputs.

**The Core Philosophy:**

1. **Everything is Code:** Strategy is YAML. Process is Markdown. The Repo is the Database.
2. **One Universal Writer:** **OpenCode** writes _all_ files (Strategy, Ops, Code), assisted by the **epf-cli** linter.
3. **Decoupled Intelligence:** The "Writer" (OpenCode) is separate from the "Reviewer" (Quality Council).

## **2\. Strategic Context**

### **2.1 The Framework: EPF (Emergent Product Framework)**

EPF is the "Source Code Standard" for the venture. It organizes the repository into four braided tracks:

1. **Strategy:** The Direction (North Star, KRs).
2. **Product:** The Software (Features, Tech Stack).
3. **Org & Ops:** The Process (SOPs, Workflows).
4. **Commercial:** The Growth (Funnels, Copy).

### **2.2 The Intelligence: Emergent.Core**

**Emergent.Core** is our proprietary AI Knowledge Agent.

- **Role:** The "Chief Intelligence Officer" Plugin.
- **Integration:** Connects via **MCP** to query historical knowledge (Big Pickle) without data migration.

## **3\. System Architecture**

The solution consists of four distinct layers working in unison:

### **3.1 The Kernel: epf-cli (The Linter/Language Server)**

- **Role:** The "Compiler Backend."
- **Responsibility:**
  - **Validation:** Ensures OpenCode writes valid YAML schemas.
  - **MCP Server:** Provides schema definitions to OpenCode.
  - **It does NOT write content.** It only validates content.

### **3.2 The Local OS: emergent-strategy (The Cockpit)**

- **Role:** The "Developer Console."
- **Nature:** A rich TUI (Go/BubbleTea).
- **Responsibility:** Visualizes state, orchestrates the build loop, and manages the Quality Council.

### **3.3 The Integration Layer (Output Adapters)**

- **Role:** The "Shipping Department."
- **Nature:** MCP Servers (Plugins).
- **Responsibility:** Translates internal artifacts into external API calls (ClickUp, HubSpot).

### **3.4 The Web OS: emergent-strategy \--server**

- **Role:** The "Stakeholder View."
- **Nature:** Git-Backed CMS (Go \+ HTMX).

### **3.5 The Quality Council (Mixture of Experts)**

- **Role:** The "QA Department."
- **Mechanism:** A review loop where specialized Agents (Security, Product, Syntax) critique OpenCode's output before committing.

## **4\. The Workflow (Tri-Mode)**

### **Mode A: "Vibe Coding" (Local)**

- **Interface:** VS Code \+ Copilot.
- **Mechanism:** Copilot writes YAML. epf-cli provides the schema for autocomplete/linting.

### **Mode B: "Agent Coding" (Local)**

- **Interface:** Emergent Strategy TUI \+ OpenCode.
- **Mechanism:**
  1. User prompts: _"Update Strategy and rewrite the Sales Script."_
  2. **OpenCode** queries epf-cli for the schema.
  3. **OpenCode** writes strategy.yaml and growth.yaml.
  4. **Quality Council** reviews the changes.
  5. **Emergent Strategy** commits to Git.

### **Mode C: "Visual Editing" (Web)**

- **Interface:** Web Dashboard (HTMX).
- **Mechanism:** User edits forms. Server commits to Git.

## **5\. The 4-Track Production Line**

**The Universal Rule:** OpenCode (The Agent) writes the Source. Emergent Strategy (The Factory) compiles it into Artifacts.

| **Track**      | **The Writer (AI)** | **Input (Source in Git)** | **The Compiler (Deterministic)** | **Output (Artifact)** | **Runtime (Target)** |
| -------------- | ------------------- | ------------------------- | -------------------------------- | --------------------- | -------------------- |
| **Strategy**   | **OpenCode**        | epf/strategy/\*.yaml      | emergent-strategy                | decisions.md          | Linear / Dashboard   |
| **Product**    | **OpenCode**        | epf/product/\*.yaml       | **OpenCode** (Build Step)        | main.go, Dockerfile   | Cloud (AWS)          |
| **Org/Ops**    | **OpenCode**        | epf/ops/\*.yaml           | emergent-strategy                | process.json          | ClickUp / ERP        |
| **Commercial** | **OpenCode**        | epf/growth/\*.yaml        | emergent-strategy                | campaign.csv          | HubSpot / CRM        |

_Note: For the **Product** track, OpenCode acts twice: first writing the spec (product.yaml), then writing the actual application code (main.go) based on that spec._

## **6\. The Tech Stack**

- **Host Language:** **Golang 1.22+**.
- **CLI Framework:** spf13/cobra.
- **TUI Framework:** charmbracelet/bubbletea.
- **Web Framework:** **HTMX** \+ **Templ**.
- **Connectivity:** **MCP**.
- **Database:** **Git Repository**.

## **7\. Operational Roadmap**

### **Phase 1: Environment Setup (Completed)**

- **Dependencies Installed:** Go 1.22+, Node.js 20+, Docker.
- **CLI Tools:** opencode and openspec installed globally via npm.
- **VS Code Extensions:**
  - **Go:** For language support/linting.
  - **YAML:** For schema validation of EPF files.
  - **GitHub Copilot:** For Vibe Coding.
  - **Markdown All in One:** For viewing artifacts.
- **Settings:** .vscode/settings.json configured for strict formatting and file associations.
- **Workspace:** EmergentStrategy.code-workspace created containing:
  - epf-cli/ (The Kernel)
  - emergent-strategy/ (The OS)
  - EPF_Canonical/ (Reference assets)

### **Phase 2: Build the Kernel (epf-cli) \<-- CURRENT FOCUS**

- **Objective:** Build the Schema/Validation Engine.
- **Action:** Run the "Linter Bootloader" prompt.

### **Phase 3: "Dogfooding"**

- **Objective:** Use OpenCode to write the roadmap for Emergent Strategy.
- **Action:** OpenCode writes epf/product.yaml for the Emergent Strategy tool itself.

### **Phase 4: Build the OS (emergent-strategy)**

- **Objective:** Build the TUI.

### **Phase 4.5: The Quality Gate**

- **Objective:** Implement the Mixture of Experts review loop.

### **Phase 5: Connect the Intelligence (Input)**

- **Objective:** Integrate emergent.core via MCP.

### **Phase 6: Connect the Runtimes (Output)**

- **Objective:** Build Adapters (ClickUp, HubSpot).

### **Phase 7: The Web Edition**

- **Objective:** Online Dashboard.

## **8\. Development Guidelines**

1. **Git is God:** Do not hide state in a database.
2. **Schema First:** Copilot cannot help you if it doesn't know the rules.
3. **Agent as Writer, Tool as Linter:** epf-cli never writes content. OpenCode writes content.
4. **Blueprint First:** Always use the "Golden Repo" (Go+HTMX) blueprint.
