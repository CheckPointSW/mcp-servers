# CloudGuard WAF MCP - Usage Guide

## Executive Summary

This usage guide demonstrates how the CloudGuard WAF MCP server transforms complex WAF security operations into conversational interactions. With examples across 10 user personas, this guide shows how AI assistants can manage Check Point WAF through simple English commands.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_objects` | Unified retrieval of WAF objects: assets, practices, profiles, agents, zones, behaviors, triggers |
| `manage_objects` | Unified CRUD operations for WAF objects |
| `call_waf_api` | Execute raw GraphQL queries/mutations against CloudGuard WAF API |
| `get_enforcement_status` | Get session status, publish state, pending changes count |
| `publish_and_enforce` | Publish and enforce pending configuration changes (CRITICAL) |
| `waf_consultant` | Best-practice recommendations based on official documentation |

---

## User Personas & Daily Workflows

### 🔒 Security Analyst
**Primary Responsibilities**: Asset protection analysis, practice tuning, configuration review
**Business Impact**: 80% faster configuration analysis, reduced manual GraphQL queries

#### Daily Workflow Examples (12)

**1. Morning Asset Inventory Check**
```
Natural Language: "Show me all our WAF-protected assets with their names, types, and status so I can verify our complete asset inventory."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Complete visibility into all protected assets for morning review
```

**2. Review Security Practices Configuration**
```
Natural Language: "List all our security practices so I can check which protection types are configured and their current status."

Expected Tool: get_objects

Parameters: { "object_type": "practices" }

Business Outcome: Full view of security practice configurations for audit
```

**3. Check Deployment Profiles**
```
Natural Language: "I need to see all our deployment profiles to verify which gateway types are configured across our infrastructure."

Expected Tool: get_objects

Parameters: { "object_type": "profiles" }

Business Outcome: Infrastructure profile overview for security architecture review
```

**4. Investigate Agent Health**
```
Natural Language: "Show me the status of all our WAF agents so I can identify any that are offline or reporting issues."

Expected Tool: get_objects

Parameters: { "object_type": "agents" }

Business Outcome: Agent health visibility for operational monitoring
```

**5. Audit Zone Configurations**
```
Natural Language: "List all security zones with their configuration details so I can verify our network segmentation."

Expected Tool: get_objects

Parameters: { "object_type": "zones" }

Business Outcome: Zone security audit for compliance verification
```

**6. Review Exception Behaviors**
```
Natural Language: "Show me all configured behaviors including trusted sources and exceptions to check for overly permissive rules."

Expected Tool: get_objects

Parameters: { "object_type": "behaviors" }

Business Outcome: Behavior review to identify overly permissive security exceptions
```

**7. Examine Trigger Configurations**
```
Natural Language: "List all our logging and reporting triggers so I can verify we have proper alerting in place for security events."

Expected Tool: get_objects

Parameters: { "object_type": "triggers" }

Business Outcome: Alerting configuration audit for incident detection readiness
```

**8. Deep Dive Asset Details via GraphQL**
```
Natural Language: "I need to run a custom query to get detailed asset information including URLs and practice associations. Execute this GraphQL query: { getAssets { status assets { id name assetType URLs { URLs } practices { id } } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { status assets { id name assetType URLs { URLs } practices { id } } } }" }

Business Outcome: Detailed asset data for deep-dive security analysis
```

**9. Check Pending Changes Before Publishing**
```
Natural Language: "Before I publish any changes, show me the current session status and how many pending changes are waiting."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Pre-publish awareness of pending configuration changes
```

**10. Get Best Practice Recommendations**
```
Natural Language: "I have an asset without any security practices attached. What are the best practices for configuring WAF protection for a web application?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What are best practices for configuring WAF protection for a web application without practices?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}] }

Business Outcome: Expert guidance on WAF configuration best practices
```

**11. Create New Security Practice**
```
Natural Language: "Create a new WebApplication security practice named 'API-Protection-Standard' for our API assets."

Expected Tool: manage_objects

Parameters: { "object_type": "practices", "subtype": "WebApplication", "action": "create", "data": { "name": "API-Protection-Standard" } }

Business Outcome: New security practice created for API protection standardization
```

**12. Query Practice Details with Custom GraphQL**
```
Natural Language: "Run a GraphQL query to get all practices with their associated triggers and behaviors: { getPractices { id name practiceType triggers { id name } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getPractices { id name practiceType triggers { id name } } }" }

Business Outcome: Practice-trigger association mapping for security coverage analysis
```

### 🚀 DevOps Engineer
**Primary Responsibilities**: Asset deployment, infrastructure automation, profile management
**Business Impact**: 90% deployment time reduction, automated security configuration

#### Daily Workflow Examples (12)

**1. Deploy New Web Application Asset**
```
Natural Language: "Create a new WebApplication asset named 'payments-api-prod' with the URL https://payments.example.com for our production payments service."

Expected Tool: manage_objects

Parameters: { "object_type": "assets", "subtype": "WebApplication", "action": "create", "data": { "name": "payments-api-prod", "URLs": ["https://payments.example.com"] } }

