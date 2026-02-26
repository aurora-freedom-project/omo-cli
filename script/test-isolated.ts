import { $ } from "bun";
import { Glob } from "bun";
import { parseArgs } from "util";
import os from "os";

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        bail: {
            type: "boolean",
        },
    },
    strict: true,
    allowPositionals: true,
});

const glob = new Glob("src/**/*.test.ts");
const files = Array.from(glob.scanSync("."));

console.log(`🏃 Running ${files.length} test suites in isolated processes (Concurrency: ${Math.max(1, Math.floor(os.cpus().length / 2))})...`);

let failedPaths: string[] = [];
let passedCount = 0;
let failedCount = 0;

const concurrency = Math.max(1, Math.floor(os.cpus().length / 2));

async function runTest(file: string) {
    // Run quietly to avoid terminal spam, only print if failing
    const result = await $`bun test ${file}`.nothrow().quiet();
    if (result.exitCode !== 0) {
        console.error(`\n❌ Failed: ${file}`);
        // Print the output of the failed test
        console.error(result.text());
        failedPaths.push(file);
        failedCount++;
        if (values.bail) {
            console.error("Bailing out on first failure.");
            process.exit(1);
        }
    } else {
        passedCount++;
        process.stdout.write("✓");
    }
}

// Queue chunks
for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    await Promise.all(chunk.map(runTest));
}

console.log(`\n\n==================================`);
if (failedPaths.length > 0) {
    console.error(`🔥 ${failedCount}/${files.length} test suites failed!`);
    failedPaths.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
} else {
    console.log(`✅ All ${files.length} test suites passed in isolation!`);
}
