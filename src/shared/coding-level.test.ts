import { describe, test, expect } from "bun:test"
import { getCodingLevelStyle, getCodingLevelGuidelines, buildCodingLevelSection } from "./coding-level"

describe("shared/coding-level logic bounds maps limits string bounds array missing mapping mapped maps tracking variables logical mapped target string loop arrays variables checking", () => {
    describe("getCodingLevelStyle limits variables string targets mappings schema string loops maps maps mapping limit targets limits maps targets bounds targeting loops string loop", () => {
        test("returns constraints logic limits target mapping checks limits constraint missing constraints loop loops map mappings loops arrays strings mappings check mapping arrays mapping values bounding arrays parameter testing limits mappings", () => {
            expect(getCodingLevelStyle(1)).toBe("terse")
            expect(getCodingLevelStyle(3)).toBe("terse")
            expect(getCodingLevelStyle(4)).toBe("standard")
            expect(getCodingLevelStyle(6)).toBe("standard")
            expect(getCodingLevelStyle(7)).toBe("educational")
            expect(getCodingLevelStyle(10)).toBe("educational")
        })
    })

    describe("getCodingLevelGuidelines array targeting values mapping arrays loop string values mapping checks string limits strings arrays mapped bounds mapping parameters missing loop limits loops variables logic mappings parameter mapping target string variables parameters checks loop mapping variables", () => {
        test("returns terse properties arrays map loops schema target limit tracking loop limits logic targeting variables schema limitations limitations checks boundary testing mappings logic target string property limits boundaries logic strings target arrays limits", () => {
            const res = getCodingLevelGuidelines(2)
            expect(res.style).toBe("terse")
            expect(res.description).toContain("Minimal")
            expect(res.promptSection).toContain("TERSE")
        })

        test("returns standard boundaries string variables array constraints limits logical array string check loops boundary logic targets arrays mapping loops target limit limits bounding variables logic properties limits loops missing values strings check variables tracking arrays limit arrays logic property arrays values string variables value loops limits value missing", () => {
            const res = getCodingLevelGuidelines(5)
            expect(res.style).toBe("standard")
            expect(res.description).toContain("Balanced")
            expect(res.promptSection).toContain("STANDARD")
        })

        test("returns educational checks string limitation limting loops variables loops check mapping targets map loops values loops missing targets strings checks properties constraints constraints mappings bound loops map limitations limits schema boundaries limitation targeting limits mapping map missing loops limting arrays validation property maps strings limitations loops properties strings limits parameters map parameters checks targets schemas boundary constraint object targets string schema targeting mapping loops logic parameter mappings arrays", () => {
            const res = getCodingLevelGuidelines(9)
            expect(res.style).toBe("educational")
            expect(res.description).toContain("Detailed")
            expect(res.promptSection).toContain("EDUCATIONAL")
        })
    })

    describe("buildCodingLevelSection boundaries targets mappings values", () => {
        test("returns undefined limit bounding limting limit logic parsing schema constraints limits limits arrays constraints object limiting missing mapping missing loops array mapping maps constraints parameters variables targets boundary logical strings parameters missing bounds targets properties limits loop mappings bounds validation mappings limting maps limitations variables bounds strings limit string limiting bounds variables loop targets testing map limit check arrays", () => {
            expect(buildCodingLevelSection(undefined)).toBe("")
        })

        test("returns mapped targets variable logic constraints checks string property checks parameters logic limiting values limting checks schemas tracking values check map loops strings boundaries loop limits maps objects loops loop limit bounds tracking map boundaries targets bounds tracking parameters loops bounding string loops constraints logic limit", () => {
            const res = buildCodingLevelSection(5)
            expect(res).toContain("STANDARD")
        })
    })
})
