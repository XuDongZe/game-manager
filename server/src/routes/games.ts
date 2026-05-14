import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

interface Game {
  id: string;
  name: string;
  user_name: string;
  tags: string;
  cover_url: string | null;
  repo_path: string;
  www_path: string;
  created_at: string;
  locked: number;
}

interface Version {
  id: number;
  game_id: string;
  version_num: number;
  commit_hash: string;
  git_tag: string;
  deployed_by: string;
  deployed_at: string;
  status: string;
  is_rollback: boolean;
  rollback_to: number | null;
  file_size_kb: number | null;
}

router.get("/", (_req: Request, res: Response) => {
  const games = db.prepare("SELECT * FROM games ORDER BY created_at DESC").all() as Game[];
  res.json(
    games.map((g) => ({
      ...g,
      tags: JSON.parse(g.tags ?? "[]") as string[],
    }))
  );
});

router.get(/^\/(.+)\/versions$/, (req: Request, res: Response) => {
  const gameId = (req.params as unknown as Record<string, string>)["0"];
  const versions = db
    .prepare(
      "SELECT * FROM versions WHERE game_id = ? ORDER BY version_num DESC"
    )
    .all(gameId) as Version[];
  res.json(versions);
});

router.get("/:gameId(*)", (req: Request, res: Response) => {
  const { gameId } = req.params;
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId) as Game | undefined;
  if (!game) {
    res.status(404).json({ error: "游戏不存在" });
    return;
  }
  res.json({ ...game, tags: JSON.parse(game.tags ?? "[]") as string[] });
});

router.patch("/:gameId(*)", (req: Request, res: Response) => {
  const { gameId } = req.params;
  const { name, tags, cover_url, locked } = req.body as Partial<{
    name: string;
    tags: string[];
    cover_url: string;
    locked: boolean;
  }>;

  const game = db.prepare("SELECT id FROM games WHERE id = ?").get(gameId);
  if (!game) {
    res.status(404).json({ error: "游戏不存在" });
    return;
  }

  if (name !== undefined) {
    db.prepare("UPDATE games SET name = ? WHERE id = ?").run(name, gameId);
  }
  if (tags !== undefined) {
    db.prepare("UPDATE games SET tags = ? WHERE id = ?").run(JSON.stringify(tags), gameId);
  }
  if (cover_url !== undefined) {
    db.prepare("UPDATE games SET cover_url = ? WHERE id = ?").run(cover_url, gameId);
  }
  if (locked !== undefined) {
    db.prepare("UPDATE games SET locked = ? WHERE id = ?").run(locked ? 1 : 0, gameId);
  }

  res.json({ ok: true });
});

router.delete("/:gameId(*)", (req: Request, res: Response) => {
  const { gameId } = req.params;

  const game = db.prepare("SELECT id, locked, repo_path, www_path FROM games WHERE id = ?").get(gameId) as Pick<Game, "id" | "locked" | "repo_path" | "www_path"> | undefined;
  if (!game) {
    res.status(404).json({ error: "游戏不存在" });
    return;
  }
  if (game.locked) {
    res.status(403).json({ error: "游戏已锁定，请先解锁再删除" });
    return;
  }

  db.prepare("DELETE FROM versions WHERE game_id = ?").run(gameId);
  db.prepare("DELETE FROM games WHERE id = ?").run(gameId);

  res.json({ ok: true });
});

export default router;
