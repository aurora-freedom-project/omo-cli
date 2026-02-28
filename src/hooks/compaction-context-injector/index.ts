import { injectHookMessage } from "../../features/hook-message-injector"
import { log } from "../../shared/logger"
import { formatSystemDirective, SystemDirectiveTypes } from "../../shared/system-directive"

export interface SummarizeContext {
  sessionID: string
  providerID: string
  modelID: string
  usageRatio: number
  directory: string
}

const SUMMARIZE_CONTEXT_PROMPT = `${formatSystemDirective(SystemDirectiveTypes.COMPACTION_CONTEXT)}

When summarizing this session, you MUST include the following sections in your summary:

## 1. User Requests (As-Is)
- List all original user requests exactly as they were stated
- Preserve the user's exact wording and intent

## 2. Final Goal
- What the user ultimately wanted to achieve
- The end result or deliverable expected

## 3. Work Completed
- What has been done so far
- Files created/modified
- Features implemented
- Problems solved

## 4. Remaining Tasks
- What still needs to be done
- Pending items from the original request
- Follow-up tasks identified during the work

## 5. Active Working Context (For Seamless Continuation)
- **Files**: Paths of files currently being edited or frequently referenced
- **Code in Progress**: Key code snippets, function signatures, or data structures under active development
- **External References**: Documentation URLs, library APIs, or external resources being consulted
- **State & Variables**: Important variable names, configuration values, or runtime state relevant to ongoing work

## 6. MUST NOT Do (Critical Constraints)
- Things that were explicitly forbidden
- Approaches that failed and should not be retried
- User's explicit restrictions or preferences
- Anti-patterns identified during the session

## 7. Agent Verification State (Critical for Reviewers)
- **Current Agent**: What agent is running (reviewer, architect, etc.)
- **Verification Progress**: Files already verified/validated
- **Pending Verifications**: Files still needing verification
- **Previous Rejections**: If reviewer agent, what was rejected and why
- **Acceptance Status**: Current state of review process

This section is CRITICAL for reviewer agents (reviewer, architect) to maintain continuity.

This context is critical for maintaining continuity after compaction.
`

async function queryMemoryConcepts(project?: string): Promise<string | null> {
  try {
    const surreal = await import("../../cli/memory/surreal-client")

    const connected = await surreal.isConnected()
    if (!connected) return null

    // Use searchSimilar with an empty embedding isn't ideal;
    // instead, do a direct HTTP query for recent concepts
    const whereClause = project ? `WHERE project = "${project}"` : ""
    const query = `SELECT content, tags FROM concept ${whereClause} ORDER BY created DESC LIMIT 10;`

    // Leverage the internal rpc-style endpoint via fetch
    const res = await fetch("http://127.0.0.1:18000/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        NS: "omo",
        DB: "memory",
        Authorization: `Basic ${btoa("root:omo-secret")}`,
      },
      body: JSON.stringify({ id: "1", method: "query", params: [query] }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return null

    const data = (await res.json()) as { result?: Array<{ result?: Array<{ content: string; tags?: string[] }> }> }
    const rows = data.result?.[0]?.result
    if (!rows || rows.length === 0) return null

    const concepts = rows
      .map((r) => `- ${r.content}${r.tags?.length ? ` [${r.tags.join(", ")}]` : ""}`)
      .join("\n")

    return `\n## 8. omo-memory: Recalled Concepts\nThe following concepts were previously stored in omo-memory and may be relevant:\n${concepts}\n`
  } catch {
    // Memory not available — silently skip
    return null
  }
}

export function createCompactionContextInjector() {
  return async (ctx: SummarizeContext): Promise<void> => {
    log("[compaction-context-injector] injecting context", { sessionID: ctx.sessionID })

    let prompt = SUMMARIZE_CONTEXT_PROMPT

    // Attempt to enrich with omo-memory concepts
    const projectName = ctx.directory.split("/").pop() || undefined
    const memorySummary = await queryMemoryConcepts(projectName)
    if (memorySummary) {
      prompt += memorySummary
      log("[compaction-context-injector] memory concepts injected", { sessionID: ctx.sessionID })
    }

    const success = injectHookMessage(ctx.sessionID, prompt, {
      agent: "general",
      model: { providerID: ctx.providerID, modelID: ctx.modelID },
      path: { cwd: ctx.directory },
    })

    if (success) {
      log("[compaction-context-injector] context injected", { sessionID: ctx.sessionID })
    } else {
      log("[compaction-context-injector] injection failed", { sessionID: ctx.sessionID })
    }
  }
}

