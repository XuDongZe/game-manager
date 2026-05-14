import { Router, Request, Response } from "express";
import busboy from "busboy";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import unzipper from "unzipper";
import { deploy, rollback } from "../services/deployer";
import logger from "../services/logger";

const router = Router();

const deployLocks = new Map<string, boolean>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (deployLocks.get(key)) {
    return Promise.reject(new Error(`${key} 正在部署中，请稍后再试`));
  }
  deployLocks.set(key, true);
  return fn().finally(() => deployLocks.delete(key));
}

router.post("/", (req: Request, res: Response) => {
  const bb = busboy({
    headers: req.headers,
    limits: { files: 1, fileSize: 600 * 1024 * 1024 },
  });

  let userId   = "";
  let gameName = "";
  const extractedDir = path.join("/tmp", `extract-${uuidv4()}`);
  let zipPath = "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sse = (line: string) => {
    res.write(`data: ${JSON.stringify({ message: line, time: new Date().toISOString() })}\n\n`);
  };

  const done = (ok: boolean) => {
    res.write(`data: ${JSON.stringify({ done: true, ok })}\n\n`);
    res.end();
  };

  bb.on("field", (name, val) => {
    if (name === "userId")   userId   = val.trim();
    if (name === "gameName") gameName = val.trim();
  });

  bb.on("file", (_field, fileStream) => {
    zipPath = path.join("/tmp", `upload-${uuidv4()}.zip`);
    const writer = fs.createWriteStream(zipPath);
    fileStream.pipe(writer);

    writer.on("close", async () => {
      if (!userId || !gameName) {
        sse("✗ 缺少 userId 或 gameName");
        done(false);
        fs.rmSync(zipPath, { force: true });
        return;
      }

      try {
        fs.mkdirSync(extractedDir, { recursive: true });

        await new Promise<void>((resolve, reject) => {
          fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: extractedDir }))
            .on("close", resolve)
            .on("error", reject);
        });

        fs.rmSync(zipPath, { force: true });

        const entries = fs.readdirSync(extractedDir);
        let contentRoot = extractedDir;
        if (entries.length === 1) {
          const single = path.join(extractedDir, entries[0]);
          if (fs.statSync(single).isDirectory()) contentRoot = single;
        }

        const lockKey = `${userId}/${gameName}`;
        await withLock(lockKey, () => deploy(userId, gameName, contentRoot, sse));
        done(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`部署失败：${msg}`);
        sse(`✗ ${msg}`);
        done(false);
        fs.rmSync(extractedDir, { recursive: true, force: true });
        fs.rmSync(zipPath, { force: true });
      }
    });

    writer.on("error", (err) => {
      sse(`✗ 文件写入失败：${err.message}`);
      done(false);
    });
  });

  bb.on("error", (err: Error) => {
    sse(`✗ 上传错误：${err.message}`);
    done(false);
  });

  req.pipe(bb);
});

router.post("/:gameId/rollback", async (req: Request, res: Response) => {
  const { gameId } = req.params;
  const { version, operatorId } = req.body as { version: number; operatorId: string };

  if (!version || !operatorId) {
    res.status(400).json({ error: "缺少 version 或 operatorId" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sse = (line: string) => {
    res.write(`data: ${JSON.stringify({ message: line, time: new Date().toISOString() })}\n\n`);
  };
  const done = (ok: boolean) => {
    res.write(`data: ${JSON.stringify({ done: true, ok })}\n\n`);
    res.end();
  };

  try {
    await withLock(gameId, () => rollback(gameId, Number(version), operatorId, sse));
    done(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`回滚失败 [${gameId}]：${msg}`);
    sse(`✗ ${msg}`);
    done(false);
  }
});

export default router;
