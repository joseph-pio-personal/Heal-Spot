import assert from "node:assert/strict";
import test from "node:test";
import { createEmailService } from "../src/notifications/email.js";

const smtpEnvironment = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "alanjude006@gmail.com",
  SMTP_PASS: "test-app-password",
  MAIL_FROM: "Heal Spot <alanjude006@gmail.com>",
};

test("email service uses configured SMTP credentials and sender", async () => {
  let transportOptions;
  let message;
  const service = createEmailService({
    env: smtpEnvironment,
    transportFactory: (options) => {
      transportOptions = options;
      return {
        sendMail: async (value) => {
          message = value;
          return { messageId: "test-message-id" };
        },
      };
    },
  });

  const result = await service.sendMessage({
    to: "patient@example.com",
    subject: "Heal Spot test",
    text: "This is a test message.",
  });

  assert.equal(result.messageId, "test-message-id");
  assert.equal(transportOptions.auth.user, "alanjude006@gmail.com");
  assert.equal(transportOptions.auth.pass, "test-app-password");
  assert.equal(message.from, "Heal Spot <alanjude006@gmail.com>");
  assert.equal(message.to, "patient@example.com");
  assert.equal(message.subject, "Heal Spot test");
  assert.equal(message.text, "This is a test message.");
});

test("email service reports missing SMTP configuration", async () => {
  let transportCreated = false;
  const service = createEmailService({
    env: {},
    transportFactory: () => {
      transportCreated = true;
      throw new Error("Transport should not be created.");
    },
  });

  await assert.rejects(
    service.sendMessage({ to: "patient@example.com", subject: "Test", text: "Test" }),
    (error) => error.code === "EMAIL_NOT_CONFIGURED",
  );
  assert.equal(transportCreated, false);
});
