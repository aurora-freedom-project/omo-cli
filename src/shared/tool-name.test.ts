import { describe, test, expect } from "bun:test"
import { transformToolName } from "./tool-name"

describe("tool-name", () => {
    describe("transformToolName", () => {
        test("transforms special mappings correctly", () => {
            expect(transformToolName("webfetch")).toBe("WebFetch")
            expect(transformToolName("WEBSEARCH")).toBe("WebSearch")
            expect(transformToolName("TodoRead")).toBe("TodoRead")
            expect(transformToolName("todoWrite")).toBe("TodoWrite")
        })

        test("transforms dashed and snake cased names into PascalCase", () => {
            expect(transformToolName("my-tool")).toBe("MyTool")
            expect(transformToolName("some_other_tool")).toBe("SomeOtherTool")
            expect(transformToolName("mixed-case_TOOL")).toBe("MixedCaseTool")
            // spaces are not explicitly converted to PascalCase by \`includes("-") || includes("_")\`
            // unless the string contains a hyphen or underscore.
            expect(transformToolName("spaces_also handled")).toBe("SpacesAlsoHandled")
        })

        test("capitalizes single words", () => {
            expect(transformToolName("bash")).toBe("Bash")
            expect(transformToolName("REPL")).toBe("REPL") // Note: toPascalCase won't trigger if no hyphens/spaces. slice(1) remains unchanged so it becomes 'REPL'
            expect(transformToolName("rEPL")).toBe("REPL")
        })
    })
})
