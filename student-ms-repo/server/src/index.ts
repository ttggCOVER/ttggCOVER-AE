// Express app — 路由挂载 + 全局错误处理 + SIGINT 优雅退出
import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { authRequired } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.js';
import { studentsRoutes } from './routes/students.js';
import { consultationsRoutes } from './routes/consultations.js';
import { trialsRoutes } from './routes/trials.js';
import { followUpsRoutes } from './routes/followUps.js';
import { aiRoutes } from './routes/ai.js';
import { usersRoutes } from './routes/users.js';
import { classesRoutes } from './routes/classes.js';

const app = express();

app.use(cors({
  origin: env.CLIENT_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// 健康检查（无需认证）
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, tz: env.TZ, ts: new Date().toISOString() });
});

// 认证
app.use('/api/auth', authRoutes);

// 以下全部需要 JWT
app.use('/api', authRequired, studentsRoutes);
app.use('/api', authRequired, consultationsRoutes);
app.use('/api', authRequired, trialsRoutes);
app.use('/api', authRequired, followUpsRoutes);
app.use('/api', authRequired, aiRoutes);
app.use('/api', authRequired, usersRoutes);
app.use('/api', authRequired, classesRoutes);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${env.PORT} (tz=${env.TZ}, env=${env.NODE_ENV})`);
});

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[server] received ${signal}, closing...`);
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log('[server] closed');
    process.exit(0);
  });
  // 兜底 5s 后强制退出
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
