import { Command } from "commander"
import * as p from "@clack/prompts"
import color from "picocolors"
import { indexProject, type IndexOptions, type IndexResult } from "../features/code-intel/indexer"
import { getCodeOverview, isConnected } from "./memory/surreal-client"
import { basename } from "path"

export function createIndexCommand(): Command {
    const cmd = new Command("index")
        .description("Index the current project codebase for code intelligence")
        .option("--vector", "Also generate vector embeddings for semantic search")
        .option("--stats", "Show index statistics only (do not re-index)")
        .option("--rebuild", "Force full re-index (clear existing data first)")
        .addHelpText("after", `
Examples:
  $ omo-cli index                 # Index current project (BM25 + graph)
  $ omo-cli index --vector        # Also generate embeddings for semantic search
  $ omo-cli index --stats         # Show index statistics only
  $ omo-cli index --rebuild       # Clear + full re-index

Prerequisites:
  - SurrealDB must be running: omo-cli memory start
  - ast-grep CLI (sg) should be available: bun add -D @ast-grep/cli
`)
        .action(async (options) => {
            const projectDir = process.cwd()
            const project = basename(projectDir)

            // Stats-only mode
            if (options.stats) {
                p.intro(color.bgCyan(color.white(" Code Intel — Statistics ")))

                const connected = await isConnected()
                if (!connected) {
                    p.log.error("SurrealDB not connected. Run 'omo-cli memory start' first.")
                    p.outro(color.red("Failed"))
                    process.exit(1)
                }

                const overview = await getCodeOverview(project)
                p.log.info(`Project: ${color.cyan(project)}`)
                p.log.info(`Files indexed: ${color.bold(String(overview.fileCount))}`)
                p.log.info(`Exported symbols: ${color.bold(String(overview.exportCount))}`)

                if (overview.elementCounts.length > 0) {
                    p.log.info("Elements by kind:")
                    for (const { kind, count } of overview.elementCounts) {
                        p.log.message(`  ${kind}: ${color.bold(String(count))}`)
                    }
                } else {
                    p.log.warn("No elements indexed yet. Run 'omo-cli index' to build the index.")
                }

                p.outro(color.green("Done"))
                return
            }

            // Index mode
            p.intro(color.bgCyan(color.white(" Code Intel — Indexing ")))

            const s = p.spinner()
            s.start("Checking SurrealDB connection...")

            const connected = await isConnected()
            if (!connected) {
                s.stop(color.red("SurrealDB not connected"))
                p.log.error("Run 'omo-cli memory start' to start SurrealDB.")
                p.outro(color.red("Failed"))
                process.exit(1)
            }
            s.stop(color.green("SurrealDB connected"))

            const indexOpts: IndexOptions = {
                projectDir,
                project,
                useVectors: options.vector ?? false,
                rebuild: options.rebuild ?? false,
            }

            if (options.rebuild) {
                p.log.warn("Rebuild mode: clearing existing index...")
            }
            if (options.vector) {
                p.log.info("Vector mode: generating embeddings (this may take longer)")
            }

            s.start("Indexing codebase...")

            let result: IndexResult
            try {
                result = await indexProject(indexOpts)
            } catch (err) {
                s.stop(color.red("Indexing failed"))
                p.log.error(`Error: ${err}`)
                p.outro(color.red("Failed"))
                process.exit(1)
            }

            s.stop(color.green("Indexing complete"))

            // Report
            p.log.info(`Files scanned: ${color.bold(String(result.filesScanned))}`)
            if (result.filesSkipped > 0) {
                p.log.info(`Files skipped (unchanged): ${color.dim(String(result.filesSkipped))}`)
            }
            p.log.info(`Elements indexed: ${color.bold(String(result.elementsIndexed))}`)
            p.log.info(`Relations indexed: ${color.bold(String(result.relationsIndexed))}`)
            p.log.info(`Duration: ${color.dim(String(result.durationMs) + "ms")}`)

            if (result.errors.length > 0) {
                p.log.warn(`${result.errors.length} error(s) encountered:`)
                for (const err of result.errors.slice(0, 5)) {
                    p.log.message(`  ${color.red("•")} ${err}`)
                }
                if (result.errors.length > 5) {
                    p.log.message(`  ... and ${result.errors.length - 5} more`)
                }
            }

            p.outro(color.green("oMoMoMoMo... Code intelligence ready!"))
        })

    return cmd
}