Business Outcome: New production asset deployed with security protection
```

**2. Update Asset Configuration**
```
Natural Language: "Update our existing asset to add a new URL endpoint. The asset ID is abc-123 and we need to add https://api-v2.example.com."

Expected Tool: manage_objects

Parameters: { "object_type": "assets", "subtype": "WebApplication", "action": "update", "id": "abc-123", "data": { "URLs": ["https://api-v2.example.com"] } }

Business Outcome: Asset URL updated for new API version deployment
```

**3. Create Kubernetes Deployment Profile**
```
Natural Language: "Set up a new Kubernetes deployment profile named 'k8s-prod-cluster' for our production Kubernetes environment."

Expected Tool: manage_objects

Parameters: { "object_type": "profiles", "subtype": "Kubernetes", "action": "create", "data": { "name": "k8s-prod-cluster" } }

Business Outcome: Kubernetes profile ready for container workload protection
```

**4. Create Docker Profile for Staging**
```
Natural Language: "Create a Docker deployment profile named 'docker-staging' for our staging container environment."

Expected Tool: manage_objects

Parameters: { "object_type": "profiles", "subtype": "Docker", "action": "create", "data": { "name": "docker-staging" } }

Business Outcome: Docker profile configured for staging environment protection
```

**5. Publish Infrastructure Changes**
```
Natural Language: "I've finished configuring all the assets and profiles. Please publish and enforce all pending changes now."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: All pending infrastructure changes deployed to production
```

**6. Check Deployment Status**
```
Natural Language: "What's the current enforcement status? I want to make sure my last deployment was published successfully."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Deployment verification and publish state confirmation
```

**7. List All Profiles for Infrastructure Planning**
```
Natural Language: "Show me all deployment profiles so I can plan which gateway types we need for our new microservices architecture."

Expected Tool: get_objects

Parameters: { "object_type": "profiles" }

Business Outcome: Infrastructure profile inventory for capacity planning
```

**8. Create Web API Asset**
```
Natural Language: "Deploy a new WebAPI asset named 'graphql-gateway' for our internal GraphQL service at https://graphql.internal.example.com."

Expected Tool: manage_objects

Parameters: { "object_type": "assets", "subtype": "WebAPI", "action": "create", "data": { "name": "graphql-gateway", "URLs": ["https://graphql.internal.example.com"] } }

Business Outcome: API gateway asset created with WAF protection
```

**9. Delete Decommissioned Asset**
```
Natural Language: "Remove the old legacy asset with ID legacy-asset-456 that has been decommissioned."

Expected Tool: manage_objects

Parameters: { "object_type": "assets", "subtype": "WebApplication", "action": "delete", "id": "legacy-asset-456" }

Business Outcome: Clean removal of decommissioned infrastructure from WAF
```

**10. Query Infrastructure via GraphQL**
```
Natural Language: "Execute a GraphQL query to get all agents with their status and platform details for our infrastructure inventory: { getAgents { id name agentType status platform } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAgents { id name agentType status platform } }" }

Business Outcome: Complete agent inventory for infrastructure management
```

**11. Create Zone for Network Segmentation**
```
Natural Language: "Create a new security zone named 'dmz-production' for our DMZ network segment."

Expected Tool: manage_objects

Parameters: { "object_type": "zones", "subtype": "Generic", "action": "create", "data": { "name": "dmz-production" } }

Business Outcome: Network zone created for proper security segmentation
```

**12. Create AppSec Gateway Profile**
```
Natural Language: "Create an AppSec Gateway profile named 'edge-gateway-prod' for our edge security deployment."

Expected Tool: manage_objects

Parameters: { "object_type": "profiles", "subtype": "AppSecGateway", "action": "create", "data": { "name": "edge-gateway-prod" } }

Business Outcome: Edge gateway profile ready for perimeter security deployment
```

### 🛡️ SOC Operator
**Primary Responsibilities**: Real-time monitoring, incident triage, threat response
**Business Impact**: Rapid incident awareness, faster threat identification

#### Daily Workflow Examples (12)

**1. Rapid Asset Status Check**
```
Natural Language: "Quickly show me all assets so I can identify which ones might be affected by the current incident."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Rapid asset identification during active incident response
```

**2. Check Enforcement State During Incident**
```
Natural Language: "During this incident, I need to know if there are any pending changes that haven't been enforced yet."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Identify unenforced changes that may be causing security gaps
```

**3. Review Active Protection Practices**
```
Natural Language: "Show me all active security practices to verify our protection posture during this threat event."

Expected Tool: get_objects

Parameters: { "object_type": "practices" }

Business Outcome: Protection posture verification during active threats
```

**4. Check Agent Connectivity**
```
Natural Language: "List all agents with their status - I need to confirm all WAF agents are online and protecting our infrastructure."

Expected Tool: get_objects

Parameters: { "object_type": "agents" }

