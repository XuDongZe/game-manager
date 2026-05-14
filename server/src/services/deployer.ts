import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import db from "../db";
import logger from "./logger";
import { Response } from "express";

const REPOS_ROOT = process.env.REPOS_ROOT ?? "/opt/repos";
const WWW_ROOT   = process.env.WWW_ROOT   ?? "/opt/www";

const ALLOWED_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".ts",
  ".json", ".wasm",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".mp3", ".ogg", ".wav", ".mp4", ".webm",
  ".woff", ".woff2", ".ttf", ".eot",
  ".txt", ".xml", ".map",
]);

const MAX_UNZIPPED_BYTES = 500 * 1024 * 1024;

type SsePush = (line: string) => void;

function send(sse: SsePush, line: string) {
  logger.info(line);
  sse(line);
}

export function sanitizeName(name: string): string {
  const result = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return result || "user";
}

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function validateExtractedFiles(dir: string): void {
  let totalSize = 0;

  function walk(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.name.includes("..")) {
        throw new Error(`路径穿越检测：${entry.name}`);
      }

      if (entry.isDirectory()) {
        walk(full);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          throw new Error(`不允许的文件类型：${entry.name}`);
        }
        const { size } = fs.statSync(full);
        totalSize += size;
        if (totalSize > MAX_UNZIPPED_BYTES) {
          throw new Error(`解压后总体积超过 500MB 限制`);
        }
      }
    }
  }

  walk(dir);
}

function getOrCreateGame(userId: string, gameName: string, displayName: string): {
  gameId: string;
  repoPath: string;
  wwwPath: string;
  isNew: boolean;
} {
  const safeUser = sanitizeName(userId);
  const safeGame = sanitizeName(gameName);
  const gameId   = `${safeUser}/${safeGame}`;
  const repoPath = path.join(REPOS_ROOT, safeUser, `${safeGame}.git`);
  const wwwPath  = path.join(WWW_ROOT,   safeUser, safeGame);

  const existing = db.prepare("SELECT id FROM games WHERE id = ?").get(gameId);
  if (existing) {
    return { gameId, repoPath, wwwPath, isNew: false };
  }

  fs.mkdirSync(repoPath, { recursive: true });
  fs.mkdirSync(path.join(wwwPath, "live"), { recursive: true });
  exec(`git init --bare "${repoPath}"`);

  db.prepare(`
    INSERT INTO games (id, name, user_name, repo_path, www_path)
    VALUES (?, ?, ?, ?, ?)
  `).run(gameId, displayName || gameName, userId, repoPath, path.join(wwwPath, "live"));

  return { gameId, repoPath, wwwPath, isNew: true };
}

function getNextVersion(gameId: string): number {
  const row = db.prepare(
    "SELECT COALESCE(MAX(version_num), 0) as max_v FROM versions WHERE game_id = ?"
  ).get(gameId) as { max_v: number };
  return row.max_v + 1;
}

