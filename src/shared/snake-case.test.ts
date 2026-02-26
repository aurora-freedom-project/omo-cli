import { describe, test, expect } from "bun:test"
import {
    camelToSnake,
    snakeToCamel,
    objectToSnakeCase,
    objectToCamelCase
} from "./snake-case"

describe("snake-case", () => {
    describe("camelToSnake", () => {
        test("converts camelCase to snake_case", () => {
            expect(camelToSnake("myCamelCaseString")).toBe("my_camel_case_string")
            expect(camelToSnake("already_snake")).toBe("already_snake")
            expect(camelToSnake("OneTwoThree")).toBe("_one_two_three") // Leading capital
        })
    })

    describe("snakeToCamel", () => {
        test("converts snake_case to camelCase", () => {
            expect(snakeToCamel("my_snake_case_string")).toBe("mySnakeCaseString")
            expect(snakeToCamel("alreadyCamel")).toBe("alreadyCamel")
            expect(snakeToCamel("num_1_test")).toBe("num_1Test")
            expect(snakeToCamel("_leading_snake")).toBe("LeadingSnake")
        })
    })

    describe("objectToSnakeCase", () => {
        test("converts top level object keys to snake case", () => {
            const input = { myKey: 1, anotherKey: "test" }
            const expected = { my_key: 1, another_key: "test" }
            expect(objectToSnakeCase(input)).toEqual(expected)
        })

        test("converts nested object keys deeply by default", () => {
            const input = {
                outerKey: {
                    innerKey: {
                        deepestKey: true
                    },
                    arrayKey: [
                        { objInArray: 1 },
                        "plainString"
                    ]
                }
            }
            const expected = {
                outer_key: {
                    inner_key: {
                        deepest_key: true
                    },
                    array_key: [
                        { obj_in_array: 1 },
                        "plainString"
                    ]
                }
            }
            expect(objectToSnakeCase(input)).toEqual(expected)
        })

        test("does not convert deeply if shallow is requested", () => {
            const input = {
                outerKey: { innerKey: 1 },
                arrayKey: [{ arrayObj: 2 }]
            }
            const expected = {
                outer_key: { innerKey: 1 },
                array_key: [{ arrayObj: 2 }]
            }
            expect(objectToSnakeCase(input, false)).toEqual(expected)
        })

        test("handles arrays of non-objects correctly", () => {
            const input = { stringArr: ["a", "b", "c"], numArr: [1, 2, 3] }
            const expected = { string_arr: ["a", "b", "c"], num_arr: [1, 2, 3] }
            expect(objectToSnakeCase(input)).toEqual(expected)
        })
    })

    describe("objectToCamelCase", () => {
        test("converts top level object keys to camel case", () => {
            const input = { my_key: 1, another_key: "test" }
            const expected = { myKey: 1, anotherKey: "test" }
            expect(objectToCamelCase(input)).toEqual(expected)
        })

        test("converts nested object keys deeply by default", () => {
            const input = {
                outer_key: {
                    inner_key: {
                        deepest_key: true
                    },
                    array_key: [
                        { obj_in_array: 1 },
                        "plainString"
                    ]
                }
            }
            const expected = {
                outerKey: {
                    innerKey: {
                        deepestKey: true
                    },
                    arrayKey: [
                        { objInArray: 1 },
                        "plainString"
                    ]
                }
            }
            expect(objectToCamelCase(input)).toEqual(expected)
        })

        test("does not convert deeply if shallow is requested", () => {
            const input = {
                outer_key: { inner_key: 1 },
                array_key: [{ array_obj: 2 }]
            }
            const expected = {
                outerKey: { inner_key: 1 },
                arrayKey: [{ array_obj: 2 }]
            }
            expect(objectToCamelCase(input, false)).toEqual(expected)
        })
    })
})
