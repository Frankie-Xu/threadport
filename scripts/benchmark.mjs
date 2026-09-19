import { fork,execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  appendFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir, cpus, totalmem, platform, arch, release, loadavg, freemem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { validateSearchTimings } from "./benchmark-validation.mjs";
const script = fileURLToPath(import.meta.url);
if (process.argv[2] === "--worker") {
  const {profileSearch}=await import("./benchmark-profile.mjs");profileSearch(value=>process.send?.(value));
  const { startLocalServer } = await import("../dist/src/server/app.js");
  const server = await startLocalServer({ dataDir: process.argv[3] });
  let cpu = process.cpuUsage(),
    time = performance.now();
  const sample = () => {
    const next = process.cpuUsage(),
      now = performance.now();
    process.send?.({
      metric: true,
      rss: Math.max(
        process.memoryUsage().rss,
        process.resourceUsage().maxRSS * 1024,
      ),
      cpu:
        (100 * (next.user - cpu.user + next.system - cpu.system)) /
        ((now - time) * 1000),
    });
    cpu = next;
    time = now;
  };
  const timer = setInterval(sample, 250);
  process.send?.({ ready: true, origin: server.origin, token: server.token });
  const close = async () => {
    clearInterval(timer);
    await server.close();
    sample();
    process.exit(0);
  };
  process.on("message", (message) => {
    if (message === "close") void close();
  });
  process.on("disconnect", () => void close());
} else {
  const base = await realpath(
      await mkdtemp(join(tmpdir(), "threadport-benchmark-")),
    ),
    dataDir = join(base, "data"),
    logs = join(base, "logs");
  await mkdir(logs);
  let child;
  let peak = 0,
    idle = false,
    idleCpu = [];
  let phase = "generation";
  const searchTimings=[],responseTimings=[],loadSamples=[];
  const loadTimer=setInterval(()=>loadSamples.push({at:new Date().toISOString(),phase,loadavg:loadavg(),freeMiB:freemem()/1024**2}),5000);
  loadTimer.unref();
  const sourceCommit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const trackedChanges=!!execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"}).trim();
  const percentile = (values, p) =>
    [...values].sort((a, b) => a - b)[
      Math.max(0, Math.ceil(values.length * p) - 1)
    ] ?? null;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function start() {
    const began = performance.now();
    child = fork(script, ["--worker", dataDir], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    const current = child;
    let stderr = "";
    current.stderr.on("data", (data) => {
      stderr += data;
    });
    current.on("message", (value) => {
      if(value.searchTiming){
        const sample={phase,...value.searchTiming};
        searchTimings.push(sample);
      }
      if (value.metric) {
        peak = Math.max(peak, value.rss);
        if (idle) idleCpu.push(value.cpu);
      }
    });
    const ready = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        current.kill();
        reject(new Error("Service startup timeout"));
      }, 30000);
      current.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      current.once("exit", (code) => {
        clearTimeout(timeout);
        reject(
          new Error("Service exited " + code + ": " + stderr.slice(0, 200)),
        );
      });
      current.on("message", (value) => {
        if (value.ready) {
          clearTimeout(timeout);
          resolve(value);
        }
      });
    });
    return { ...ready, began };
  }
  async function close() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const current = child,
      exited = once(current, "exit");
    if (current.connected) current.send("close");
    else current.kill();
    const timer = setTimeout(() => current.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(timer);
  }
  let connection;
  async function request(path, method = "GET", body) {
    const began=performance.now();
    const response = await fetch(connection.origin + "/api/v1" + path, {
      method,
      headers: {
        authorization: "Bearer " + connection.token,
        ...(method === "GET" ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const received=performance.now();
    const value = await response.json();
    if(phase==="search"||phase==="browser-search")responseTimings.push({phase,headersMs:received-began,jsonMs:performance.now()-received,totalMs:performance.now()-began});
    if (!response.ok)
      throw new Error(
        "API " + response.status + " " + (value.error?.code ?? ""),
      );
    return value;
  }
  async function finished(job) {
    const deadline = performance.now() + 180000;
    while (performance.now() < deadline) {
      const value = (await request("/index-jobs/" + job)).data.progress;
      if (value.every((p) => !["queued", "running"].includes(p.state)))
        return value;
      await delay(20);
    }
    throw new Error("Index job timeout");
  }
  try {
    const sessions = 500,
      events = 50000,
      bytes = 200 * 1024 * 1024,
      perLine = Math.floor(bytes / events),
      extra = bytes % events;
    let generated = 0;
    for (let s = 0; s < sessions; s++) {
      const rows = [];
      for (let e = 0; e < 100; e++) {
        const ordinal = s * 100 + e,
          row = {
            type: "user",
            sessionId: "00000000-0000-4000-8000-" + String(s).padStart(12, "0"),
            timestamp: "2026-01-01T00:00:00.000Z",
            message: {
              role: "user",
              content: `benchmark 中文 session${s} event${e} `,
            },
          };
        const budget = perLine + (ordinal < extra ? 1 : 0),
          padding = budget - Buffer.byteLength(JSON.stringify(row) + "\n");
        row.message.content += "x".repeat(padding);
        const line = JSON.stringify(row) + "\n";
        generated += Buffer.byteLength(line);
        rows.push(line);
      }
      await writeFile(join(logs, String(s) + ".jsonl"), rows.join(""));
    }
    if (generated !== bytes) throw new Error("Generator byte count mismatch");
    phase = "indexing";
    connection = await start();
    const source = (
      await request("/sources", "POST", { agent: "claude", root: logs })
    ).data;
    const started = performance.now(),
      job = (await request("/index-jobs", "POST", { sourceIds: [source.id] }))
        .data.jobId;
    const statusTimes = [];
    for (let i = 0; i < 100; i++) {
      const time = performance.now();
      await request("/status");
      statusTimes.push(performance.now() - time);
      await delay(10);
    }
    const progress = await finished(job),
      indexMs = performance.now() - started,
      counts = (await request("/status")).data.counts;
    if (
      counts.sessions !== sessions ||
      (await request("/status")).data.capacity.events !== events
    )
      throw new Error("Fixed dataset was not fully indexed");
    phase = "task-creation";
    const project = (
      await request("/workspaces", "POST", { root: logs, confirmBinding: true })
    ).data.projectId;
    let cursor;
    do {
      const page = await request(
        "/sessions/unassigned?limit=100" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      for (const session of page.data)
        await request("/tasks", "POST", {
          projectId: project,
          title: "Benchmark " + session.id,
          sessionId: session.id,
        });
      cursor = undefined; // Attachment invalidates cursors: consume the first remaining page.
      if (page.data.length === 0) break;
    } while (true);
    phase = "search";
    const queries = [
      "中文",
      "benchmark",
      "absent-needle",
      "中文 event99",
      "session499",
      "中文 absent-needle",
      "event0",
      "BENCHMARK 中文",
      "session250 event50",
      "xxx",
    ];
    const queryTimes = [];
    for (let i = 0; i < 100; i++) {
      const time = performance.now();
      await request(
        "/sessions?q=" + encodeURIComponent(queries[i % queries.length]),
      );
      queryTimes.push(performance.now() - time);
    }
    const browserTimes = [];
    if (process.argv.includes("--browser")) {
      phase = "browser-search";
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({
        headless: true,
        ...(process.env.THREADPORT_TEST_CHROME ? { channel: "chrome" } : {}),
      });
      try {
        const page = await browser.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(connection.origin + "/#token=" + connection.token);
        const search = page.getByRole("searchbox", { name: "Search history" });
        await search.waitFor();
        for (let i = 0; i < 100; i++) {
          const term = queries[i % queries.length];
          await search.fill(term);
          const response = page.waitForResponse(response => {
            const url = new URL(response.url());
            return url.pathname === "/api/v1/sessions" && url.searchParams.get("q") === term;
          });
          await page.evaluate(() => { window.__searchStarted = performance.now(); });
          await search.press("Enter");
          if (!(await response).ok()) throw new Error("Browser search failed");
          await page.getByText("Searching history…", { exact: true }).waitFor({ state: "hidden" });
          await page.locator("article.panel, .empty").first().waitFor();
          browserTimes.push(await page.evaluate(() => new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - window.__searchStarted)));
          })));
        }
      } finally { await browser.close(); }
    }
    phase = "incremental";
    const currentEvents = (await request("/status")).data.capacity.events,
      incrementStarted = performance.now();
    const additions = Array.from(
      { length: 20 },
      (_, i) =>
        JSON.stringify({
          type: "user",
          sessionId: "00000000-0000-4000-8000-000000000000",
          timestamp: "2026-01-02T00:00:00.000Z",
          message: { role: "user", content: "increment 中文 " + i },
        }) + "\n",
    ).join("");
    await appendFile(join(logs, "0.jsonl"), additions);
    while (
      (await request("/status")).data.capacity.events <
      currentEvents + 20
    ) {
      if (performance.now() - incrementStarted > 30000)
        throw new Error("Incremental visibility timeout");
      await delay(100);
    }
    const incrementMs = performance.now() - incrementStarted;
    phase = "idle";
    idleCpu = [];
    idle = true;
    await delay(3000);
    idle = false;
    // Cancel a scan of the fixed full source, using a separate new source identity and data projection.
    phase = "cancel";
    const cancelSource = (
        await request("/sources", "POST", { agent: "codex", root: logs })
      ).data,
      cancelJob = (
        await request("/index-jobs", "POST", { sourceIds: [cancelSource.id] })
      ).data.jobId;
    await delay(30);
    const cancelStarted = performance.now();
    await request("/index-jobs/" + cancelJob, "DELETE");
    const cancelled = await finished(cancelJob),
      cancelMs = performance.now() - cancelStarted;
    await request("/sources/" + cancelSource.id, "DELETE", {
      confirmation: true,
    });
    await close();
    const cold = [];
    phase = "cold-start";
    for (let i = 0; i < 5; i++) {
      connection = await start();
      await request("/tasks?limit=20");
      cold.push(performance.now() - connection.began);
      await close();
    }
    const metrics = {
      indexMs,
      searchP95Ms: percentile(queryTimes, 0.95),
      ...(process.argv.includes("--browser") ? { browserSearchP95Ms: percentile(browserTimes, 0.95) } : {}),
      statusP95Ms: percentile(statusTimes, 0.95),
      coldP95Ms: percentile(cold, 0.95),
      incrementMs,
      peakRssMiB: peak / 1024 / 1024,
      idleCpuMedianPercent: percentile(idleCpu, 0.5),
      cancelMs,
    };
    const expectedSearchTimings=process.argv.includes("--browser")?200:100;
    const profileValidation={...validateSearchTimings(searchTimings,expectedSearchTimings),phases:Object.fromEntries([...new Set(searchTimings.map(sample=>sample.phase))].map(name=>[name,searchTimings.filter(sample=>sample.phase===name).length]))};
    const limits = {
      indexMs: 60000,
      searchP95Ms: 300,
      ...(process.argv.includes("--browser") ? { browserSearchP95Ms: 500 } : {}),
      statusP95Ms: 200,
      coldP95Ms: 3000,
      incrementMs: 20000,
      peakRssMiB: 400,
      idleCpuMedianPercent: 2,
      cancelMs: 2000,
    };
    const failed = Object.keys(limits).filter(
      (key) => metrics[key] === null || metrics[key] > limits[key],
    );
    if(!profileValidation.valid)failed.push("profileTimingIncomplete");
    if (progress.some((p) => p.state !== "completed"))
      failed.push("incompleteIndex");
    if (cancelled.some((p) => p.state !== "cancelled"))
      failed.push("cancellationNotObserved");
    if (failed.length) process.exitCode = 1;
    console.log(
      JSON.stringify(
        {
          schema: "threadport.benchmark.v1",
          sourceCommit,trackedChanges,
          at: new Date().toISOString(),
          machine: {
            os: platform(),
            release: release(),
            arch: arch(),
            cpu: cpus()[0]?.model,
            cores: cpus().length,
            memoryGiB: totalmem() / 1024 ** 3,
            node: process.version,
          },
          dataset: {
            bytes,
            sessions,
            events,
            queries: 100,
            statusRequests: 100,
            coldStarts: 5,
          },
          metrics,
          limits,
          failed,
          decision: failed.length ? "hold" : "pass",
          indexStates: progress.map((p) => p.state),
          cancelStates: cancelled.map((p) => p.state),
          profile:{searchTimings,responseTimings,loadSamples,validation:profileValidation},
          samples: { queries: queryTimes, browser: browserTimes, status: statusTimes, cold, idleCpu },
          limitations: [
            process.argv.includes("--browser") ? "Synthetic browser latency includes Playwright scheduling and two animation frames after results render; conservative visible-latency observation." : "Synthetic evidence only. Browser UI latency is not measured by this API benchmark.",
            "RSS uses the service child high-water mark; generator memory is excluded.",
          ],
        },
        null,
        2,
      ),
    );
  } catch {
    console.log(
      JSON.stringify(
        {
          schema: "threadport.benchmark.v1",
          sourceCommit,trackedChanges,
          at: new Date().toISOString(),
          decision: "hold",
          stage: phase,
          error: { code: "BENCHMARK_INCOMPLETE" },
          machine: {
            os: platform(),
            arch: arch(),
            cpu: cpus()[0]?.model,
            cores: cpus().length,
            memoryGiB: totalmem() / 1024 ** 3,
            node: process.version,
          },
          limitations: [
            "The fixed dataset did not complete this phase within its deadline. No passing metrics are inferred.",
          ],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await close();
    await rm(base, { recursive: true, force: true });
  }
}
