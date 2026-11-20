import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

try {
  const { checkConnection } = await import("./services/textbee-test.service.js");
  const result = await checkConnection();
  console.log("Textbee connection successful!");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Textbee connection failed:", error.message);
  process.exitCode = 1;
}
