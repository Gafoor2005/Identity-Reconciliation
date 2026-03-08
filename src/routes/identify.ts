import { Router, Request, Response } from "express";
import { identifyContact } from "../services/identifyService";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    email?: string | null;
    phoneNumber?: string | number | null;
  };

  const email = body.email ?? null;
  // spec allows phoneNumber as number — normalise to string for DB lookup
  const phoneNumber =
    body.phoneNumber != null ? String(body.phoneNumber) : null;

  if (!email && !phoneNumber) {
    res.status(400).json({
      error: "At least one of email or phoneNumber must be provided",
    });
    return;
  }

  try {
    const result = await identifyContact({ email, phoneNumber });
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
