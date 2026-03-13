import { describe, it, expect } from "bun:test";

//#given a grep-app MCP configuration module
//#when importing the grep_app configuration
//#then it should export a valid MCP server configuration
describe("grep-app MCP configuration", () => {
  //#given the grep_app object is exported from the module
  //#when accessing its properties
  //#then it should have the correct type for remote MCP servers
  it("should have type 'remote' for remote MCP server", async () => {
    //#given the grep_app module is imported
    const { grep_app } = await import("./grep-app");

    //#then type should be 'remote'
    expect(grep_app.type).toBe("remote");
  });

  //#given the grep_app configuration
  //#when checking the server URL
  //#then it should point to the grep.app service
  it("should have correct URL for grep.app service", async () => {
    //#given the grep_app module is imported
    const { grep_app } = await import("./grep-app");

    //#then URL should be https://mcp.grep.app
    expect(grep_app.url).toBe("https://mcp.grep.app");
  });

  //#given the grep_app configuration
  //#when checking if the server is enabled
  //#then it should be enabled by default
  it("should be enabled by default", async () => {
    //#given the grep_app module is imported
    const { grep_app } = await import("./grep-app");

    //#then enabled should be true
    expect(grep_app.enabled).toBe(true);
  });

  //#given the grep_app configuration
  //#when checking OAuth requirement
  //#then it should not require OAuth authentication
  it("should not require OAuth authentication", async () => {
    //#given the grep_app module is imported
    const { grep_app } = await import("./grep-app");

    //#then oauth should be false
    expect(grep_app.oauth).toBe(false);
  });

  //#given the grep_app configuration object
  //#when verifying the object structure
  //#then it should have all required configuration properties
  it("should have all required configuration properties", async () => {
    //#given the grep_app module is imported
    const { grep_app } = await import("./grep-app");

    //#then all required properties should exist
    expect(grep_app).toHaveProperty("type");
    expect(grep_app).toHaveProperty("url");
    expect(grep_app).toHaveProperty("enabled");
    expect(grep_app).toHaveProperty("oauth");
  });
});