Business Outcome: Agent health verification during incident response
```

**5. Emergency Publish Blocking Rule**
```
Natural Language: "I've added an emergency blocking rule. Publish and enforce immediately to stop the ongoing attack."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Immediate enforcement of emergency security rules
```

**6. Query Specific Asset Protection Details**
```
Natural Language: "Run a GraphQL query to get detailed information about our assets including their protection practices: { getAssets { status assets { id name practices { id name practiceType } } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { status assets { id name practices { id name practiceType } } } }" }

Business Outcome: Detailed protection mapping for incident scope assessment
```

**7. Review Trusted Sources During False Positive**
```
Natural Language: "Show me all behavior configurations including trusted sources and exceptions - we may have a false positive blocking legitimate traffic."

Expected Tool: get_objects

Parameters: { "object_type": "behaviors" }

Business Outcome: False positive identification through trusted source review
```

**8. Create Emergency Exception Behavior**
```
Natural Language: "Create an emergency exception behavior named 'emergency-bypass-partner-api' to allow blocked partner traffic through. Use asset owner ID owner-789."

Expected Tool: manage_objects

Parameters: { "object_type": "behaviors", "subtype": "Exception", "action": "create", "ownerId": "owner-789", "data": { "name": "emergency-bypass-partner-api" } }

Business Outcome: Emergency traffic restoration for blocked legitimate partner
```

**9. Get WAF Consultant Advice on Incident**
```
Natural Language: "We're seeing unusual traffic patterns. What does the WAF documentation say about configuring rate limiting to handle traffic spikes?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "How should I configure rate limiting to handle unusual traffic spikes and potential DDoS?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}] }

Business Outcome: Expert guidance on rate limiting during traffic anomalies
```

**10. Check Zone Security During Lateral Movement**
```
Natural Language: "Show me all security zones - we suspect lateral movement and need to verify zone boundaries are intact."

Expected Tool: get_objects

Parameters: { "object_type": "zones" }

Business Outcome: Zone integrity verification during lateral movement investigation
```

**11. Query Trigger Configuration for Alert Gaps**
```
Natural Language: "List all triggers to check if our logging and alerting is properly configured - we may have missed alerts for this incident."

Expected Tool: get_objects

Parameters: { "object_type": "triggers" }

Business Outcome: Alert configuration review to identify monitoring gaps
```

**12. Create Emergency Log Trigger**
```
Natural Language: "Create a new log trigger named 'incident-2024-detailed-logging' to capture detailed logs for the current investigation."

Expected Tool: manage_objects

Parameters: { "object_type": "triggers", "subtype": "Log", "action": "create", "data": { "name": "incident-2024-detailed-logging" } }

Business Outcome: Enhanced logging for active incident forensic investigation
```

### 🏗️ Security Architect
**Primary Responsibilities**: Security strategy, architectural design, policy optimization
**Business Impact**: 70% faster architecture design, standardized security patterns

#### Daily Workflow Examples (12)

**1. Full Environment Architecture Review**
```
Natural Language: "Give me a complete picture of our WAF architecture - show me all assets, profiles, and zones so I can map our security topology."

Expected Tool: get_objects

Parameters: { "object_type": ["assets", "profiles", "zones"] }

Business Outcome: Complete architecture topology mapping for design review
```

**2. Evaluate Security Practice Coverage**
```
Natural Language: "Show me all practices and behaviors so I can evaluate whether our security policies have adequate coverage across all threat vectors."

Expected Tool: get_objects

Parameters: { "object_type": ["practices", "behaviors"] }

Business Outcome: Security coverage gap analysis for architecture improvement
```

**3. Design Consultation for New Architecture**
```
Natural Language: "I'm designing a zero-trust architecture for our microservices. What does CloudGuard WAF best practice documentation recommend for micro-segmentation?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What are CloudGuard WAF best practices for implementing zero-trust micro-segmentation with microservices?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}, {"name": "get_objects", "description": "Retrieve WAF objects"}] }

Business Outcome: Expert-guided zero-trust architecture design decisions
```

**4. Create Standardized Practice Template**
```
Natural Language: "Create a shared WebApplication practice named 'enterprise-standard-waf' that will be our baseline protection template for all web assets."

Expected Tool: manage_objects

Parameters: { "object_type": "practices", "subtype": "WebApplication", "action": "create", "data": { "name": "enterprise-standard-waf", "visibility": "Shared" } }

Business Outcome: Standardized security practice template for enterprise-wide use
```

**5. Create Rate Limiting Practice**
```
Natural Language: "Create a rate limiting practice named 'api-rate-limit-tier1' for our high-traffic API tier."

Expected Tool: manage_objects

Parameters: { "object_type": "practices", "subtype": "RateLimit", "action": "create", "data": { "name": "api-rate-limit-tier1" } }

Business Outcome: Rate limiting strategy implemented for API tier architecture
```

**6. Architecture Query via GraphQL**
```
Natural Language: "I need a comprehensive view of asset-to-profile-to-practice relationships. Execute: { getAssets { status assets { id name profiles { id name profileType } practices { id name practiceType } } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { status assets { id name profiles { id name profileType } practices { id name practiceType } } } }" }

