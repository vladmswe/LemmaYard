import { describe, expect, it } from "vitest";

import { sanitizeSuffix, testDatabaseName, withDatabase } from "../helpers/test-db-name";

describe("test database naming", () => {
  it("derives leetcopy_test_<suffix> from a sanitized worktree name", () => {
    expect(testDatabaseName("leet-copy")).toBe("leetcopy_test_leet_copy");
    expect(testDatabaseName("agent-A3f6.wt")).toBe("leetcopy_test_agent_a3f6_wt");
    expect(testDatabaseName("m2-auth")).not.toBe(testDatabaseName("m4-judge"));
    expect(sanitizeSuffix("---")).toBe("default");
    expect(sanitizeSuffix("x".repeat(100))).toHaveLength(40);
  });

  it("swaps only the database in a URL", () => {
    expect(withDatabase("postgres://u:p@localhost:5433/leetcopy_test", "leetcopy_test_a")).toBe(
      "postgres://u:p@localhost:5433/leetcopy_test_a",
    );
  });
});
