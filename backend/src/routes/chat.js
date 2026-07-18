import { Router } from "express";
import { planQuestion, answerWithPlan } from "../services/aiChat.js";

const router = Router();

// Step 1: classify intent, then either answer directly (chit-chat/help) or
// plan a data query without running it yet.
router.post("/plan", async (req, res) => {
  const { question } = req.body || {};
  if (!question || typeof question !== "string") {
    return res.status(400).json({ ok: false, message: "Body must include a 'question' string" });
  }
  try {
    const plan = await planQuestion(question);
    if (!plan.needsData) {
      return res.json({ ok: true, question, needsData: false, answer: plan.answer });
    }
    res.json({ ok: true, question, needsData: true, calls: plan.calls, summary: plan.summary });
  } catch (err) {
    console.error("[chat] plan error", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Step 2: the user confirmed the plan — run it and answer from real results.
router.post("/confirm", async (req, res) => {
  const { question, calls } = req.body || {};
  if (!question || typeof question !== "string" || !Array.isArray(calls)) {
    return res.status(400).json({ ok: false, message: "Body must include 'question' and a 'calls' array" });
  }
  try {
    const { answer, data } = await answerWithPlan(question, calls);
    res.json({ ok: true, answer, data });
  } catch (err) {
    console.error("[chat] confirm error", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

export default router;