Business Outcome: Asset-profile-practice relationship mapping for architecture documentation
```

**7. Review Trigger Architecture**
```
Natural Language: "Show me all configured triggers so I can evaluate our observability architecture and logging strategy."

Expected Tool: get_objects

Parameters: { "object_type": "triggers" }

Business Outcome: Observability architecture review and logging strategy assessment
```

**8. Enforcement Readiness Check**
```
Natural Language: "Check the enforcement status to see if our architecture changes are ready to be deployed."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Architecture change deployment readiness assessment
```

**9. Create Shared Trusted Source Behavior**
```
Natural Language: "Create a shared trusted source behavior named 'corporate-vpn-whitelist' with 3 source identifiers for our corporate VPN egress IPs."

Expected Tool: manage_objects

Parameters: { "object_type": "behaviors", "subtype": "TrustedSource", "action": "create", "data": { "name": "corporate-vpn-whitelist", "visibility": "Shared", "numOfSources": 3, "sourcesIdentifiers": ["SourceIP", "SourceIP", "SourceIP"] } }

Business Outcome: Reusable trusted source behavior for corporate network trust architecture
```

**10. Publish Architecture Changes**
```
Natural Language: "I've completed the architecture updates including new profiles, practices and zones. Please publish and enforce all changes."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Architecture changes deployed and enforced across infrastructure
```

**11. Create Caching Practice for Performance**
```
Natural Language: "Create a caching practice named 'cdn-edge-caching' for our CDN edge layer to optimize performance while maintaining security."

Expected Tool: manage_objects

Parameters: { "object_type": "practices", "subtype": "Caching", "action": "create", "data": { "name": "cdn-edge-caching" } }

Business Outcome: Performance-optimized caching strategy in security architecture
```

**12. Consult on Profile Architecture Decision**
```
Natural Language: "I'm choosing between AppSecGateway and Embedded profiles for our new deployment. What are the tradeoffs according to the documentation?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What are the tradeoffs between AppSecGateway and Embedded deployment profiles? When should each be used?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}] }

Business Outcome: Informed architecture decision on deployment profile selection
```

### ⚙️ Platform Engineer
**Primary Responsibilities**: Platform automation, Kubernetes/Docker integration, infrastructure scaling
**Business Impact**: 100% automated security deployment, infrastructure standardization

#### Daily Workflow Examples (12)

**1. Check All Platform Agents**
```
Natural Language: "List all agents across our platform to verify deployment health and identify any agents needing updates."

Expected Tool: get_objects

Parameters: { "object_type": "agents" }

Business Outcome: Platform-wide agent health monitoring for maintenance planning
```

**2. Deploy Kubernetes Profile**
```
Natural Language: "Create a Kubernetes profile named 'k8s-microservices-mesh' for our service mesh deployment."

Expected Tool: manage_objects

Parameters: { "object_type": "profiles", "subtype": "Kubernetes", "action": "create", "data": { "name": "k8s-microservices-mesh" } }

Business Outcome: Kubernetes profile deployed for service mesh security integration
```

**3. Deploy Embedded Profile for IoT**
```
Natural Language: "Create an Embedded profile named 'iot-edge-security' for our IoT edge devices."

Expected Tool: manage_objects

Parameters: { "object_type": "profiles", "subtype": "Embedded", "action": "create", "data": { "name": "iot-edge-security" } }

Business Outcome: Embedded security profile for IoT edge protection
```

**4. Platform Infrastructure Query**
```
Natural Language: "Execute a GraphQL query to get all profiles with their types and associated configurations: { getProfiles { id name profileType } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getProfiles { id name profileType } }" }

Business Outcome: Profile inventory for platform infrastructure automation
```

**5. Publish Platform Configuration**
```
Natural Language: "All platform profiles and configurations are set. Publish and enforce the changes to activate them."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Platform configuration deployed and active across infrastructure
```

**6. Verify Enforcement After Deployment**
```
Natural Language: "Verify the enforcement status after our platform deployment to confirm all changes are active."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Post-deployment verification of platform configuration enforcement
```

**7. Create WebAPI Asset for Microservice**
```
Natural Language: "Create a WebAPI asset named 'user-service-v2' at https://user-service.internal:8080 for our new microservice."

Expected Tool: manage_objects

Parameters: { "object_type": "assets", "subtype": "WebAPI", "action": "create", "data": { "name": "user-service-v2", "URLs": ["https://user-service.internal:8080"] } }

Business Outcome: Microservice asset registered with WAF protection
```

**8. Create Report Trigger for Platform Monitoring**
```
Natural Language: "Create a report trigger named 'platform-weekly-report' for our platform team's weekly security summary."

Expected Tool: manage_objects

Parameters: { "object_type": "triggers", "subtype": "Report", "action": "create", "data": { "name": "platform-weekly-report" } }

