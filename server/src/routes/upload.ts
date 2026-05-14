import { Router, Request, Response } from "express";
import busboy from "busboy";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import unzipper from "unzipper";

const router = Router();

const MAX_FILE_SIZE = 600 * 1024 * 1024;

export interface UploadResult {
  userId: string;
  gameName: string;
  extractedDir: string;
}

router.post("/", (req: Request, res: Response) => {
  const bb = busboy({
    headers: req.headers,
    limits: { files: 1, fileSize: MAX_FILE_SIZE },
  });

  let userId    = "";
  let gameName  = "";
  let uploadErr: Error | null = null;
  const extractedDir = path.join("/tmp", `extract-${uuidv4()}`);

  bb.on("field", (name, val) => {
    if (name === "userId")   userId   = val.trim();
    if (name === "gameName") gameName = val.trim();
  });

  bb.on("file", (_fieldname, fileStream, _info) => {
    const zipPath = path.join("/tmp", `upload-${uuidv4()}.zip`);
    const writer  = fs.createWriteStream(zipPath);

    fileStream.on("limit", () => {
      uploadErr = new Error(`文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制`);
      fileStream.resume();
    });

    fileStream.pipe(writer);

    writer.on("close", () => {
      if (uploadErr) return;
      if (!userId || !gameName) {
        uploadErr = new Error("userId 和 gameName 不能为空");
        fs.rmSync(zipPath, { force: true });
        return;
      }

      fs.mkdirSync(extractedDir, { recursive: true });

      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractedDir }))
        .on("close", () => {
          fs.rmSync(zipPath, { force: true });

          const entries = fs.readdirSync(extractedDir);
          let contentRoot = extractedDir;

          if (entries.length === 1) {
            const single = path.join(extractedDir, entries[0]);
            if (fs.statSync(single).isDirectory()) {
              contentRoot = single;
            }
          }

          (req as Request & { uploadResult?: UploadResult }).uploadResult = {
            userId,
            gameName,
            extractedDir: contentRoot,
          };

          res.json({ ok: true, userId, gameName });
        })
        .on("error", (err: Error) => {
          fs.rmSync(zipPath, { force: true });
          fs.rmSync(extractedDir, { recursive: true, force: true });
          res.status(400).json({ error: `ZIP 解压失败：${err.message}` });
        });
    });
  });

  bb.on("finish", () => {
    if (uploadErr) {
      fs.rmSync(extractedDir, { recursive: true, force: true });
      res.status(400).json({ error: uploadErr.message });
    }
  });

  bb.on("error", (err: Error) => {
    fs.rmSync(extractedDir, { recursive: true, force: true });
    res.status(500).json({ error: err.message });
  });

  req.pipe(bb);
});

export default router;
