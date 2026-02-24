import * as fs from "fs"
import * as path from "path"

export interface ValidationLog {
    path: string
    action: "COPIED" | "FIXED_YAML" | "RENAMED_DUPLICATE"
    detail?: string
}

export class SkillValidator {
    private nameMap = new Map<string, string[]>()

    /**
     * Scans a directory for SKILL.md files, sanitizes their frontmatter,
     * assigns unique names, and writes the clean versions to the target directory.
     */
    public async sanitizeAndSync(sourceDir: string, targetDir: string): Promise<ValidationLog[]> {
        const logs: ValidationLog[] = []
        this.nameMap.clear()

        // Pass 1: Build memory map and fix basic YAML
        const sourceFiles = this.findSkillFiles(sourceDir)

        interface ParsedSkill {
            sourcePath: string
            parentFolder: string
            originalName: string | null
            content: string
            needsYamlFix: boolean
        }

        const parsedSkills: ParsedSkill[] = []

        for (const filePath of sourceFiles) {
            let content = fs.readFileSync(filePath, "utf-8")
            let modified = false

            const parentFolder = path.basename(path.dirname(filePath))

            // Fix missing names
            if (!content.includes("name:")) {
                if (content.startsWith("---\n")) {
                    content = content.replace("---\n", `---\nname: ${parentFolder}\n`)
                } else {
                    content = `---\nname: ${parentFolder}\n---\n${content}`
                }
                modified = true
            }

            // Fix broken quotes from external generators
            if (content.includes('description: ">-"')) {
                content = content.replace('description: ">-"', 'description: >-')
                modified = true
            }
            if (content.includes('description: ">"')) {
                content = content.replace('description: ">"', 'description: >')
                modified = true
            }

            // Extract Name
            let extractedName = parentFolder
            const nameMatch = content.match(/^name:\s*['"]?([^'"\n]+)['"]?/m)
            if (nameMatch && nameMatch[1]) {
                extractedName = nameMatch[1].trim()
            }

            // Store in memory
            parsedSkills.push({
                sourcePath: filePath,
                parentFolder,
                originalName: extractedName,
                content,
                needsYamlFix: modified
            })

            const existing = this.nameMap.get(extractedName) || []
            existing.push(filePath)
            this.nameMap.set(extractedName, existing)
        }

        // Pass 2: Deduplicate and Write to Target
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true })
        }

        for (const skill of parsedSkills) {
            let finalName = skill.originalName || skill.parentFolder
            let finalContent = skill.content
            let action: ValidationLog["action"] = skill.needsYamlFix ? "FIXED_YAML" : "COPIED"
            let detail = skill.needsYamlFix ? "Added missing fields / quotes" : undefined

            // Deduplicate if needed
            const duplicates = this.nameMap.get(finalName)
            if (duplicates && duplicates.length > 1) {
                const myIndex = duplicates.indexOf(skill.sourcePath)
                if (myIndex !== -1) {
                    if (finalName !== skill.parentFolder && skill.parentFolder !== "") {
                        finalName = `${finalName}-${skill.parentFolder}`
                    } else if (myIndex > 0) {
                        finalName = `${finalName}-alt-${myIndex}`
                    }

                    if (finalName !== skill.originalName) {
                        finalContent = finalContent.replace(
                            new RegExp(`^name:\\s*['"]?${skill.originalName}['"]?`, "m"),
                            `name: ${finalName}`
                        )
                        action = "RENAMED_DUPLICATE"
                        detail = `Renamed to avoid collision (${finalName})`
                    }
                }
            }

            // Ensure target subfolder exists
            const targetSkillDir = path.join(targetDir, skill.parentFolder)
            if (!fs.existsSync(targetSkillDir)) {
                fs.mkdirSync(targetSkillDir, { recursive: true })
            }

            const targetFilePath = path.join(targetSkillDir, "SKILL.md")
            fs.writeFileSync(targetFilePath, finalContent)

            logs.push({
                path: targetFilePath,
                action,
                detail
            })
        }

        return logs
    }

    private findSkillFiles(dir: string, fileList: string[] = []): string[] {
        if (!fs.existsSync(dir)) return fileList
        const files = fs.readdirSync(dir)

        for (const file of files) {
            const filePath = path.join(dir, file)
            if (fs.statSync(filePath).isDirectory()) {
                if (file === ".git") continue
                this.findSkillFiles(filePath, fileList)
            } else if (file === "SKILL.md") {
                fileList.push(filePath)
            }
        }
        return fileList
    }
}
