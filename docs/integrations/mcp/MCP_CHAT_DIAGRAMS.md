# MCP Chat Integration - Visual Diagrams

This document provides visual diagrams to help understand the MCP chat integration architecture.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                              User                                    │
│                         (Web Browser)                                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ HTTP/SSE
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                         Frontend (React)                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Chat UI Component                                            │  │
│  │  - Message input/display                                      │  │
│  │  - MCP tool indicator: "Querying schema version..."          │  │
│  │  - Loading spinner                                            │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│                           │                                          │
│  ┌────────────────────────┴─────────────────────────────────────┐  │
│  │  useChat Hook                                                 │  │
│  │  - SSE stream parsing                                         │  │
│  │  - mcpToolActive state                                        │  │
│  │  - Event handlers (token, mcp_tool, done, error)            │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             │ POST /api/chat/stream
                             │ Response: text/event-stream
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                      Backend (NestJS API)                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Chat Controller                                              │  │
│  │  POST /chat/stream                                            │  │
│  │  - Receive user message                                       │  │
│  │  - Detect schema query (McpToolDetectorService)              │  │
│  │  - Call MCP tool (McpClientService)                          │  │
│  │  - Emit SSE events                                            │  │
│  │  - Stream LLM response                                        │  │
│  └────────┬──────────────────────────┬──────────────────────────┘  │
│           │                          │                               │
│  ┌────────┴────────────┐   ┌────────┴────────────────────────┐    │
│  │ MCP Tool Detector   │   │ MCP Client Service               │    │
│  │                     │   │                                   │    │
│  │ detect()            │   │ initialize()                      │    │
│  │ - Pattern match     │   │ callTool()                        │    │
│  │ - Extract args      │   │ - JSON-RPC over HTTP             │    │
│  │ - Return confidence │   │ - Error handling                  │    │
│  └─────────────────────┘   └────────┬──────────────────────────┘    │
└─────────────────────────────────────┼──────────────────────────────┘
                                      │
                                      │ POST /mcp/rpc
                                      │ JSON-RPC 2.0
                                      │
┌─────────────────────────────────────┴──────────────────────────────┐
│                      MCP Server (Internal)                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  JSON-RPC Handler                                             │  │
│  │  POST /mcp/rpc                                                │  │
│  │                                                                │  │
│  │  Tools:                                                        │  │
│  │  - schema_version: Get current version                       │  │
│  │  - schema_changelog: Get recent changes                      │  │
│  │  - type_info: Get type definitions                           │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             │ SQL Queries
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                        PostgreSQL Database                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  kb.schema_versions     - Version history                    │  │
│  │  kb.schema_changes      - Changelog entries                  │  │
│  │  kb.type_registry       - Type definitions                   │  │
│  │  kb.property_registry   - Property details                   │  │
│  │  kb.relationship_registry - Relationship metadata            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Request Flow: Schema Version Query

