import { Request, Response } from 'express';
import { razorpay } from '../config/razorpay';

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now()
    });

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
