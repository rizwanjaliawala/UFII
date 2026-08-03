/** Checks whether HTTPS egress reaches Neon, since raw DNS is refused here. */
import "dotenv/config";

const host = new URL(process.env.DATABASE_URL!).hostname;

async function probe(label: string, url: string): Promise<void> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
    });
    console.log(`${label}: HTTP ${response.status} (${Date.now() - started}ms)`);
  } catch (error) {
    console.log(`${label}: FAILED — ${(error as Error).message}`);
  }
}

const main = async () => {
  await probe("google sheets (known good)", "https://docs.google.com/robots.txt");
  await probe("neon host over 443     ", `https://${host}/`);
  await probe("neon api               ", "https://console.neon.tech/api/v2/");
};

main();