```
┌──────┐                                                              
│ User │  "What is the current schema version?"                       
└───┬──┘                                                              
    │                                                                  
    │ 1. Type message                                                 
    │                                                                  
    ↓                                                                  
┌───────────┐                                                         
│ Frontend  │  POST /api/chat/stream { message: "..." }              
│ (React)   │                                                         
└─────┬─────┘                                                         
      │                                                                
      │ 2. HTTP POST                                                  
      │                                                                
      ↓                                                                
┌──────────────┐                                                      
│ Chat         │  Receive message                                     
│ Controller   │                                                      
└──────┬───────┘                                                      
       │                                                               
       │ 3. Call detect()                                             
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ Tool         │  Pattern matching                                    
│ Detector     │  → shouldUseMcp: true                                
└──────┬───────┘  → suggestedTool: "schema_version"                  
       │          → confidence: 0.95                                  
       │                                                               
       │ 4. Return detection result                                   
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ Chat         │  Emit SSE: {type:"mcp_tool",status:"started"}       
│ Controller   │                                                      
└──────┬───────┘                                                      
       │                                                               
       │ 5. Call MCP client                                           
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ MCP Client   │  callTool("schema_version")                         
└──────┬───────┘                                                      
       │                                                               
       │ 6. JSON-RPC request                                          
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ MCP Server   │  Execute tool                                        
└──────┬───────┘                                                      
       │                                                               
       │ 7. Query database                                            
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ PostgreSQL   │  SELECT version FROM kb.schema_versions              
└──────┬───────┘  ORDER BY effective_date DESC LIMIT 1               
       │                                                               
       │ 8. Return: {version:"1.2.3", effective_date:"2025-10-15"}   
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ MCP Server   │  Format JSON-RPC response                            
└──────┬───────┘                                                      
       │                                                               
       │ 9. Return result                                             
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ MCP Client   │  Parse response, extract text                        
└──────┬───────┘  → "Schema version: 1.2.3"                          
       │                                                               
       │ 10. Return context                                           
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ Chat         │  Emit SSE: {type:"mcp_tool",status:"completed"}     
│ Controller   │                                                      
└──────┬───────┘                                                      
       │                                                               
       │ 11. Build prompt with context                                
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ Chat         │  System: "...Use this schema info: version 1.2.3..."
│ Generation   │  User: "What is the current schema version?"        
└──────┬───────┘                                                      
       │                                                               
       │ 12. Call LLM (Vertex AI)                                    
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ Vertex AI    │  Generate response token by token                    
│ (Gemini)     │                                                      
└──────┬───────┘                                                      
       │                                                               
       │ 13. Stream tokens                                            
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ Chat         │  Emit SSE: {type:"token", token:"The"}              
│ Controller   │  Emit SSE: {type:"token", token:" current"}         
└──────┬───────┘  Emit SSE: {type:"token", token:" schema"}         
       │          ... (continue streaming)                            
       │          Emit SSE: {type:"done"}                             
       │                                                               
       │ 14. Complete SSE stream                                      
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ Frontend     │  Parse SSE events                                    
│ (React)      │  - Show indicator on "started"                       
└──────┬───────┘  - Hide indicator on "completed"                    
       │          - Display streaming tokens                          
       │                                                               
       │ 15. Update UI                                                
       │                                                               
       ↓                                                               
┌──────────────┐                                                      
│ User         │  Sees: "The current schema version is 1.2.3,        
│              │  effective since October 15, 2025..."                
└──────────────┘                                                      
```

**Total Time**: ~2-3 seconds
- MCP detection: ~5ms
- MCP tool call: ~100ms
- LLM response: ~2-3s (primary latency)

---

## SSE Event Timeline

```
Time (ms)    Event                                    Frontend State
----------   ---------------------------------------  ------------------
0            User submits message                     streaming: false
             POST /api/chat/stream                    mcpToolActive: null

5            Backend detects schema query             streaming: false
             McpToolDetector.detect() returns         mcpToolActive: null
             { shouldUseMcp: true, ... }

10           SSE: {type:"mcp_tool",                   streaming: true
                   tool:"schema_version",             mcpToolActive: 
                   status:"started"}                    {tool:"schema_version",
                                                        status:"running"}

15           MCP client calls tool                    [Indicator visible]
             POST /mcp/rpc                            "Querying schema 
                                                       version..."

115          MCP tool completes (~100ms)              [Still visible]
             Result: {version:"1.2.3",...}

120          SSE: {type:"mcp_tool",                   streaming: true
                   status:"completed"}                mcpToolActive: null
                                                       [Indicator hidden]

125          Build prompt with context                streaming: true
             "Use this schema info: ..."

150          Call Vertex AI LLM                       streaming: true

200          First LLM token received                 streaming: true

205          SSE: {type:"token",token:"The"}          [Display token]

210          SSE: {type:"token",token:" current"}     [Append token]

215          SSE: {type:"token",token:" schema"}      [Append token]

...          ... (continue streaming) ...             ...

2500         Last token received                      streaming: true

2505         SSE: {type:"done",                       streaming: false
                   conversationId:"..."}              mcpToolActive: null

2510         Frontend updates conversation            [Complete message
             history and UI                            visible]
```

**Key Observations**:
- MCP overhead: ~115ms (5% of total time)
- User sees indicator for ~110ms
- LLM streaming is primary latency
- Graceful state transitions

---

## Error Handling Flow