Business Outcome: Automated weekly security reporting for platform team
```

**9. Consult on Kubernetes Integration**
```
Natural Language: "What's the recommended way to integrate CloudGuard WAF with our Kubernetes ingress controllers? We use nginx-ingress."

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What is the recommended integration approach for CloudGuard WAF with Kubernetes nginx-ingress controllers?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}, {"name": "get_objects", "description": "Retrieve WAF objects"}] }

Business Outcome: Expert guidance on Kubernetes WAF integration patterns
```

**10. View All Assets for Platform Inventory**
```
Natural Language: "Show me all assets in our WAF configuration so I can reconcile with our service discovery."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Asset inventory reconciliation with platform service discovery
```

**11. Delete Old Docker Profile**
```
Natural Language: "Remove the old Docker profile with ID docker-old-789 that was replaced by our new Kubernetes deployment."

Expected Tool: manage_objects

Parameters: { "object_type": "profiles", "subtype": "Docker", "action": "delete", "id": "docker-old-789" }

Business Outcome: Clean removal of deprecated infrastructure profiles
```

**12. Create SD-WAN Profile**
```
Natural Language: "Create an SD-WAN profile named 'branch-office-sdwan' for our branch office network security."

Expected Tool: manage_objects

Parameters: { "object_type": "profiles", "subtype": "SdWan", "action": "create", "data": { "name": "branch-office-sdwan" } }

Business Outcome: SD-WAN profile deployed for branch office security coverage
```

### 👔 Security Manager
**Primary Responsibilities**: Team coordination, strategic planning, stakeholder reporting
**Business Impact**: 80% reporting efficiency, executive-ready security insights

#### Daily Workflow Examples (12)

**1. Executive Asset Inventory Summary**
```
Natural Language: "Get me a complete list of all our WAF-protected assets for the executive security briefing."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Executive-ready asset inventory for stakeholder briefing
```

**2. Security Practice Portfolio Review**
```
Natural Language: "Show me all security practices across our organization so I can report on our protection portfolio."

Expected Tool: get_objects

Parameters: { "object_type": "practices" }

Business Outcome: Protection portfolio overview for management reporting
```

**3. Deployment Status for Change Board**
```
Natural Language: "Check the enforcement status so I can report on pending changes at our change advisory board meeting."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Change management status for governance reporting
```

**4. Strategic Security Consultation**
```
Natural Language: "What does best practice recommend for a large enterprise migrating from traditional WAF to CloudGuard WAF? We have 200 assets to migrate."

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What is the recommended migration strategy for a large enterprise with 200 assets moving from traditional WAF to CloudGuard WAF?", "available_tools": [{"name": "get_objects", "description": "Retrieve WAF objects"}, {"name": "manage_objects", "description": "Create/update WAF objects"}] }

Business Outcome: Strategic migration plan guidance for enterprise WAF transformation
```

**5. Infrastructure Coverage Report**
```
Natural Language: "Show me all profiles and agents to assess our deployment coverage across different infrastructure types."

Expected Tool: get_objects

Parameters: { "object_type": ["profiles", "agents"] }

Business Outcome: Infrastructure coverage assessment for capacity planning report
```

**6. Compliance Zone Audit**
```
Natural Language: "List all security zones so I can verify compliance with our network segmentation requirements for the audit."

Expected Tool: get_objects

Parameters: { "object_type": "zones" }

Business Outcome: Zone compliance verification for regulatory audit preparation
```

**7. Approve and Publish Quarterly Updates**
```
Natural Language: "The quarterly security updates have been reviewed and approved. Please publish and enforce all pending changes."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Approved quarterly security updates deployed to production
```

**8. Custom Executive Report Query**
```
Natural Language: "Run a query to get a summary of assets by type with their protection status for my board presentation: { getAssets { status assets { id name assetType objectStatus } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { status assets { id name assetType objectStatus } } }" }

Business Outcome: Board-ready asset protection status summary
```

**9. Review Alerting Configuration**
```
Natural Language: "Show me all triggers to verify we have proper alerting and reporting configured for our SLA commitments."

Expected Tool: get_objects

Parameters: { "object_type": "triggers" }

Business Outcome: SLA alerting verification for service level compliance
```

**10. Budget Planning - View All Objects**
```
Natural Language: "I need a comprehensive view of behaviors and practices to estimate our security configuration complexity for budget planning."

Expected Tool: get_objects

Parameters: { "object_type": ["behaviors", "practices"] }

Business Outcome: Configuration complexity assessment for budget justification
```

**11. Consult on Team Workflow Best Practices**
```
Natural Language: "What's the recommended team workflow for managing WAF changes across development, staging, and production environments?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What is the recommended team workflow for managing WAF configuration changes across dev/staging/production environments?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}, {"name": "publish_and_enforce", "description": "Publish changes"}] }

Business Outcome: Team workflow standardization guidance for operational efficiency
```

**12. Quarterly Infrastructure Assessment Query**
```
Natural Language: "Execute a GraphQL query to get zone details with their associated configurations for our quarterly infrastructure assessment: { getZones { zones { id name objectStatus } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getZones { zones { id name objectStatus } } }" }

