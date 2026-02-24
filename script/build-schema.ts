#!/usr/bin/env bun
import * as z from "zod"
import { OmoCliConfigSchema } from "../src/config/schema"

const SCHEMA_OUTPUT_PATH = "assets/omo-cli.schema.json"

async function main() {
  console.log("Generating JSON Schema...")

  const jsonSchema = z.toJSONSchema(OmoCliConfigSchema, {
    io: "input",
    target: "draft-7",
  })

  const finalSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://raw.githubusercontent.com/code-yeongyu/omo-cli/master/assets/omo-cli.schema.json",
    title: "Oh My OpenCode Configuration",
    description: "Configuration schema for omo-cli plugin",
    ...jsonSchema,
  }

  await Bun.write(SCHEMA_OUTPUT_PATH, JSON.stringify(finalSchema, null, 2))

  console.log(`✓ JSON Schema generated: ${SCHEMA_OUTPUT_PATH}`)
}

main()