```
┌──────────────┐
│ Chat         │  Call MCP client
│ Controller   │
└──────┬───────┘
       │
       │ try {
       │   await mcpClient.callTool(...)
       │ }
       │
       ↓
┌──────────────┐
│ MCP Client   │  HTTP POST /mcp/rpc
└──────┬───────┘
       │
       ↓
┌──────────────────────────────────────────┐
│ Error Scenarios                           │
│                                           │
│ 1. Connection Failed                      │
│    → catch (error)                        │
│    → Log: "MCP server unavailable"       │
│    → Emit SSE: {type:"mcp_tool",         │
│                 status:"error"}           │
│    → Continue to LLM (no context)        │
│                                           │
│ 2. Timeout (30 seconds)                  │
│    → Promise.race([fetch, timeout])      │
│    → Log: "MCP tool timeout"             │
│    → Emit SSE: {type:"mcp_tool",         │
│                 status:"error"}           │
│    → Continue to LLM (no context)        │
│                                           │
│ 3. Invalid JSON Response                 │
│    → JSON.parse() throws                 │
│    → Log: "Failed to parse MCP result"   │
│    → Emit SSE: {type:"mcp_tool",         │
│                 status:"error"}           │
│    → Continue to LLM (no context)        │
│                                           │
│ 4. Tool Execution Error                  │
│    → JSON-RPC error response             │
│    → Log: "MCP tool error: {message}"    │
│    → Emit SSE: {type:"mcp_tool",         │
│                 status:"error"}           │
│    → Continue to LLM (no context)        │
└───────────────┬───────────────────────────┘
                │
                │ All paths lead to:
                │
                ↓
┌──────────────────────────────────────────┐
│ Graceful Degradation                      │
│                                           │
│ - User always gets a response            │
│ - No 500 errors                          │
│ - Error logged for debugging             │
│ - LLM responds without schema context    │
│ - Chat UX remains smooth                 │
└──────────────────────────────────────────┘
```

**Key Principle**: **Never fail the user request**

---

## Component Dependencies

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Chat Module (NestJS)                         │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ChatController                                               │  │
│  │  - POST /chat/stream                                          │  │
│  │  - Orchestrates chat flow                                     │  │
│  └─────┬────────────────────────────┬───────────────────────────┘  │
│        │                            │                               │
│        │ inject                     │ inject                        │
│        ↓                            ↓                               │
│  ┌─────────────────┐         ┌───────────────────┐                │
│  │ Chat            │         │ Chat Generation   │                │
│  │ Service         │         │ Service           │                │
│  │                 │         │                   │                │
│  │ - Conversation  │         │ - buildPrompt()   │                │
│  │   management    │         │ - Format context  │                │
│  │ - History       │         │ - Intent prompts  │                │
│  └─────────────────┘         └───────────────────┘                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                            │
         │ inject                     │ inject
         ↓                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          MCP Module (NestJS)                         │
│                                                                       │
│  ┌──────────────────┐         ┌─────────────────────────────────┐  │
│  │ MCP Tool         │         │ MCP Client Service              │  │
│  │ Detector Service │         │                                 │  │
│  │                  │         │ - initialize()                  │  │
│  │ - detect()       │         │ - callTool()                    │  │
│  │ - Pattern match  │         │ - JSON-RPC protocol             │  │
│  │ - Confidence     │         │ - Error handling                │  │
│  └──────────────────┘         └────────┬────────────────────────┘  │
│                                         │                            │
│                                         │ HTTP                       │
│                                         ↓                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ MCP Server                                                    │  │
│  │                                                                │  │
│  │ - POST /mcp/rpc                                               │  │
│  │ - JSON-RPC handler                                            │  │
│  │ - Tool implementations                                        │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             │ SQL
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        Database (PostgreSQL)                         │
│                                                                       │
│  kb.schema_versions, kb.schema_changes, kb.type_registry, ...      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Frontend State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Chat UI State Machine                             │
└─────────────────────────────────────────────────────────────────────┘

Initial State:
┌──────────────┐
│ streaming:   │
│   false      │  User not currently chatting
│ mcpToolActive│
│   null       │  No MCP tool running
└──────┬───────┘
       │
       │ User sends message
       │
       ↓