export async function deploy(
  userId: string,
  gameName: string,
  extractedDir: string,
  sse: SsePush,
  displayName?: string
): Promise<void> {
  const stagingDir = path.join("/tmp", `deploy-${uuidv4()}`);
  let versionId: number | null = null;

  try {
    send(sse, `开始部署：${userId}/${gameName}`);

    send(sse, "校验文件安全性...");
    validateExtractedFiles(extractedDir);
    send(sse, "文件校验通过");

    const { gameId, repoPath, wwwPath, isNew } = getOrCreateGame(userId, gameName, displayName ?? "");
    if (isNew) send(sse, `新游戏，已初始化 Git 仓库：${repoPath}`);

    const versionNum = getNextVersion(gameId);
    const gitTag     = `v${versionNum}`;
    send(sse, `版本号：${gitTag}`);

    send(sse, "复制文件到暂存目录...");
    fs.mkdirSync(stagingDir, { recursive: true });
    exec(`rsync -a --delete "${extractedDir}/" "${stagingDir}/"`);

    send(sse, "提交到 Git 仓库...");
    const workTree = path.join("/tmp", `worktree-${uuidv4()}`);
    fs.mkdirSync(workTree, { recursive: true });

    try {
      exec(`git --git-dir="${repoPath}" --work-tree="${workTree}" checkout -f HEAD -- .`);
    } catch {
      /* 首次部署无 HEAD，忽略 */
    }

    exec(`rsync -a --delete "${stagingDir}/" "${workTree}/"`);
    exec(`git --git-dir="${repoPath}" --work-tree="${workTree}" add -A`);

    const hasChanges = (() => {
      try {
        exec(`git --git-dir="${repoPath}" --work-tree="${workTree}" diff --cached --quiet`);
        return false;
      } catch {
        return true;
      }
    })();

    const now = new Date().toISOString();
    if (hasChanges) {
      exec(`git --git-dir="${repoPath}" --work-tree="${workTree}" commit -m "${gitTag} by ${userId} at ${now}"`);
    }
    const commitHash = exec(`git --git-dir="${repoPath}" log -1 --format="%H"`);

    exec(`git --git-dir="${repoPath}" tag -f "${gitTag}"`);
    send(sse, `Git commit：${commitHash.slice(0, 12)} (${gitTag})`);

    const fileSizeKb = Math.ceil(
      parseInt(exec(`du -sk "${stagingDir}" | cut -f1`), 10)
    );

    versionId = Number(
      db.prepare(`
        INSERT INTO versions (game_id, version_num, commit_hash, git_tag, deployed_by, status, file_size_kb)
        VALUES (?, ?, ?, ?, ?, 'deploying', ?)
      `).run(gameId, versionNum, commitHash.slice(0, 40), gitTag, userId, fileSizeKb).lastInsertRowid
    );

    send(sse, "原子替换 live 目录...");
    const livePath = path.join(wwwPath, "live");
    fs.mkdirSync(livePath, { recursive: true });
    exec(`rsync -a --delete "${stagingDir}/" "${livePath}/"`);
    send(sse, "live 目录更新完成");

    db.prepare("UPDATE versions SET status = 'live' WHERE id = ?").run(versionId);

    send(sse, `✓ 部署成功：/games/${gameId}/`);
    fs.rmSync(workTree, { recursive: true, force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`部署失败 [${userId}/${gameName}]：${msg}`);
    send(sse, `✗ 部署失败：${msg}`);

    if (versionId !== null) {
      db.prepare("UPDATE versions SET status = 'failed' WHERE id = ?").run(versionId);
    }
    throw err;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(extractedDir, { recursive: true, force: true });
  }
}

export async function rollback(
  gameId: string,
  targetVersionNum: number,
  operatorId: string,
  sse: SsePush
): Promise<void> {
  const stagingDir = path.join("/tmp", `rollback-${uuidv4()}`);

  try {
    send(sse, `开始回滚：${gameId} → v${targetVersionNum}`);

    const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId) as {
      repo_path: string; www_path: string;
    } | undefined;
    if (!game) throw new Error(`游戏不存在：${gameId}`);

    const targetVersion = db.prepare(
      "SELECT * FROM versions WHERE game_id = ? AND version_num = ?"
    ).get(gameId, targetVersionNum) as { git_tag: string } | undefined;
    if (!targetVersion) throw new Error(`版本 v${targetVersionNum} 不存在`);

    send(sse, `checkout ${targetVersion.git_tag}...`);
    fs.mkdirSync(stagingDir, { recursive: true });

    exec(
      `git --git-dir="${game.repo_path}" --work-tree="${stagingDir}" checkout "${targetVersion.git_tag}" -- .`
    );

    const newVersionNum = getNextVersion(gameId);
    const gitTag        = `v${newVersionNum}`;

    const workTree = path.join("/tmp", `worktree-${uuidv4()}`);
    fs.mkdirSync(workTree, { recursive: true });

    try {
      exec(`git --git-dir="${game.repo_path}" --work-tree="${workTree}" checkout -f HEAD -- .`);
    } catch { /* 忽略 */ }

    exec(`rsync -a --delete "${stagingDir}/" "${workTree}/"`);
    exec(`git --git-dir="${game.repo_path}" --work-tree="${workTree}" add -A`);

    const now = new Date().toISOString();
    try {
      exec(`git --git-dir="${game.repo_path}" --work-tree="${workTree}" commit -m "${gitTag} rollback to v${targetVersionNum} by ${operatorId} at ${now}"`);
    } catch (_) { }
    const commitHash = exec(`git --git-dir="${game.repo_path}" log -1 --format="%H"`);

    exec(`git --git-dir="${game.repo_path}" tag -f "${gitTag}"`);

    const versionId = Number(
      db.prepare(`
        INSERT INTO versions (game_id, version_num, commit_hash, git_tag, deployed_by, status, is_rollback, rollback_to)
        VALUES (?, ?, ?, ?, ?, 'deploying', TRUE, ?)
      `).run(gameId, newVersionNum, commitHash.slice(0, 40), gitTag, operatorId, targetVersionNum).lastInsertRowid
    );

    send(sse, "原子替换 live 目录...");
    exec(`rsync -a --delete "${stagingDir}/" "${game.www_path}/"`);
    send(sse, "live 目录更新完成");

    db.prepare("UPDATE versions SET status = 'live' WHERE id = ?").run(versionId);
    db.prepare(
      "UPDATE versions SET status = 'rolled_back' WHERE game_id = ? AND status = 'live' AND id != ?"
    ).run(gameId, versionId);

    send(sse, `✓ 回滚成功：${gitTag}（内容来自 v${targetVersionNum}）`);
    fs.rmSync(workTree, { recursive: true, force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`回滚失败 [${gameId}]：${msg}`);
    send(sse, `✗ 回滚失败：${msg}`);
    throw err;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
