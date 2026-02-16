// vitest.setup.ts
import { afterEach } from "vitest";

// React 18 expects this flag in the test env.
// Without it, you get: "The current testing environment is not configured to support act(...)"
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Optional: cleanup between tests if you mount manually
afterEach(() => {
    document.body.innerHTML = "";
});
