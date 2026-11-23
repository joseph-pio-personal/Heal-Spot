import nodemailer from "nodemailer";

export function createEmailService({ env = process.env, transportFactory = nodemailer.createTransport } = {}) {
  const port = Number(env.SMTP_PORT);
  const configuration = {
    host: env.SMTP_HOST?.trim(),
    port,
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER?.trim(),
    password: env.SMTP_PASS,
    from: env.MAIL_FROM?.trim(),
  };
  const configured = Boolean(
    configuration.host
    && Number.isInteger(port)
    && port > 0
    && port <= 65535
    && configuration.user
    && configuration.password
    && configuration.from,
  );
  let transporter;

  return {
    configured,
    async sendMessage(message) {
      if (!configured) {
        const error = new Error("SMTP email delivery is not configured.");
        error.code = "EMAIL_NOT_CONFIGURED";
        throw error;
      }
      transporter ??= transportFactory({
        host: configuration.host,
        port: configuration.port,
        secure: configuration.secure,
        auth: { user: configuration.user, pass: configuration.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      return transporter.sendMail({
        from: configuration.from,
        ...message,
      });
    },
  };
}

export const emailService = createEmailService();
