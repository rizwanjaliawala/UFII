/** Distinguishes "Neon is down" from "this network blocks Postgres". */
import "dotenv/config";
import net from "node:net";
import dns from "node:dns/promises";

const host = new URL(process.env.DATABASE_URL!).hostname;

async function tcp(port: number): Promise<string> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const started = Date.now();
    socket.setTimeout(12_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(`OPEN (${Date.now() - started}ms)`);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(`TIMEOUT after ${Date.now() - started}ms`);
    });
    socket.once("error", (error) => {
      socket.destroy();
      resolve(`ERROR ${(error as NodeJS.ErrnoException).code}`);
    });
    socket.connect(port, host);
  });
}

const main = async () => {
  console.log("host:", host);
  try {
    const addresses = await dns.resolve4(host);
    console.log("DNS :", addresses.join(", "));
  } catch (error) {
    console.log("DNS : FAILED —", (error as Error).message);
    return;
  }

  // 443 is what the CSV reader already uses successfully; 5432 is Postgres.
  // If 443 opens and 5432 does not, the port is blocked locally.
  console.log("5432:", await tcp(5432));
  console.log("443 :", await tcp(443));
};

main();