Business Outcome: Quarterly infrastructure assessment data for strategic planning
```

---

### 📋 Compliance Auditor
**Primary Responsibilities**: Regulatory compliance verification, audit evidence gathering, change management documentation
**Business Impact**: 90% faster audit preparation, automated compliance evidence collection

#### Daily Workflow Examples (12)

**1. SOC 2 Asset Evidence Report**
```
Natural Language: "Generate an evidence report showing all WAF assets and their protection status for our SOC 2 audit."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Complete asset inventory evidence for SOC 2 compliance documentation
```

**2. Compliance Gap Analysis**
```
Natural Language: "I need to verify that all our web applications have WAF protection enabled - list any unprotected assets for the compliance gap report."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Identification of protection gaps for compliance remediation
```

**3. Change Management Audit Trail**
```
Natural Language: "Document all security practices with their creation dates and last modification for our change management audit trail."

Expected Tool: call_waf_api

Parameters: { "query": "{ getPractices { id name practiceType objectStatus } }" }

Business Outcome: Practice modification history for change management audit evidence
```

**4. Deployment State Verification**
```
Natural Language: "Show me the current enforcement state - I need to confirm all approved changes from last week's CAB meeting are deployed."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Deployment verification evidence for change advisory board records
```

**5. PCI-DSS Configuration Guidance**
```
Natural Language: "What does the regulatory framework recommend for WAF configuration in PCI-DSS environments?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What are the recommended WAF configurations for PCI-DSS compliance? What protection modes and practices should be enabled?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}, {"name": "get_objects", "description": "Retrieve WAF objects"}] }

Business Outcome: Expert PCI-DSS compliance configuration guidance
```

**6. Create Compliance Tagging Behavior**
```
Natural Language: "Create a compliance-tag behavior named 'pci-scope-marker' to tag all assets in PCI scope."

Expected Tool: manage_objects

Parameters: { "object_type": "behaviors", "subtype": "CustomResponse", "action": "create", "data": { "name": "pci-scope-marker" } }

Business Outcome: Compliance scope tagging for automated audit identification
```

**7. Annual Security Architecture Review Query**
```
Natural Language: "Run a query to get all assets with their associated practices and zones for the annual security architecture review: { getAssets { assets { id name practices { id name } } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { assets { id name practices { id name } } } }" }

Business Outcome: Comprehensive asset-practice mapping for annual architecture audit
```

**8. Configuration Drift Detection**
```
Natural Language: "Verify that all pending configuration changes have been published - we can't have drift between approved and enforced state."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Configuration drift detection for compliance state verification
```

**9. Compliance Remediation Enforcement**
```
Natural Language: "After the compliance remediation, push all pending fixes to production immediately."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Compliance remediation changes deployed to close audit findings
```

**10. Exception Behavior Audit**
```
Natural Language: "Show me all behaviors tagged as exceptions - each one needs documented justification per our policy."

Expected Tool: get_objects

Parameters: { "object_type": "behaviors" }

Business Outcome: Exception behavior inventory for policy justification documentation
```

**11. Zone-to-Asset Cross-Reference Query**
```
Natural Language: "I need a cross-reference of zones to assets - which assets sit in which security zone for our network diagram?"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { assets { id name } } }" }

Business Outcome: Zone-asset relationship mapping for compliance network documentation
```

**12. Change Documentation Best Practices**
```
Natural Language: "What's the recommended approach for maintaining WAF configuration audit trails and change documentation?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What are best practices for maintaining WAF configuration audit trails, change documentation, and compliance evidence?", "available_tools": [{"name": "get_objects", "description": "Retrieve WAF objects"}, {"name": "call_waf_api", "description": "Execute GraphQL queries"}] }

Business Outcome: Process guidance for compliant change management documentation
```

### 🔧 Application Developer
**Primary Responsibilities**: Application onboarding, WAF troubleshooting, endpoint protection management
**Business Impact**: 60% faster app onboarding to WAF, self-service security configuration

#### Daily Workflow Examples (12)

**1. Onboard New Microservice**
```
Natural Language: "I just deployed a new microservice at api.example.com/v2/users - I need to add it to WAF protection."

Expected Tool: manage_objects

Parameters: { "object_type": "assets", "subtype": "WebAPI", "action": "create", "data": { "name": "users-service-v2", "URLs": ["api.example.com/v2/users"] } }

Business Outcome: New microservice onboarded to WAF protection in seconds
```

**2. Troubleshoot WAF Blocking**
```
Natural Language: "My API protected by WAF is getting 403 errors - can you check what security practices are blocking my requests?"

Expected Tool: get_objects

Parameters: { "object_type": "practices" }

Business Outcome: Quick identification of blocking rules for developer troubleshooting
```

**3. Whitelist CI/CD Pipeline**
```
Natural Language: "I want to whitelist my CI/CD pipeline IP 10.0.1.50 so our integration tests don't get blocked."

Expected Tool: manage_objects

Parameters: { "object_type": "behaviors", "subtype": "TrustedSource", "action": "create", "data": { "name": "cicd-pipeline-trust", "sourcesIdentifiers": ["SourceIP"], "numOfSources": 1 } }

