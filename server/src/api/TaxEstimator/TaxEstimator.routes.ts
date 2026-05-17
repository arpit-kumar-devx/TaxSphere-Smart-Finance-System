import express from "express";
import { TaxEstimatorController } from "./TaxEstimator.controller";
import { authenticateToken } from "../auth/auth";

const router = express.Router();

// ----- Tax Estimation -----
router.post("/calculate", TaxEstimatorController.estimateTax);
router.get("/records", TaxEstimatorController.getAllTaxRecords);
router.get("/summary", authenticateToken, TaxEstimatorController.getTaxSummary);

// ----- Tax Calendar -----
router.post("/calendar", TaxEstimatorController.addCalendarEvent);
router.get("/calendar", TaxEstimatorController.getAllCalendarEvents);
router.delete("/calendar/:id", TaxEstimatorController.deleteCalendarEvent);
router.patch("/calendar/:id/paid", TaxEstimatorController.markCalendarEventPaid);

// ✅ NEW: bulk delete (e.g., /api/v1/tax/calendar?type=reminder)
router.delete("/calendar", TaxEstimatorController.deleteCalendarBulk);

export default router;
