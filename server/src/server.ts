// ---------- 1) Load .env BEFORE anything else ----------
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

let loaded = false;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log('[env] loaded:', p);
    loaded = true;
    break;
  }
}
if (!loaded) console.warn('[env] .env not found; tried:', candidates);

// ---------- 2) Imports that rely on env ----------
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// (optional) mailer verification if you use it
import { verifyMailer } from './utils/mailer';

// ✅ Route modules (use v1 paths consistently where you want)
import authRoutes from './api/auth/auth.routes';
import userRoutes from './api/users/users.routes';
import incomeRoutes from './api/income/income.routes';
import expenseRoutes from './api/expense/expense.routes';
import dashboardRoutes from './api/dashboard/dashboard-routes';
import budgetsRoutes from './api/budget/budget.routes';
import transactionRoutes from './api/transaction/transaction.routes';
import categoriesRoutes from './api/Categories/category.routes';
import analyticsRoutes from './api/analytics/analytics.routes';

// Tax Estimator + Calendar
import taxRoutes from './api/TaxEstimator/TaxEstimator.routes';

// Financial Reports (CRUD)
import financialReportsRoutes from './api/FinancialReport/FinancialReport.routes';

// Export / Download (files)
import exportRoutes from './api/ExportDownload/ExportDownload.routes';

import itrRoutes from './api/itr/itr.routes';
import paymentRoutes from './api/payment/payment.routes';
import documentRoutes from './api/document/document.routes';
import caRoutes from './api/ca/ca.routes';
import adminRoutes from './api/admin/admin.routes';
import basicPaymentRoutes from './routes/payment.routes';
import User from './api/auth/user.model';

// ---------- 3) App setup ----------
const app = express();
const PORT = Number(process.env.PORT || 3000);

// Security-ish niceties
app.disable('x-powered-by');

// ---------- 4) CORS ----------
const corsOrigins =
  process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
  ];

app.use(cors({ origin: corsOrigins, credentials: true }));

// ---------- 5) Core middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ---------- 6) Socket.IO ----------
const httpServer = http.createServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('[socket] client connected', socket.id);
  socket.on('disconnect', () => console.log('[socket] client disconnected', socket.id));
});

// ---------- 7) DB connection ----------
const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/taxsphere';

mongoose.set('bufferCommands', false);

async function pingMongo(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
    return true;
  } catch (err: any) {
    console.error('[db] ping failed:', err?.message || err);
    return false;
  }
}

async function runStartupDbTasks(): Promise<void> {
  // Migration: Normalize ITR statuses to new lifecycle
  try {
    const Itr = mongoose.model('Itr');
    // Normalize document statuses (already done, but good for safety)
    await Itr.updateMany(
      { "documents.status": { $exists: true } },
      [
        { $set: { "documents": {
          $map: {
            input: "$documents",
            as: "d",
            in: {
              $mergeObjects: [
                "$$d",
                { status: { $toLower: "$$d.status" } }
              ]
            }
          }
        }}}
      ]
    );

    // Normalize ITR status
    const allItrs = await Itr.find({});
    for (const it of allItrs) {
      let s = (it.status || 'draft').toLowerCase();
      // Mapping old to new
      if (s === 'paid') s = 'payment_completed';
      if (s === 'verified') s = 'approved';
      if (['draft', 'submitted', 'assigned', 'under_review', 'approved', 'rejected', 'payment_pending', 'payment_completed', 'filed'].includes(s)) {
        it.status = s;
        (it as any).filingStatus = s;
      } else {
        it.status = 'draft';
        (it as any).filingStatus = 'draft';
      }
      const p = String((it as any).paymentStatus || it.payment?.paymentStatus || 'not_required').toLowerCase();
      const normalizedPayment = ['not_required', 'pending', 'created', 'paid', 'failed', 'refunded'].includes(p) ? p : 'not_required';
      (it as any).paymentStatus = normalizedPayment;
      if (it.payment) it.set('payment.paymentStatus', normalizedPayment);
      await it.save();
    }
    console.log('[db] ITR lifecycle statuses normalized');
  } catch (e) {
    console.warn('[db] Normalization skipped/failed:', (e as Error).message);
  }
}

async function ensureDefaultAdmin(): Promise<void> {
  try {
    const existingAdmin = await User.findOne({
      $or: [
        { email: 'admin@taxsphere.com' },
        { role: 'ADMIN' },
        { role: 'admin' as any },
      ],
    }).lean();

    if (existingAdmin) {
      console.log('[seed] Admin already exists');
      return;
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      name: 'Admin',
      email: 'admin@taxsphere.com',
      password: hashedPassword,
      role: 'ADMIN',
      country: 'IN',
      income_bracket: 'high',
    });

    console.log('[seed] Default admin created successfully');
  } catch (error: any) {
    console.error('[seed] Failed to create default admin:', error?.message || error);
  }
}

