import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Run explicitly in a disposable sandbox, never at each OMP session startup.
const session = `paseo-browser-check-${process.pid}`;
const artifacts = mkdtempSync(join(tmpdir(), "paseo-browser-check-"));
const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<!doctype html><title>Paseo browser check</title>
    <button onclick="document.querySelector('p').textContent='Browser OK'">Check browser</button>
    <p>Not checked</p>`);
});

function browser(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("agent-browser", ["--session", session, "--json", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 45_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(`Browser ${args[0]} failed: ${stderr || stdout}`));
      try {
        const result = JSON.parse(stdout);
        assert.equal(result.success, true, JSON.stringify(result));
        resolve(result.data);
      } catch (error) {
        reject(error);
      }
    });
  });
}

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  await browser(["open", `http://127.0.0.1:${server.address().port}`]);
  const snapshot = await browser(["snapshot", "-i"]);
  assert.match(snapshot.snapshot, /Check browser/);
  await browser(["find", "role", "button", "click", "--name", "Check browser"]);
  assert.match(JSON.stringify(await browser(["get", "text", "p"])), /Browser OK/);
  const screenshot = join(artifacts, "browser.png");
  await browser(["screenshot", screenshot]);
  assert.equal(readFileSync(screenshot).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  console.log("PASS: Chromium launch, snapshot, JavaScript interaction, and PNG screenshot.");

  const httpsUrl = process.argv[2];
  if (httpsUrl) {
    assert.equal(new URL(httpsUrl).protocol, "https:");
    assert.notEqual(process.env.AGENT_BROWSER_IGNORE_HTTPS_ERRORS, "true");
    await browser(["open", httpsUrl]);
    console.log("PASS: HTTPS navigation with certificate validation enabled.");
  }
} finally {
  await browser(["close"]).catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  rmSync(artifacts, { recursive: true, force: true });
}