┌──────────────┐
│ streaming:   │
│   true       │  Chat request in progress
│ mcpToolActive│
│   null       │  Waiting for detection
└──────┬───────┘
       │
       │ SSE: {type:"mcp_tool", status:"started"}
       │
       ↓
┌──────────────┐
│ streaming:   │
│   true       │  Chat + MCP tool active
│ mcpToolActive│
│   {tool,     │  [Indicator visible]
│    status}   │  "Querying schema version..."
└──────┬───────┘
       │
       │ SSE: {type:"mcp_tool", status:"completed"}
       │
       ↓
┌──────────────┐
│ streaming:   │
│   true       │  MCP done, LLM streaming
│ mcpToolActive│
│   null       │  [Indicator hidden]
└──────┬───────┘
       │
       │ SSE: {type:"token", token:"..."}
       │ (repeat many times)
       │
       ↓
┌──────────────┐
│ streaming:   │
│   true       │  Still streaming tokens
│ mcpToolActive│
│   null       │  [Displaying message]
└──────┬───────┘
       │
       │ SSE: {type:"done"}
       │
       ↓
┌──────────────┐
│ streaming:   │
│   false      │  Chat complete
│ mcpToolActive│
│   null       │  Ready for next message
└──────────────┘

Error Paths:
- SSE: {type:"mcp_tool", status:"error"} → mcpToolActive: null
- SSE: {type:"error"} → streaming: false
- Connection lost → streaming: false, retry or error message
```

---

## Deployment Architecture (Production)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                              │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Ingress (HTTPS)                                              │  │
│  │  - TLS termination                                            │  │
│  │  - Load balancing                                             │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│                           │                                          │
│                           ↓                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Admin Frontend (Nginx)                                       │  │
│  │  - Static files                                               │  │
│  │  - Port 80                                                    │  │
│  │  - Replicas: 2+                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           │                                          │
│                           │ /api/* → API Service                    │
│                           ↓                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  API Service (NestJS)                                         │  │
│  │  - ClusterIP                                                  │  │
│  │  - Port 3001                                                  │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│                           │                                          │
│                           ↓                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  API Pods                                                     │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │  │
│  │  │ Pod 1   │  │ Pod 2   │  │ Pod 3   │                      │  │
│  │  │ NestJS  │  │ NestJS  │  │ NestJS  │                      │  │
│  │  │ + MCP   │  │ + MCP   │  │ + MCP   │                      │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘                      │  │
│  └───────┼────────────┼────────────┼─────────────────────────────┘  │
│          │            │            │                                │
│          └────────────┴────────────┘                                │
│                      │                                              │
│                      │ Internal network                             │
│                      ↓                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Service                                           │  │
│  │  - ClusterIP (internal)                                       │  │
│  │  - Port 5432                                                  │  │
│  │  - Persistent Volume                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

External Services:
┌──────────────────────────────────────────────────────────────────────┐
│  Google Cloud Platform                                               │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Vertex AI                                                      │ │
│  │  - LLM API (Gemini)                                            │ │
│  │  - HTTPS/REST                                                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

Notes:
- MCP server is embedded in API pods (not separate deployment)
- All MCP communication is internal (ClusterIP services)
- No external access to MCP endpoints
- Database has read replica for MCP queries (recommended)
- Horizontal pod autoscaling based on CPU/memory
```

---

## Monitoring Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│                  MCP Chat Monitoring Dashboard                       │
└─────────────────────────────────────────────────────────────────────┘

┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ MCP Tool Call Rate │  │ Detection Accuracy │  │ Error Rate         │
│                    │  │                    │  │                    │
│  ▂▃▅▇█▇▅▃▂▁       │  │  95.3%             │  │  0.2%              │
│  157 calls/min     │  │  ↑ 2.1% vs last hr │  │  ↓ 0.1% vs last hr│
└────────────────────┘  └────────────────────┘  └────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ Tool Execution Latency (p50, p95, p99)                             │
│                                                                     │
│ schema_version    ████████░░░░░░░░░░  52ms / 98ms / 120ms         │
│ schema_changelog  ██████████████░░░░  124ms / 201ms / 315ms       │
│ type_info         ██████████░░░░░░░░  87ms / 142ms / 198ms        │
└────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────┐  ┌──────────────────────────────┐
│ Tool Usage Distribution          │  │ Recent Errors                │
│                                  │  │                              │
│ schema_version     45% ████████  │  │ 10:23 - Connection timeout  │
│ schema_changelog   32% ██████    │  │ 10:15 - Invalid tool name   │
│ type_info          23% ████      │  │ 10:08 - Parse error         │
└─────────────────────────────────┘  └──────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ End-to-End Chat Latency (with MCP)                                 │
│                                                                     │
│ Detection:    ▁ 5ms                                                │
│ MCP Call:     ██ 102ms                                             │
│ LLM Response: ████████████████████████████████████████ 2847ms     │
│               └────────────────────────────────────────┘           │
│               Total: 2954ms                                        │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ Database Query Performance (kb.* tables)                            │
│                                                                     │
│ schema_versions query     ▂▃▅▃▂  Avg: 12ms                        │
│ schema_changes query      ▃▅▇▅▃  Avg: 45ms                        │
│ type_registry query       ▂▃▄▃▂  Avg: 23ms                        │
└────────────────────────────────────────────────────────────────────┘
```

---

## Summary

These diagrams provide visual representations of:

1. **System Architecture**: Overall component structure
2. **Request Flow**: Step-by-step execution path
3. **SSE Timeline**: Event sequence with timing
4. **Error Handling**: Graceful degradation paths
5. **Component Dependencies**: Module relationships
6. **State Machine**: Frontend state transitions
7. **Deployment**: Production Kubernetes architecture
8. **Monitoring**: Dashboard layout and metrics

For detailed explanations, see:
- [MCP_CHAT_ARCHITECTURE.md](./MCP_CHAT_ARCHITECTURE.md)
- [MCP_CHAT_USER_GUIDE.md](./MCP_CHAT_USER_GUIDE.md)
- [MCP_CHAT_CONFIGURATION.md](./MCP_CHAT_CONFIGURATION.md)

---

## Next Steps for Manual Testing

### Pre-Testing Checklist

Before starting manual tests, ensure:

```bash
# 1. Check services are running
npm run workspace:status

# 2. Verify MCP is enabled (should see CHAT_ENABLE_MCP=1)
grep CHAT_ENABLE_MCP apps/server/.env

# 3. Check logs for any startup errors
npm run workspace:logs -- --follow
```

**Expected Output:**
- ✅ API service: Running (port 3001)
- ✅ Admin service: Running (port 5175)
- ✅ Database: Healthy
- ✅ MCP integration: Initialized successfully

---

### Test Scenario 1: Schema Version Query

**Objective:** Verify automatic detection and real-time database query

**Steps:**
1. Open chat: http://localhost:5175/admin/apps/chat/c/new
2. Type: **"What is the current schema version?"**
3. Press Send

**Expected Behavior:**
- ✅ Blue info badge appears: "Querying schema version..."
- ✅ Badge shows for ~100-200ms (brief flash)
- ✅ Badge disappears when LLM starts responding
- ✅ Response includes specific version number (e.g., "1.2.3")
- ✅ Response includes effective date

**What to Check:**
- [ ] Indicator appears before response
- [ ] Indicator text is readable ("schema version" not "schema_version")
- [ ] Badge styling matches daisyUI info color
- [ ] Spinner animation is visible
- [ ] Response contains actual database data
- [ ] No errors in browser console
- [ ] No errors in server logs

**Debug Commands:**
```bash
# Check server logs for MCP activity
npm run workspace:logs -- --follow | grep -i "mcp"

