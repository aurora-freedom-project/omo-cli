import * as fs from 'fs';

// 1. Fix src/config/schema.ts
let schema = fs.readFileSync('src/config/schema.ts', 'utf8');
// Update comments and descriptions
schema = schema.replace(/friendly name for Atlas/g, 'friendly name for Conductor')
    .replace(/friendly name for Oracle/g, 'friendly name for Architect')
    .replace(/friendly name for Metis/g, 'friendly name for Consultant');
schema = schema.replace(/Ultraworked with Sisyphus/g, "Ultraworked with Orchestrator")
    .replace(/Co-authored-by: Sisyphus/g, "Co-authored-by: Orchestrator");
schema = schema.replace(/Sisyphus Tasks system/g, "Orchestrator Tasks system")
    .replace(/Sisyphus Swarm system/g, "Orchestrator Swarm system");

// We keep the old names in the schemas (sisyphus, prometheus, etc) because user config might have them
// However, the config properties themselves might need renaming!
// Wait - in OmoCliConfigSchema:
// sisyphus: SisyphusConfigSchema.optional() -> orchestrator: SisyphusConfigSchema.optional()
schema = schema.replace(/sisyphus: SisyphusConfigSchema/, 'orchestrator: SisyphusConfigSchema');
fs.writeFileSync('src/config/schema.ts', schema);
console.log('Fixed schema.ts');


// 2. Fix src/shared/migration.ts
let migration = fs.readFileSync('src/shared/migration.ts', 'utf8');
migration = migration.replace(/Sisyphus variants/g, 'Orchestrator variants')
    .replace(/Prometheus variants/g, 'Planner variants')
    .replace(/Atlas variants/g, 'Conductor variants')
    .replace(/Metis variants/g, 'Consultant variants')
    .replace(/Momus variants/g, 'Reviewer variants')
    .replace(/Sisyphus-Junior/g, 'Orchestrator-Junior');
// In HOOK_NAME_MAP:
// "sisyphus-orchestrator": "navigator" -> "orchestrator-orchestrator": "navigator"
migration = migration.replace(/"sisyphus-orchestrator": "navigator"/, '"orchestrator-orchestrator": "navigator"');
fs.writeFileSync('src/shared/migration.ts', migration);
console.log('Fixed migration.ts');


// 3. Fix src/agents/utils.ts
let utils = fs.readFileSync('src/agents/utils.ts', 'utf8');
// Only replace occurrences of "sisyphus" -> "orchestrator", "atlas" -> "conductor", etc. in variable/function logic, NOT in agentSources keys 
// To make it easy, we replace sisyphusOverride -> orchestratorOverride, sisyphusRequirement -> orchestratorRequirement, etc.
utils = utils.replace(/sisyphusOverride/g, 'orchestratorOverride')
    .replace(/sisyphusRequirement/g, 'orchestratorRequirement')
    .replace(/sisyphusResolution/g, 'orchestratorResolution')
    .replace(/sisyphusModel/g, 'orchestratorModel')
    .replace(/sisyphusResolvedVariant/g, 'orchestratorResolvedVariant')
    .replace(/sisyphusConfig/g, 'orchestratorConfig')
    .replace(/sisOverrideCategory/g, 'orchOverrideCategory')
    .replace(/atlasRequirement/g, 'conductorRequirement')
    .replace(/atlasResolution/g, 'conductorResolution')
    .replace(/atlasModel/g, 'conductorModel')
    .replace(/atlasResolvedVariant/g, 'conductorResolvedVariant')
    .replace(/atlasOverrideCategory/g, 'conductorOverrideCategory');

// Replacements for literal checks: includes("sisyphus") -> includes("orchestrator")
utils = utils.replace(/disabledAgents\.includes\("sisyphus"\)/g, 'disabledAgents.includes("orchestrator")')
    .replace(/disabledAgents\.includes\("atlas"\)/g, 'disabledAgents.includes("conductor")')
    .replace(/AGENT_MODEL_REQUIREMENTS\["sisyphus"\]/g, 'AGENT_MODEL_REQUIREMENTS["orchestrator"]')
    .replace(/AGENT_MODEL_REQUIREMENTS\["atlas"\]/g, 'AGENT_MODEL_REQUIREMENTS["conductor"]')
    .replace(/agentOverrides\["sisyphus"\]/g, 'agentOverrides["orchestrator"]')
    .replace(/agentOverrides\["atlas"\]/g, 'agentOverrides["conductor"]')
    .replace(/result\["sisyphus"\]/g, 'result["orchestrator"]')
    .replace(/result\["atlas"\]/g, 'result["conductor"]');

fs.writeFileSync('src/agents/utils.ts', utils);
console.log('Fixed utils.ts');

