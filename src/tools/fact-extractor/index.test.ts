import { describe, it, expect } from "bun:test"
import { parseFacts, formatFacts, type ExtractedFact } from "./index"

describe("Fact Extractor", () => {
    describe("parseFacts", () => {
        it("parses valid JSON with entities and relations", () => {
            const json = JSON.stringify({
                entities: [
                    { name: "Rust", type: "Language", description: "Systems language" },
                    { name: "borrow checker", type: "Concept" },
                ],
                relations: [
                    { source: "Rust", target: "borrow checker", relation: "USES" },
                ],
            })

            const result = parseFacts(json)
            expect(result.entities.length).toBe(2)
            expect(result.entities[0].name).toBe("Rust")
            expect(result.entities[0].type).toBe("Language")
            expect(result.entities[1].description).toBeUndefined()
            expect(result.relations.length).toBe(1)
            expect(result.relations[0].relation).toBe("USES")
        })

        it("parses empty result", () => {
            const result = parseFacts('{"entities": [], "relations": []}')
            expect(result.entities.length).toBe(0)
            expect(result.relations.length).toBe(0)
        })

        it("throws on invalid JSON", () => {
            expect(() => parseFacts("not json")).toThrow()
        })

        it("throws on missing entities key", () => {
            expect(() => parseFacts('{"relations": []}')).toThrow("Missing 'entities' array")
        })
    })

    describe("formatFacts", () => {
        it("formats entities and relations", () => {
            const facts: ExtractedFact = {
                entities: [
                    { name: "Auth", type: "Module", description: "Handles authentication" },
                    { name: "JWT", type: "Token" },
                ],
                relations: [
                    { source: "Auth", target: "JWT", relation: "USES" },
                ],
            }
            const result = formatFacts(facts)
            expect(result).toContain("Knowledge Graph")
            expect(result).toContain("2 entities")
            expect(result).toContain("1 relations")
            expect(result).toContain("Auth [Module]")
            expect(result).toContain("Handles authentication")
            expect(result).toContain("Auth —[USES]→ JWT")
        })

        it("handles empty facts", () => {
            const result = formatFacts({ entities: [], relations: [] })
            expect(result).toContain("No entities")
        })
    })
})