# Verify database has schema version data
# (Use Postgres MCP tool or query directly)
```

---

### Test Scenario 2: Schema Changelog Query

**Objective:** Verify multi-result queries and date filtering

**Steps:**
1. In same chat conversation
2. Type: **"What schema changes happened in the last 7 days?"**
3. Press Send

**Expected Behavior:**
- ✅ Badge appears: "Querying schema changelog..."
- ✅ Response lists multiple changes (if any exist)
- ✅ Each change includes: date, change type, description
- ✅ Changes are sorted by date (most recent first)

**Variations to Test:**
- "What changed recently?" (no date specified)
- "Show me schema changes from last month"
- "What was modified in version 1.2.0?"

**What to Check:**
- [ ] Detection works for variations
- [ ] Date filtering works correctly
- [ ] Multiple results formatted well
- [ ] Empty results handled gracefully ("No changes found...")

---

### Test Scenario 3: Type Information Query

**Objective:** Verify complex type metadata retrieval

**Steps:**
1. In same chat conversation
2. Type: **"Tell me about the Document type"**
3. Press Send

**Expected Behavior:**
- ✅ Badge appears: "Querying type info..."
- ✅ Response includes:
  - Type description
  - Key properties (name, data type)
  - Relationships to other types
  - Example usage or context

**Variations to Test:**
- "What properties does Project have?"
- "How does Chunk relate to Document?"
- "Describe the User type structure"

**What to Check:**
- [ ] Type name detection works (capitalized, lowercase, plural)
- [ ] Response includes technical details (properties, types)
- [ ] Relationships explained clearly
- [ ] Unknown types handled gracefully

---

### Test Scenario 4: Non-Schema Query (Control)

**Objective:** Verify system works normally without MCP

**Steps:**
1. In same chat conversation
2. Type: **"How do I upload a document?"**
3. Press Send

**Expected Behavior:**
- ❌ NO badge appears
- ✅ Response streams normally
- ✅ LLM answers based on general knowledge/context
- ✅ No MCP-related errors

**What to Check:**
- [ ] No indicator for non-schema queries
- [ ] Chat continues to work normally
- [ ] Response quality remains good
- [ ] No console/server errors

---

### Test Scenario 5: Mixed Conversation

**Objective:** Verify MCP and non-MCP queries work together

**Test Conversation:**
1. "What is the current schema version?" → **MCP badge expected**
2. "How do I use it?" → **NO badge expected**
3. "What types are available?" → **MCP badge expected**
4. "Can you explain that more?" → **NO badge expected**

**What to Check:**
- [ ] Detection toggles correctly per message
- [ ] Conversation history maintained
- [ ] Context from MCP responses used in follow-ups
- [ ] State transitions smooth (no UI glitches)

---

### Test Scenario 6: Error Handling - MCP Server Down

**Objective:** Verify graceful degradation when MCP unavailable

**Steps:**
1. Stop MCP server (it's embedded in API, so stop API temporarily):
   ```bash
   npm run workspace:stop
   ```
2. Start only admin:
   ```bash
   # In terminal 1: Start just frontend
   cd apps/admin && npm run dev
   ```
3. Try schema query: "What is the current schema version?"

**Expected Behavior:**
- ✅ Badge appears briefly: "Querying schema version..."
- ✅ Badge disappears after ~30 seconds (timeout)
- ✅ LLM still responds (without specific schema data)
- ✅ No error shown to user
- ✅ Error logged in browser console (network error)

**Recovery Test:**
```bash
# Restart services
npm run workspace:start

# Verify chat works again
# Retry: "What is the current schema version?"
# Should show badge + real data
```

**What to Check:**
- [ ] User experience remains smooth
- [ ] No 500 errors or crashes
- [ ] Timeout is reasonable (~30s)
- [ ] Recovery works after restart
- [ ] Error logged for debugging

---

### Test Scenario 7: Rapid Fire Queries

**Objective:** Verify system handles multiple quick requests

**Steps:**
1. Send 5 messages rapidly (don't wait for responses):
   - "What is the schema version?"
   - "What changed?"
   - "Tell me about Document"
   - "What about Chunk?"
   - "Show recent changes"

**Expected Behavior:**
- ✅ Each message gets own badge indicator
- ✅ Badges appear/disappear independently
- ✅ All responses complete successfully
- ✅ No race conditions or state corruption
- ✅ Responses arrive in order

**What to Check:**
- [ ] No UI glitches or stuck badges
- [ ] All requests complete
- [ ] Server handles concurrent MCP calls
- [ ] No memory leaks (check DevTools memory)

---

### Test Scenario 8: Edge Cases

**A. Very Long Type Name:**
- Query: "Tell me about DocumentExtractionProcessingQueueItem"
- Check: Badge text doesn't overflow, truncates if needed

**B. Special Characters:**
- Query: "What's the schema version?" (apostrophe)
- Check: Detection still works

**C. Lowercase:**
- Query: "what is the current schema version?"
- Check: Detection is case-insensitive

**D. Multiple Intents:**
- Query: "What is the schema version and what changed recently?"
- Check: Detector picks primary intent (version or changes)

**E. Empty/Invalid Type:**
- Query: "Tell me about NonExistentType"
- Check: MCP returns gracefully, LLM says "type not found"

---

### Browser Testing Matrix

Test in multiple browsers (if possible):

| Browser | Schema Query | Changelog | Type Info | Non-Schema | Notes |
|---------|--------------|-----------|-----------|------------|-------|
| Chrome  | ⬜           | ⬜        | ⬜        | ⬜         |       |
| Firefox | ⬜           | ⬜        | ⬜        | ⬜         |       |
| Safari  | ⬜           | ⬜        | ⬜        | ⬜         |       |
| Edge    | ⬜           | ⬜        | ⬜        | ⬜         |       |

**Focus Areas:**
- SSE stream handling
- CSS badge styling
- Animation smoothness
- Console errors

---

### Performance Testing

**Quick Load Test:**
```bash
# Send 10 concurrent schema queries
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/chat/stream \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d '{"message":"What is the schema version?","conversationId":"test-'$i'"}' &
done

