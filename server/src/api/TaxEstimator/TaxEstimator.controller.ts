import { Request, Response } from "express";
import { TaxEstimatorService } from "./TaxEstimator.service";
import { io } from "../../server";
import { AuthedRequest } from "../auth/auth";
import { Types } from "mongoose";
import Transaction from "../transaction/Transaction.model";
import { calculateTax } from "../../utils/taxCalculator";

export class TaxEstimatorController {
  // ----- TAX ESTIMATION -----
  static async estimateTax(req: Request, res: Response) {
    try {
      const data = req.body;
      const result = await TaxEstimatorService.calculateTax(data);
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllTaxRecords(req: Request, res: Response) {
    try {
      const records = await TaxEstimatorService.getAllTaxRecords();
      res.status(200).json({ success: true, data: records });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ----- TAX CALENDAR -----
  static async addCalendarEvent(req: Request, res: Response) {
    try {
      const event = await TaxEstimatorService.addCalendarEvent(req.body);
      io.emit("reminderUpdated", { type: "created", event });
      res.status(201).json({ success: true, data: event });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllCalendarEvents(req: Request, res: Response) {
    try {
      const events = await TaxEstimatorService.getAllCalendarEvents();
      res.status(200).json({ success: true, data: events });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteCalendarEvent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await TaxEstimatorService.deleteCalendarEvent(id);
      if (!deleted)
        return res.status(404).json({ success: false, message: "Event not found" });
      io.emit("reminderUpdated", { type: "deleted", id });
      res.status(200).json({ success: true, message: "Event deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async markCalendarEventPaid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await TaxEstimatorService.markCalendarEventPaid(id);
      if (!updated)
        return res.status(404).json({ success: false, message: "Event not found" });
      
      io.emit("reminderUpdated", { type: "updated", event: updated });
      return res.status(200).json({ success: true, message: "Event marked as paid", data: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ✅ NEW: bulk delete based on query (?type=reminder)
  static async deleteCalendarBulk(req: Request, res: Response) {
    try {
      const { type } = req.query;
      if (type === 'reminder') {
        const deletedCount = await TaxEstimatorService.deleteAllReminders();
        io.emit("reminderUpdated", { type: "bulkDeleted", deletedCount });
        return res.status(200).json({ success: true, deletedCount });
      }
      return res.status(400).json({ success: false, message: "Unsupported bulk delete filter" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getTaxSummary(req: AuthedRequest, res: Response) {
    try {
      if (!req.user?.id || !Types.ObjectId.isValid(req.user.id)) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const userId = new Types.ObjectId(req.user.id);
      const now = new Date();
      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : now;
      const regime = req.query.regime === "OLD" ? "OLD" : "NEW";

      const start = Number.isFinite(startDate.getTime()) ? startDate : new Date(now.getFullYear(), now.getMonth(), 1);
      const end = Number.isFinite(endDate.getTime()) ? endDate : now;

      const totals = await Transaction.aggregate([
        { $match: { userId, type: "income", date: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const totalIncome = Number(totals[0]?.total || 0);
      const tax = calculateTax(
        { salary: totalIncome, business: 0, capitalGains: 0, otherIncome: 0 },
        { c80C: 0, c80D: 0, c80E: 0, c80G: 0, nps: 0 },
        regime
      );

      return res.json({
        success: true,
        data: {
          estimatedTaxDue: Math.max(0, Math.round(tax.finalTax * 100) / 100),
          regime,
          totalIncome: Math.round(totalIncome * 100) / 100,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Failed to fetch tax summary" });
    }
  }
}
