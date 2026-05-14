import express from "express";
import cors from "cors";
import deployRouter from "./routes/deploy";
import gamesRouter from "./routes/games";
import logger from "./services/logger";

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.use("/api/deploy", deployRouter);
app.use("/api/games",  gamesRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.listen(PORT, () => {
  logger.info(`Game Manager 后端启动，监听端口 ${PORT}`);
});
