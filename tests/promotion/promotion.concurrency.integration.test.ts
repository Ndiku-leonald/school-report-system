// The concurrency suite intentionally reuses the same real Stage 11-backed
// fixture and independent-client race cases as the acceptance integration
// suite. The dedicated Vitest config filters the imported suite to C01-C12.
import "./promotion.integration.test";
