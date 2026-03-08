import express from "express";
import identifyRouter from "./routes/identify";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.use("/identify", identifyRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