Business Outcome: CI/CD pipeline unblocked for automated testing without security gaps
```

**4. Check App Protection Status**
```
Natural Language: "What protection does my app 'checkout-service' currently have? Show me everything attached to it."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Full visibility into application's current WAF protection configuration
```

**5. Rate Limit Guidance**
```
Natural Language: "My load test is about to start - is there a way to temporarily increase the rate limit threshold?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "How can I temporarily adjust rate limiting thresholds during a planned load test while maintaining security?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}] }

Business Outcome: Expert guidance on safe rate limit adjustments for testing
```

**6. Decommission Test Asset**
```
Natural Language: "Delete the test asset 'dev-sandbox-app' - we decommissioned that environment."

Expected Tool: manage_objects

Parameters: { "object_type": "assets", "action": "delete", "data": { "name": "dev-sandbox-app" } }

Business Outcome: Clean removal of decommissioned test environment from WAF
```

**7. Webhook Endpoint Guidance**
```
Natural Language: "I'm adding a new /webhooks endpoint to my app. Do I need to configure anything special in WAF for webhook traffic?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What WAF configuration is recommended for webhook endpoints that receive external callbacks? Are there special considerations for inbound webhook traffic?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}] }

Business Outcome: Proactive security guidance for webhook endpoint configuration
```

**8. Check Pending Changes Before Deploy**
```
Natural Language: "Show me if there are any pending WAF changes that might affect my deployment going out today."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Deployment conflict awareness before application release
```

**9. Verify URL Registration**
```
Natural Language: "Run this query to check if my app's URLs are correctly registered: { getAssets { assets { name URLs { URLs } } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { assets { name URLs { URLs } } } }" }

Business Outcome: URL registration verification for application WAF routing
```

**10. Add New Endpoint to Existing Asset**
```
Natural Language: "Can you update my 'user-service' asset to add the new endpoint /api/v3/auth?"

Expected Tool: manage_objects

Parameters: { "object_type": "assets", "action": "update", "data": { "name": "user-service" } }

Business Outcome: Asset endpoint expansion without full reconfiguration
```

**11. Find Kubernetes Agent**
```
Natural Language: "List all the WAF agents - I need to find which one is protecting my Kubernetes namespace."

Expected Tool: get_objects

Parameters: { "object_type": "agents" }

Business Outcome: Agent identification for Kubernetes namespace mapping
```

**12. Push Changes for Sprint Demo**
```
Natural Language: "Push the changes we just made to my app's WAF config - I need them live before the sprint demo."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Rapid configuration deployment for development velocity
```

### 🕵️ Threat Hunter
**Primary Responsibilities**: Attack surface mapping, threat investigation, IOC response, detection engineering
**Business Impact**: 85% faster threat investigation, proactive attack surface reduction

#### Daily Workflow Examples (12)

**1. External Attack Surface Mapping**
```
Natural Language: "Show me all assets exposed to the internet - I need to map our external attack surface."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Complete external attack surface inventory for threat modeling
```

**2. Investigate Trusted Source Configurations**
```
Natural Language: "I found a suspicious source IP. What trusted source configurations do we have that might be allowing it through?"

Expected Tool: get_objects

Parameters: { "object_type": "behaviors" }

Business Outcome: Trusted source review to identify potential bypass vectors
```

**3. Unauthorized Change Detection**
```
Natural Language: "Are there any WAF configuration changes pending that I didn't authorize? Show me the session state."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Unauthorized change detection for security posture integrity
```

**4. Emergency Threat Blocking Rule**
```
Natural Language: "Create an emergency exception named 'block-CVE-2024-threat' to block a specific attack pattern we just identified."

Expected Tool: manage_objects

Parameters: { "object_type": "behaviors", "subtype": "Exceptions", "action": "create", "data": { "name": "block-CVE-2024-threat" } }

Business Outcome: Rapid threat containment through emergency blocking rule
```

**5. Practice Detection Mode Query**
```
Natural Language: "Query the API to get all practices with their detection modes - I need to know which are in detect-only vs prevent: { getPractices { id name practiceType mode } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getPractices { id name practiceType mode } }" }

Business Outcome: Detection vs prevention mode mapping for coverage assessment
```

**6. Log4Shell Protection Guidance**
```
Natural Language: "What's the best way to configure WAF to detect and block Log4Shell exploitation attempts?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "How should CloudGuard WAF be configured to detect and block Log4Shell (CVE-2021-44228) exploitation attempts? What practices and behaviors are most effective?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}] }

Business Outcome: CVE-specific WAF hardening guidance from documentation
```

**7. Lateral Movement Zone Analysis**
```
Natural Language: "Show me all security zones - I'm tracing how an attacker could pivot between network segments."

Expected Tool: get_objects

Parameters: { "object_type": "zones" }

