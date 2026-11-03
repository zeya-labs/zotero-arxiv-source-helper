// SPDX-License-Identifier: AGPL-3.0-or-later
var helperContext;
var activeDockerProcesses = new Set();
function install() {}
function uninstall() {}
async function dockerExecutable() {
  const { Subprocess } = ChromeUtils.importESModule(
    "resource://gre/modules/Subprocess.sys.mjs",
  );
  const configured = Zotero.Prefs.get(
    "extensions.arxivSourceHelper.dockerPath",
    true,
  );
  if (configured) {
    if (!(await IOUtils.exists(configured)))
      throw new Error("Docker 路径不存在，请检查插件配置");
    return { Subprocess, command: configured };
  }
  try {
    return { Subprocess, command: await Subprocess.pathSearch("docker") };
  } catch {}
  if (Zotero.isWin) {
    const command = PathUtils.join(
      Subprocess.getEnvironment().ProgramFiles || "C:/Program Files",
      "Docker",
      "Docker",
      "resources",
      "bin",
      "docker.exe",
    );
    if (await IOUtils.exists(command)) return { Subprocess, command };
  }
  throw new Error("未找到 Docker，请安装并启动 Docker Desktop");
}
async function runDocker(arguments_, options = {}) {
  const { Subprocess, command } = await dockerExecutable();
  const process = await Subprocess.call({
    command,
    arguments: arguments_,
    workdir: options.workdir,
    stderr: "stdout",
  });
  const task = { process, name: options.containerName };
  activeDockerProcesses.add(task);
  let timedOut = false,
    output = "",
    timer;
  try {
    timer = setTimeout(async () => {
      timedOut = true;
      try {
        await process.kill(0);
      } catch {}
      if (task.name && /^ash-latexml-[a-z0-9-]+$/.test(task.name))
        try {
          await runDocker(["rm", "-f", task.name], { timeoutMS: 15000 });
        } catch {}
    }, options.timeoutMS || 30000);
    await process.stdin.close();
    const decoder = new TextDecoder();
    while (true) {
      const data = await process.stdout.read();
      if (!data.byteLength) break;
      output += decoder.decode(data, { stream: true });
      if (output.length > 8 * 1024 * 1024)
        output = output.slice(-8 * 1024 * 1024);
    }
    output += decoder.decode();
    const { exitCode } = await process.wait();
    return { exitCode, stdout: output, timedOut };
  } catch (error) {
    if (timedOut)
      return {
        exitCode: -1,
        stdout: output + "\nDocker process timed out",
        timedOut: true,
      };
    throw error;
  } finally {
    clearTimeout(timer);
    activeDockerProcesses.delete(task);
  }
}
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  helperContext = new Components.utils.Sandbox(
    Services.scriptSecurityManager.getSystemPrincipal(),
    { sandboxName: "arxiv-source-helper-runtime" },
  );
  Object.assign(helperContext, {
    Zotero,
    Services,
    ChromeUtils,
    rootURI,
    IOUtils,
    PathUtils,
    TextDecoder,
    TextEncoder,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    btoa,
    atob,
    runDocker,
  });
  Services.scriptloader.loadSubScript(rootURI + "runtime.js", helperContext);
  await helperContext.ArxivSourceHelperRuntime.default.startup();
}
function onMainWindowLoad({ window }) {
  helperContext?.ArxivSourceHelperRuntime?.default.addWindow(window);
}
function onMainWindowUnload({ window }) {
  helperContext?.ArxivSourceHelperRuntime?.default.removeWindow(window);
}
async function shutdown() {
  await helperContext?.ArxivSourceHelperRuntime?.default.shutdown();
  const tasks = [...activeDockerProcesses];
  await Promise.allSettled(
    tasks.map(async (task) => {
      await task.process.kill(0);
      if (task.name && /^ash-latexml-[a-z0-9-]+$/.test(task.name))
        await runDocker(["rm", "-f", task.name], { timeoutMS: 15000 });
    }),
  );
  helperContext = null;
}
