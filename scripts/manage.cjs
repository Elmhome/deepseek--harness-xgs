"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const ROOT = path.resolve(__dirname, "..");
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
  catch (error) { if (error.code === "ENOENT" && fallback !== undefined) return fallback; throw error; }
}
function writeJSON(file, data) {
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (before !== null && JSON.stringify(JSON.parse(before.replace(/^\uFEFF/, ""))) === JSON.stringify(data)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = before === null ? 0o600 : fs.statSync(file).mode & 0o777;
  if (before !== null) {
    const backup = file + ".xgs-backup-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex");
    fs.copyFileSync(file, backup);
    fs.chmodSync(backup, mode);
    console.log("已备份：" + backup);
  }
  const temporary = file + ".xgs-" + crypto.randomBytes(6).toString("hex");
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", { mode });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function canonical(file) { try { return fs.realpathSync(file); } catch { return path.resolve(file); } }
function object(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(description + " 必须是对象");
  return value;
}

const { spawnSync } = require("node:child_process");
function main() {
  const action = process.argv[2] || "check";
  if (!["check", "install", "uninstall"].includes(action)) throw new Error("未知操作：" + action);
  const profile = process.env.DSH_PROFILE || "desktop";
  if (!/^[A-Za-z0-9_-]+$/.test(profile)) throw new Error("DSH_PROFILE 名称无效");
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const directory = path.join(home, "profiles", profile);
  const file = path.join(directory, "package.json");
  if (!fs.existsSync(file)) throw new Error("请先打开 DeepSeek Harness 初始化 " + profile + " profile，再完全退出应用后安装。");
  const data = object(readJSON(file), "profile package.json");
  const dependencies = object(data.dependencies || {}, "dependencies");
  const options = object(data.dsh || {}, "dsh");
  const settings = object(options.profile || {}, "dsh.profile");
  const bundles = settings.bundles || [];
  if (!Array.isArray(bundles) || bundles.some(name => typeof name !== "string")) throw new Error("dsh.profile.bundles 必须是数组");
  if (action === "check") {
    console.log("配置可读取：" + file);
    console.log("插件：xgs；身份：小怪兽；用户称呼：Elmhome");
    return;
  }
  const link = "link:" + ROOT;
  const existing = dependencies.xgs;
  if (existing && (typeof existing !== "string" || !existing.startsWith("link:") || canonical(path.resolve(directory, existing.slice(5))) !== canonical(ROOT))) {
    throw new Error("此 profile 已有其他来源的 xgs 包，未覆盖。请先检查 " + file);
  }
  if (action === "uninstall" && !existing && !bundles.includes("xgs")) {
    console.log("当前 profile 未安装 XGS，无需卸载。"); return;
  }
  const modulePath = path.join(directory, "node_modules", "xgs");
  const linked = existing && canonical(modulePath) === canonical(ROOT);
  const cli = process.env.DSH_CLI || "dsh";
  if ((action === "install" && !linked) || (action === "uninstall" && existing)) {
    // The Desktop CLI owns its pnpm runtime and profile lock. This plugin only
    // uses Node built-ins, so a local link needs no registry downloads.
    const before = fs.readFileSync(file);
    const backup = file + ".xgs-backup-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex");
    fs.copyFileSync(file, backup);
    console.log("已备份：" + backup);
    const args = action === "install" ? ["add", "--offline", link] : ["remove", "xgs"];
    const result = spawnSync(cli, ["plugin", "--profile", profile, ...args], { cwd: ROOT, env: process.env, stdio: "inherit" });
    if (result.error || result.status !== 0) {
      fs.writeFileSync(file, before);
      throw result.error || new Error("插件包管理失败，已还原 package.json；请查看上面的错误。");
    }
  }
  const current = object(readJSON(file), "profile package.json");
  current.dsh = object(current.dsh || {}, "dsh");
  current.dsh.profile = object(current.dsh.profile || {}, "dsh.profile");
  const currentBundles = current.dsh.profile.bundles || [];
  current.dsh.profile.bundles = action === "install"
    ? (currentBundles.includes("xgs") ? currentBundles : [...currentBundles, "xgs"])
    : currentBundles.filter(name => name !== "xgs");
  writeJSON(file, current);
  console.log(action === "install" ? "XGS 已安装到 " + profile + " profile。请完全退出应用后重开，新建对话生效。" : "已卸载 XGS，其他依赖和 profile 设置保留。请重启应用。");
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