# Wait and check
wait
npm run workspace:logs | grep -i "mcp" | tail -20
```

**What to Check:**
- [ ] All requests complete successfully
- [ ] No connection pool exhaustion
- [ ] Response times remain reasonable (<5s)
- [ ] No memory leaks (check `docker stats`)

---

### Monitoring Validation

**Check Logs for Key Events:**
```bash
# Schema version query
npm run workspace:logs | grep "schema_version"

# Tool detection
npm run workspace:logs | grep "MCP tool detected"

# Errors (should be zero)
npm run workspace:logs | grep -i "error" | grep -i "mcp"
```

**Expected Log Sequence:**
```
[ChatController] Received message: "What is the schema version?"
[McpToolDetector] Pattern matched: schema_version (confidence: 0.95)
[McpClient] Calling tool: schema_version
[McpServer] Executing tool: schema_version
[McpServer] Tool result: {version: "1.2.3", ...}
[ChatController] MCP tool completed successfully
[ChatGeneration] Building prompt with MCP context
```

---

### Issue Reporting Template

If you find bugs during testing, use this template:

```markdown
### Issue: [Brief Description]

**Test Scenario:** [e.g., Test Scenario 1: Schema Version Query]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
-

**Actual Behavior:**
-

**Screenshots:**
[Attach if UI issue]

**Browser/Environment:**
- Browser: [Chrome 120]
- OS: [macOS 14.1]
- Frontend: [localhost:5175]
- API: [localhost:3001]

**Console Errors:**
```
[Paste any console errors]
```

**Server Logs:**
```
[Paste relevant server logs]
```

**Severity:** [Critical / High / Medium / Low]
```

---

### Success Criteria

Before marking testing complete, verify:

- ✅ All 8 test scenarios pass
- ✅ No console errors during normal usage
- ✅ No server crashes or exceptions
- ✅ Badge appears/disappears correctly
- ✅ Graceful degradation works (MCP fails → chat continues)
- ✅ Performance acceptable (<3s avg response time)
- ✅ Browser compatibility (at least Chrome + Firefox)
- ✅ Mixed conversations work smoothly
- ✅ Edge cases handled gracefully

---

### Quick Start Testing Commands

```bash
# 1. Start everything
npm run workspace:start

# 2. Open admin in browser
open http://localhost:5175/admin/apps/chat/c/new

# 3. Monitor logs in terminal
npm run workspace:logs -- --follow | grep -E "(MCP|chat)"

# 4. Test queries (copy-paste these):
# - "What is the current schema version?"
# - "What changed in the last week?"
# - "Tell me about the Document type"
# - "How do I upload files?" (control - no MCP)

# 5. Check for errors
npm run workspace:logs | grep -i error | tail -20
```

---

### Post-Testing

After testing, document your findings:

1. **Create issue tickets** for any bugs found
2. **Update USER_GUIDE.md** if examples need refinement
3. **Note performance metrics** (response times, badge duration)
4. **Capture screenshots** of successful badge indicator
5. **Record any edge cases** not covered by tests

Good luck with testing! 🚀