Business Outcome: Network segmentation analysis for lateral movement investigation
```

**8. Post-Containment Enforcement**
```
Natural Language: "We've confirmed the threat is contained. Enforce all the blocking rules I just configured."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Threat containment rules deployed to production immediately
```

**9. Trigger Coverage Verification**
```
Natural Language: "List every trigger in our configuration - I need to verify we're logging the right events for our threat intel feeds."

Expected Tool: get_objects

Parameters: { "object_type": "triggers" }

Business Outcome: Detection trigger audit for threat intelligence integration
```

**10. Gateway Coverage Analysis**
```
Natural Language: "Show me all profiles and their associated agents - I need to verify coverage across all our gateway points."

Expected Tool: get_objects

Parameters: { "object_type": "profiles" }

Business Outcome: Gateway coverage verification to eliminate blind spots
```

**11. Find Unprotected Assets Query**
```
Natural Language: "Run a deep query to find any assets without practices: { getAssets { assets { id name practices { id } } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { assets { id name practices { id } } } }" }

Business Outcome: Unprotected asset identification for immediate remediation
```

**12. API-Specific Threat Protection**
```
Natural Language: "We're seeing a new OWASP Top 10 attack vector. What does CloudGuard recommend for API-specific protections?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What are CloudGuard WAF's recommended protections against OWASP API Security Top 10 threats? How should API-specific practices be configured?", "available_tools": [{"name": "manage_objects", "description": "Create/update WAF objects"}, {"name": "get_objects", "description": "Retrieve WAF objects"}] }

Business Outcome: OWASP API security hardening guidance for proactive defense
```

### 🔄 Change Manager
**Primary Responsibilities**: Change control workflows, CAB coordination, deployment approval, configuration drift management
**Business Impact**: 95% reduction in unauthorized changes, full change traceability

#### Daily Workflow Examples (12)

**1. Change Window Status Check**
```
Natural Language: "What's the current change window status? Are there uncommitted changes sitting in the staging area?"

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Change window state awareness for CAB coordination
```

**2. CAB Meeting Preparation**
```
Natural Language: "Show me everything that's been modified since the last publish so I can prepare the change advisory board notes."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Pending change inventory for CAB meeting preparation
```

**3. Post-Freeze Deployment**
```
Natural Language: "The change freeze is over. Go ahead and push all approved changes to production."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Controlled post-freeze deployment of accumulated approved changes
```

**4. Pre-Approval Practice Review**
```
Natural Language: "Before I approve this change request, show me all the security practices that will be affected."

Expected Tool: get_objects

Parameters: { "object_type": "practices" }

Business Outcome: Impact assessment data for informed change approval decisions
```

**5. Rollback Investigation**
```
Natural Language: "Roll back context - show me all assets so I can identify what was modified in the failed change."

Expected Tool: get_objects

Parameters: { "object_type": "assets" }

Business Outcome: Asset state visibility for rollback impact assessment
```

**6. Configuration Consistency Check**
```
Natural Language: "Is our WAF in a consistent state? Check if the enforced configuration matches what we expect."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Configuration consistency validation for operational stability
```

**7. Maintenance Window Audit Trigger**
```
Natural Language: "Create a new trigger named 'change-audit-trail' for tracking all modifications during this maintenance window."

Expected Tool: manage_objects

Parameters: { "object_type": "triggers", "subtype": "Log", "action": "create", "data": { "name": "change-audit-trail" } }

Business Outcome: Enhanced audit logging during maintenance windows
```

**8. Emergency Change Enforcement**
```
Natural Language: "The emergency change is approved by the CAB. Publish and enforce immediately."

Expected Tool: publish_and_enforce

Parameters: { "confirmPublishAndEnforce": true }

Business Outcome: Rapid emergency change deployment with CAB authorization
```

**9. Modification Audit Query**
```
Natural Language: "Query to get a changelog-style view of all objects with their modification timestamps: { getAssets { assets { id name objectStatus } } }"

Expected Tool: call_waf_api

Parameters: { "query": "{ getAssets { assets { id name objectStatus } } }" }

Business Outcome: Object modification audit trail for change documentation
```

**10. Change Management Process Guidance**
```
Natural Language: "What's the recommended change management process for WAF configurations in a multi-team environment?"

Expected Tool: waf_consultant

Parameters: { "user_prompt": "What is the recommended change management process for CloudGuard WAF configurations when multiple teams share the same environment? How should changes be staged and approved?", "available_tools": [{"name": "publish_and_enforce", "description": "Publish and enforce changes"}, {"name": "get_enforcement_status", "description": "Check enforcement status"}] }

Business Outcome: Multi-team change management process design guidance
```

**11. Impact Assessment - Deployment Profiles**
```
Natural Language: "Show me all deployment profiles - I need to verify which environments will be affected by this change."

Expected Tool: get_objects

Parameters: { "object_type": "profiles" }

Business Outcome: Environment impact mapping for change scope assessment
```

**12. Post-Publish Verification**
```
Natural Language: "Verify the publish completed successfully - confirm the enforcement status shows no pending changes."

Expected Tool: get_enforcement_status

Parameters: {}

Business Outcome: Post-deployment verification confirming successful change enforcement
```

---
