import assert from "node:assert/strict";
import test from "node:test";
import { checkConnection } from "../src/services/textbee-test.service.js";
import { sendSMS } from "../src/services/sms.service.js";

function setTextbeeEnvironment(t, { apiKey = "test-api-key", deviceId = "test-device-id" } = {}) {
  const previous = {
    apiKey: process.env.TEXTBEE_API_KEY,
    deviceId: process.env.TEXTBEE_DEVICE_ID,
  };
  process.env.TEXTBEE_API_KEY = apiKey;
  process.env.TEXTBEE_DEVICE_ID = deviceId;
  t.after(() => {
    if (previous.apiKey === undefined) delete process.env.TEXTBEE_API_KEY;
    else process.env.TEXTBEE_API_KEY = previous.apiKey;
    if (previous.deviceId === undefined) delete process.env.TEXTBEE_DEVICE_ID;
    else process.env.TEXTBEE_DEVICE_ID = previous.deviceId;
  });
}

test("sendSMS posts the recipient, message, and configured device to Textbee", async (t) => {
  setTextbeeEnvironment(t);
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ smsBatchId: "batch-123" }), { status: 200 });
  });

  const result = await sendSMS("+919876543210", "Your Heal Spot verification code is 123456.");

  assert.equal(result.smsBatchId, "batch-123");
  assert.equal(request.url, "https://api.textbee.dev/api/v1/gateway/send-sms");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["x-api-key"], "test-api-key");
  assert.deepEqual(JSON.parse(request.options.body), {
    recipients: ["+919876543210"],
    message: "Your Heal Spot verification code is 123456.",
    deviceId: "test-device-id",
  });
});

test("checkConnection queries the Textbee device endpoint", async (t) => {
  setTextbeeEnvironment(t);
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ data: [{ _id: "test-device-id", enabled: true }] }), {
      status: 200,
    });
  });

  const result = await checkConnection();

  assert.deepEqual(result.data, [{ _id: "test-device-id", enabled: true }]);
  assert.equal(request.url, "https://api.textbee.dev/api/v1/gateway/devices");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers["x-api-key"], "test-api-key");
});

test("Textbee HTTP errors reject without exposing response bodies", async (t) => {
  setTextbeeEnvironment(t);
  t.mock.method(globalThis, "fetch", async () => new Response("private provider response", { status: 401 }));

  await assert.rejects(sendSMS("+919876543210", "Test message"), {
    name: "TextbeeError",
    message: "Textbee API rejected the request (HTTP 401).",
    status: 401,
  });
});

test("checkConnection fails clearly when the API key is missing", async (t) => {
  setTextbeeEnvironment(t, { apiKey: "", deviceId: "" });

  await assert.rejects(checkConnection(), /TEXTBEE_API_KEY is not configured/);
});
