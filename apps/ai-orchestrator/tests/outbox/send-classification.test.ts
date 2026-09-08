import { describe, expect, it } from "vitest";

import { AppError } from "../../src/lib/errors.js";
import { classifySendFailure } from "../../src/modules/outbox/outbox-policy.js";

describe("outbound send failure classification", () => {
  it("treats a transport rejection as a proven non-delivery", () => {
    const classification = classifySendFailure(
      new AppError("Evolution Go send failed with HTTP 422", {
        statusCode: 422,
        code: "EVOLUTION_SEND_FAILED",
      }),
    );
    expect(classification).toEqual({
      state: "FAILED",
      detail: "transport_rejected_http_422",
      retryable: false,
    });
  });

  it("treats a timeout as unknown, never as a failure to retry", () => {
    const classification = classifySendFailure(
      new AppError("Evolution Go send timed out.", {
        statusCode: 504,
        code: "EVOLUTION_SEND_TIMEOUT",
      }),
    );
    expect(classification.state).toBe("UNKNOWN");
    expect(classification.retryable).toBe(false);
  });

  it("treats a transport server error as unknown", () => {
    const classification = classifySendFailure(
      new AppError("Evolution Go send failed with HTTP 502", {
        statusCode: 502,
        code: "EVOLUTION_SEND_FAILED",
      }),
    );
    expect(classification.state).toBe("UNKNOWN");
    expect(classification.detail).toBe("transport_error_http_502");
    expect(classification.retryable).toBe(false);
  });

  it("retries only when the request provably never left", () => {
    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    });
    const classification = classifySendFailure(refused);
    expect(classification).toEqual({
      state: "FAILED",
      detail: "transport_unreachable_econnrefused",
      retryable: true,
    });
  });

  it("marks the Goal003 transition window as an explicit, visible failure", () => {
    const classification = classifySendFailure(
      new AppError("Channel credential is not provisioned for this connection.", {
        statusCode: 409,
        code: "CHANNEL_CREDENTIAL_NOT_PROVISIONED",
      }),
    );
    expect(classification).toEqual({
      state: "FAILED",
      detail: "channel_credential_not_projected",
      retryable: false,
    });
  });

  it("defaults to unknown when the failure cannot be explained", () => {
    expect(classifySendFailure(new Error("socket hang up")).state).toBe(
      "UNKNOWN",
    );
  });
});
