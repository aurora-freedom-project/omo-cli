import { describe, it, expect } from "bun:test";
import {
    isSafeFile,
    hasApprovalPrefix,
    stripApprovalPrefix,
    isPrivacySensitive,
    extractPaths,
    checkPrivacy,
    APPROVED_PREFIX,
} from "./checker";

describe("privacy-block/checker", () => {
    describe("isSafeFile", () => {
        it("should recognize safe patterns", () => {
            expect(isSafeFile(".env.example")).toBe(true);
            expect(isSafeFile(".env.sample")).toBe(true);
            expect(isSafeFile("config.template")).toBe(true);
            expect(isSafeFile("/path/to/.env.EXAMPLE")).toBe(true);
        });

        it("should reject non-safe patterns", () => {
            expect(isSafeFile(".env")).toBe(false);
            expect(isSafeFile(".env.local")).toBe(false);
            expect(isSafeFile("credentials.json")).toBe(false);
        });
    });

    describe("hasApprovalPrefix", () => {
        it("should detect APPROVED: prefix", () => {
            expect(hasApprovalPrefix("APPROVED:.env")).toBe(true);
            expect(hasApprovalPrefix("APPROVED:./config/secrets.yaml")).toBe(true);
        });

        it("should reject paths without prefix", () => {
            expect(hasApprovalPrefix(".env")).toBe(false);
            expect(hasApprovalPrefix("approved:.env")).toBe(false);
        });
    });

    describe("stripApprovalPrefix", () => {
        it("should remove APPROVED: prefix", () => {
            expect(stripApprovalPrefix("APPROVED:.env")).toBe(".env");
            expect(stripApprovalPrefix("APPROVED:./path/to/file")).toBe("./path/to/file");
        });

        it("should leave non-prefixed paths unchanged", () => {
            expect(stripApprovalPrefix(".env")).toBe(".env");
            expect(stripApprovalPrefix("file.txt")).toBe("file.txt");
        });
    });

    describe("isPrivacySensitive", () => {
        it("should detect .env files", () => {
            expect(isPrivacySensitive(".env")).toBe(true);
            expect(isPrivacySensitive(".env.local")).toBe(true);
            expect(isPrivacySensitive(".env.production")).toBe(true);
            expect(isPrivacySensitive("/path/to/.env")).toBe(true);
        });

        it("should detect credentials", () => {
            expect(isPrivacySensitive("credentials.json")).toBe(true);
            expect(isPrivacySensitive("my-credentials")).toBe(true);
        });

        it("should detect keys", () => {
            expect(isPrivacySensitive("private.key")).toBe(true);
            expect(isPrivacySensitive("cert.pem")).toBe(true);
            expect(isPrivacySensitive("id_rsa")).toBe(true);
            expect(isPrivacySensitive("id_ed25519")).toBe(true);
        });

        it("should detect secrets files", () => {
            expect(isPrivacySensitive("secrets.yaml")).toBe(true);
            expect(isPrivacySensitive("secret.yml")).toBe(true);
        });

        it("should allow safe files", () => {
            expect(isPrivacySensitive(".env.example")).toBe(false);
            expect(isPrivacySensitive(".env.sample")).toBe(false);
            expect(isPrivacySensitive("config.template")).toBe(false);
        });

        it("should allow normal files", () => {
            expect(isPrivacySensitive("README.md")).toBe(false);
            expect(isPrivacySensitive("package.json")).toBe(false);
            expect(isPrivacySensitive("src/index.ts")).toBe(false);
        });

        it("should work with APPROVED: prefix", () => {
            expect(isPrivacySensitive("APPROVED:.env")).toBe(true);
            expect(isPrivacySensitive("APPROVED:credentials.json")).toBe(true);
        });
    });

    describe("extractPaths", () => {
        it("should extract from file_path", () => {
            const paths = extractPaths({ file_path: ".env" });
            expect(paths).toEqual([".env"]);
        });

        it("should extract from filePath", () => {
            const paths = extractPaths({ filePath: ".env.local" });
            expect(paths).toEqual([".env.local"]);
        });

        it("should extract from path", () => {
            const paths = extractPaths({ path: "credentials.json" });
            expect(paths).toEqual(["credentials.json"]);
        });

        it("should extract from bash command", () => {
            const paths = extractPaths({ command: "cat .env" });
            expect(paths).toEqual([".env"]);
        });

        it("should extract APPROVED: from bash", () => {
            const paths = extractPaths({ command: "cat APPROVED:.env" });
            expect(paths).toEqual(["APPROVED:.env"]);
        });

        it("should extract multiple paths", () => {
            const paths = extractPaths({
                file_path: ".env",
                targetFile: "secrets.yaml"
            });
            expect(paths.length).toBe(2);
            expect(paths).toContain(".env");
            expect(paths).toContain("secrets.yaml");
        });
    });

    describe("checkPrivacy", () => {
        it("should block sensitive files", () => {
            const result = checkPrivacy("read_file", { file_path: ".env" });
            expect(result.blocked).toBe(true);
            expect(result.filePath).toBe(".env");
            expect(result.reason).toBeDefined();
        });

        it("should allow approved access", () => {
            const result = checkPrivacy("read_file", { file_path: "APPROVED:.env" });
            expect(result.blocked).toBe(false);
            expect(result.approved).toBe(true);
            expect(result.filePath).toBe(".env");
        });

        it("should allow safe files", () => {
            const result = checkPrivacy("read_file", { file_path: ".env.example" });
            expect(result.blocked).toBe(false);
        });

        it("should allow normal files", () => {
            const result = checkPrivacy("read_file", { file_path: "README.md" });
            expect(result.blocked).toBe(false);
        });

        it("should detect suspicious approved paths", () => {
            const result = checkPrivacy("read_file", { file_path: "APPROVED:../.env" });
            expect(result.blocked).toBe(false);
            expect(result.approved).toBe(true);
            expect(result.suspicious).toBe(true);
        });

        it("should handle bash commands", () => {
            const result = checkPrivacy("bash", { command: "cat .env" });
            expect(result.blocked).toBe(true);
        });
    });
});
