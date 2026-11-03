// SPDX-License-Identifier: AGPL-3.0-or-later
import * as fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { prepareSource } from "../build/core.mjs";
import { convertWithLatexml, ENGINE_IMAGE } from "../build/conversion.mjs";
const argv = process.argv.slice(2),
  imageArg = argv.find((a) => a.startsWith("--image=")),
  image = imageArg?.slice(8) || ENGINE_IMAGE;
const args = argv.filter((a) => !a.startsWith("--image="));
if (args.length < 2)
  throw Error(
    "Usage: node scripts/convert.mjs SOURCE.gz OUTPUT_DIR [--image=latexml/ar5ivist@sha256:...]",
  );
if (!/^latexml\/ar5ivist@sha256:[a-f0-9]{64}$/.test(image))
  throw Error("Use a pinned official ar5ivist image digest");
const output = path.resolve(args[1]);
await fs.mkdir(output, { recursive: true });
const source = await prepareSource(new Uint8Array(await fs.readFile(args[0])));
const jobDir = path.join(output, "job-" + Date.now().toString(36));
async function runDocker(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: options.workdir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      timedOut = false;
    const receive = (data) => {
      stdout += data.toString();
      if (stdout.length > 8 * 1024 * 1024)
        stdout = stdout.slice(-8 * 1024 * 1024);
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      if (options.containerName)
        spawn("docker", ["rm", "-f", options.containerName], {
          windowsHide: true,
          stdio: "ignore",
        });
    }, options.timeoutMS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode: exitCode ?? -1, stdout, timedOut });
    });
  });
}
const host = {
  join: path.join,
  exists: async (p) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  },
  read: async (p) => new Uint8Array(await fs.readFile(p)),
  write: (p, b) => fs.writeFile(p, b),
  writeUTF8: (p, t) => fs.writeFile(p, t, "utf8"),
  makeDirectory: (p) => fs.mkdir(p, { recursive: true }),
  runDocker,
};
try {
  const result = await convertWithLatexml({
    files: source.files,
    mainFile: source.mainFile,
    jobDir,
    title: args[2] || "LaTeXML reading copy",
    arxivID: args[3] || "local-source",
    image,
    host,
  });
  await fs.copyFile(result.htmlPath, path.join(output, "reading.html"));
  await fs.writeFile(
    path.join(output, "report.json"),
    JSON.stringify({ ...result.report, jobDirectory: jobDir }, null, 2),
  );
  console.log(
    JSON.stringify({
      status: result.report.status,
      html: path.join(output, "reading.html"),
      report: path.join(output, "report.json"),
      stats: result.report.stats,
    }),
  );
} catch (error) {
  if (error.report)
    await fs.writeFile(
      path.join(output, "report.json"),
      JSON.stringify({ ...error.report, jobDirectory: jobDir }, null, 2),
    );
  console.log(
    JSON.stringify({
      status: "failed",
      message: error.message,
      report: path.join(output, "report.json"),
      jobDir,
    }),
  );
  process.exitCode = 1;
}