async function connectToDatabase(): Promise<void> {
  console.log('[db] Connecting to:', mongoUri);
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('[db] Connected to MongoDB');
  } catch (err: any) {
    console.error('\n❌ [db] MongoDB Connection Failed!');
    console.error(`   Root Cause: ${err?.message || err}`);
    console.error(`   Attempted URI: ${mongoUri}`);
    console.error('\n   💡 SUGGESTED FIXES:');
    console.error('   1. Start local MongoDB service on port 27017');
    console.error('   2. OR switch MONGO_URI in .env to a MongoDB Atlas cluster\n');
    throw err;
  }

  const healthy = await pingMongo();
  if (!healthy) {
    console.error('\n❌ [db] MongoDB startup health check failed (ping unsuccessful).');
    console.error('   Service will exit to avoid serving requests with unavailable database.\n');
    throw new Error('DB_STARTUP_HEALTHCHECK_FAILED');
  }
  console.log('[db] Startup health check passed');

  await runStartupDbTasks();
  await ensureDefaultAdmin();
}

// ---------- 8) Routes ----------
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/incomes', incomeRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/v1/budgets', budgetsRoutes);
app.use('/api/v1/budget', budgetsRoutes); // legacy alias for budget module consumers
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/categories', categoriesRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// ✅ Tax Estimator + Calendar
app.use('/api/v1/tax', taxRoutes);

// ✅ Financial Reports (CRUD only)
app.use('/api/v1/financial-reports', financialReportsRoutes);

// ✅ Export/Download module (CSV/XLSX/PDF)
app.use('/api/export', exportRoutes);

// ✅ ITR SaaS (filing, Razorpay, documents, CA, admin)
app.use('/api/v1/itr', itrRoutes);
// Legacy alias to avoid route mismatch for older clients that still call /itrs.
app.use('/api/v1/itrs', itrRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/ca', caRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use('/api/payment', basicPaymentRoutes);

// ---------- 8b) Legacy compatibility mounts (optional) ----------
app.use('/api/transactions', transactionRoutes);

// Health check
app.get('/api/v1/health', (_req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.json({ 
    status: 'OK', 
    message: 'TaxSphere API is running',
    database: dbStatus 
  });
});

app.get('/api/v1/health/db', async (_req, res) => {
  const healthy = await pingMongo();
  if (!healthy) {
    return res.status(503).json({
      success: false,
      message: 'Database unavailable',
      database: 'Disconnected',
    });
  }
  return res.json({
    success: true,
    message: 'Database healthy',
    database: 'Connected',
  });
});

// ---------- 9) Route inspector (DEV ONLY) ----------
app.get('/__routes', (_req, res) => {
  const stack: any[] = (app as any)._router?.stack || [];
  const routes: string[] = [];

  stack.forEach((l: any) => {
    if (l.name === 'router' && l.handle?.stack) {
      const prefix =
        l.regexp?.toString().replace(/^\/\^\\/, '/').replace(/\\\/\?\(\?\=\/\|\$\)\/i$/, '') || '';
      l.handle.stack.forEach((s: any) => {
        if (s.route) {
          const methods = Object.keys(s.route.methods).join(',').toUpperCase();
          routes.push(`${methods} ${prefix}${s.route.path}`);
        }
      });
    } else if (l.route && l.route.path) {
      const methods = Object.keys(l.route.methods).join(',').toUpperCase();
      routes.push(`${methods} ${l.route.path}`);
    }
  });

  res.json({ routes });
});

// ---------- 10) START SERVER ----------

/**
 * Attempt to listen on `port`. If the port is busy (EADDRINUSE),
 * automatically retry on port + 1 (up to `maxRetries` attempts).
 */
function startServer(port: number, maxRetries = 10): void {
  const server = httpServer.listen(port, () => {
    if (port !== PORT) {
      console.warn(
        `\n⚠️  Port ${PORT} was busy — server started on http://localhost:${port} instead.\n` +
        `   Update your .env: PORT=${port}\n`
      );
    } else {
      console.log(`\n✅  TaxSphere server running on http://localhost:${port}\n`);
    }

    // Verify mail transport (non-fatal)
    try {
      verifyMailer();
    } catch (e) {
      console.warn('[mailer] verify skipped/failed:', (e as Error)?.message);
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      if (maxRetries <= 0) {
        console.error(`❌  Could not find a free port after several attempts. Exiting.`);
        process.exit(1);
      }
      console.warn(`⚠️  Port ${port} is busy — trying port ${port + 1}…`);
      server.close();
      startServer(port + 1, maxRetries - 1);
    } else {
      // Unexpected error — re-throw so nodemon surfaces it clearly
      console.error('❌  Server error:', err.message);
      process.exit(1);
    }
  });

  // Graceful shutdown on Ctrl-C / Docker stop
  const shutdown = (signal: string) => {
    console.log(`\n[server] Received ${signal} — shutting down gracefully…`);
    server.close(() => {
      console.log('[server] Closed. Bye!\n');
      process.exit(0);
    });
    // Force-kill after 5 s if connections linger
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Guard against double-listening when ts-node hot-reloads the module
async function bootstrap(): Promise<void> {
  if ((global as any).__taxsphere_server_started) {
    console.log('[server] listen skipped (module already loaded)');
    return;
  }

  try {
    await connectToDatabase();
  } catch {
    process.exit(1);
  }

  (global as any).__taxsphere_server_started = true;
  startServer(PORT);
}

bootstrap();

export default app;
