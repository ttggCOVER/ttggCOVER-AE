// Seed 脚本 — 生成可演示的数据
// 跑法：npm run db:seed  或  npm run db:reset
//
// 数据规模：60 学生 / 2 admin / 1 teacher，让"一个 admin 管很多学生"的感觉成立
import bcrypt from 'bcryptjs';
import { db, run, row } from './index.js';
import { nowISO, fromUTC, weekdayTimeThisWeek } from '../lib/timezone.js';
import { purchaseLesson } from '../lib/rules.js';

const RESET = process.argv.includes('--reset');

function clearAll() {
  db.exec(`
    DELETE FROM attendance;
    DELETE FROM class_sessions;
    DELETE FROM follow_ups;
    DELETE FROM lesson_transactions;
    DELETE FROM lesson_credits;
    DELETE FROM class_members;
    DELETE FROM trial_bookings;
    DELETE FROM classes;
    DELETE FROM consultations;
    DELETE FROM students;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
}

function hash(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

function insertAndGetId(sql: string, ...params: any[]): number {
  const r = run(sql, ...params);
  return Number(r.lastInsertRowid);
}

function seed() {
  if (RESET) {
    console.log('[seed] --reset, clearing all tables');
    clearAll();
  }

  // ---------- 3 个用户 ----------
  const pw = 'password123';
  const admin1 = insertAndGetId(
    `INSERT INTO users (name, role, email, password_hash, dept) VALUES (?, 'admin', ?, ?, ?)`,
    '张敏', 'admin1@school.local', hash(pw), '咨询一部',
  );
  const admin2 = insertAndGetId(
    `INSERT INTO users (name, role, email, password_hash, dept) VALUES (?, 'admin', ?, ?, ?)`,
    '李超', 'admin2@school.local', hash(pw), '咨询二部',
  );
  const teacher1 = insertAndGetId(
    `INSERT INTO users (name, role, email, password_hash, phone, dept) VALUES (?, 'teacher', ?, ?, ?, ?)`,
    '王芳', 'teacher1@school.local', hash(pw), '13900000001', '教学部',
  );

  console.log(`[seed] users: admin1=${admin1}, admin2=${admin2}, teacher1=${teacher1}`);

  // ---------- 学生：admin1 管 35，admin2 管 25 ----------
  const firstNames = ['张', '李', '王', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
  const lastNames = ['梓', '睿', '晨', '雨', '若', '思', '悦', '宁', '可', '辰', '嘉', '俊', '彦', '宇', '紫', '宸', '梓', '晨', '雨', '辰'];
  const grades = ['三年级', '四年级', '五年级', '六年级', '初一', '初二'];
  const channels = ['wechat', 'call', 'walkin'] as const;
  const needs = ['数学跟不上', '英语口语差', '幼小衔接', '小升初冲刺', '想提高成绩', '英语阅读差', '物理入门', '化学竞赛'];

  const adminAssignments: Array<{ admin: number; count: number; status: any; range: number }> = [
    { admin: admin1, count: 15, status: 'consulting', range: 0 },
    { admin: admin1, count: 4, status: 'trial_scheduled', range: 15 },
    { admin: admin1, count: 6, status: 'trial_done', range: 19 },
    { admin: admin1, count: 8, status: 'enrolled', range: 25 },
    { admin: admin1, count: 2, status: 'churned', range: 33 },
    { admin: admin2, count: 8, status: 'consulting', range: 0 },
    { admin: admin2, count: 4, status: 'trial_scheduled', range: 8 },
    { admin: admin2, count: 6, status: 'trial_done', range: 12 },
    { admin: admin2, count: 5, status: 'enrolled', range: 18 },
    { admin: admin2, count: 2, status: 'churned', range: 23 },
  ];

  let nameIdx = 0;
  let studentIdCounter = 0;
  const studentIdsByStatus: Record<string, number[]> = {
    consulting: [],
    trial_scheduled: [],
    trial_done: [],
    enrolled: [],
    churned: [],
  };
  const admin1StudentIds: number[] = [];
  const admin2StudentIds: number[] = [];

  for (const grp of adminAssignments) {
    for (let i = 0; i < grp.count; i++) {
      nameIdx++;
      const name = `${firstNames[nameIdx % firstNames.length]}${lastNames[nameIdx % lastNames.length]}${String.fromCharCode(65 + (nameIdx % 26))}`;
      const parentName = `${firstNames[nameIdx % firstNames.length]}${'家长'}`;
      const phone = `138${String(10000000 + nameIdx).padStart(8, '0')}`;
      const grade = grades[nameIdx % grades.length];
      const createdAt = new Date(Date.now() - nameIdx * 3600_000).toISOString();

      const sid = insertAndGetId(
        `INSERT INTO students
         (name, parent_name, parent_phone, grade, status, owner_admin_id, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        name, parentName, phone, grade, grp.status, grp.admin,
        nameIdx % 3 === 0 ? '家长比较着急，希望尽快安排试听' : null,
        createdAt,
      );
      studentIdCounter++;
      studentIdsByStatus[grp.status].push(sid);
      if (grp.admin === admin1) admin1StudentIds.push(sid);
      else admin2StudentIds.push(sid);

      // 给每个学生加一条咨询记录
      run(
        `INSERT INTO consultations (student_id, channel, source, need, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        sid, channels[nameIdx % channels.length], nameIdx % 2 === 0 ? '家长介绍' : '百度广告',
        needs[nameIdx % needs.length], grp.admin, createdAt,
      );
    }
  }

  console.log(`[seed] ${studentIdCounter} students inserted (admin1=${admin1StudentIds.length}, admin2=${admin2StudentIds.length})`);

  // ---------- 试听预约（trial_scheduled + trial_done 状态学生都有） ----------
  const trialStudents = [...studentIdsByStatus.trial_scheduled, ...studentIdsByStatus.trial_done];
  trialStudents.forEach((sid, i) => {
    const isPast = studentIdsByStatus.trial_done.includes(sid);
    const offsetH = isPast ? -(i + 1) * 24 : (i + 1) * 24;
    const scheduledAt = new Date(Date.now() + offsetH * 3600_000).toISOString();
    const status = isPast ? 'completed' : 'pending';
    const tid = insertAndGetId(
      `INSERT INTO trial_bookings (student_id, teacher_id, scheduled_at, duration_min, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      sid, teacher1, scheduledAt, 60, status, sid % 2 === 0 ? admin1 : admin2, new Date().toISOString(),
    );

    if (isPast) {
      // 给 completed 试听填反馈（其中 1 条留空，让前端 demo "AI 抽取"）
      const feedbacks = [
        '学生很专注，能跟上节奏，但计算速度稍慢。建议报名强化班。',
        '基础不错，但应用题分析能力较弱。需要持续训练。建议先报短期专题班。',
      ];
      const fb = i % 3 === 0 ? '' : feedbacks[i % feedbacks.length];
      if (fb) {
        run(`UPDATE trial_bookings SET feedback_text = ? WHERE id = ?`, fb, tid);
      }
    }
  });

  // 给 trial_done 状态的学生生成一条 after_trial 跟进
  studentIdsByStatus.trial_done.forEach((sid, i) => {
    const dueOffset = (i + 1) * 12;
    const dueAt = new Date(Date.now() + (dueOffset - 48) * 3600_000).toISOString();
    run(
      `INSERT INTO follow_ups (student_id, type, content, next_action, due_at, owner_admin_id, trial_booking_id, created_at)
       VALUES (?, 'after_trial', ?, ?, ?, ?, ?, ?)`,
      sid,
      `试听已完成，需与家长沟通是否报名。`,
      i % 2 === 0 ? '电话回访' : '微信沟通',
      dueAt,
      admin1StudentIds.includes(sid) ? admin1 : admin2,
      null,
      new Date().toISOString(),
    );
  });

  // ---------- 已报名学生：班级 + 课时 ----------
  const enrolledStudents = studentIdsByStatus.enrolled;
  // 创建 2 个固定班级（每周一次）
  const cls1 = insertAndGetId(
    `INSERT INTO classes (name, teacher_id, weekday, start_time, end_time, subject, capacity) VALUES (?, ?, 1, '16:00', '17:30', '数学', 6)`,
    '周一数学强化班', teacher1,
  );
  const cls2 = insertAndGetId(
    `INSERT INTO classes (name, teacher_id, weekday, start_time, end_time, subject, capacity) VALUES (?, ?, 3, '19:00', '20:30', '英语', 6)`,
    '周三英语口语班', teacher1,
  );

  enrolledStudents.forEach((sid, i) => {
    const clsId = i < 3 ? cls1 : cls2;
    run(`INSERT INTO class_members (student_id, class_id) VALUES (?, ?)`, sid, clsId);
    const initialMin = i < 2 ? 400 : 1200 + i * 30;
    purchaseLesson(sid, initialMin, `初始购入 ${initialMin} 分钟`);
    // 所有 enrolled 学生都加消耗记录，消耗量随机（每次 30-90 分钟），让消耗率有差异
    // 前 2 个消耗较多（约 285），余额 < 120 触发预警；其他消耗较少
    const consumeRounds = i < 2 ? 5 : (i < 5 ? 3 : 2);
    for (let k = 0; k < consumeRounds; k++) {
      const delta = -(30 + (i * 7 + k * 13) % 61); // 30-90 分钟
      const sessionDate = new Date(Date.now() - (k + 1) * 3 * 86400_000).toISOString();
      run(`UPDATE lesson_credits SET balance = balance + ?, updated_at = datetime('now') WHERE student_id = ?`, delta, sid);
      run(`INSERT INTO lesson_transactions (student_id, delta_min, reason, note, created_at) VALUES (?, ?, 'consume', ?, ?)`,
        sid, delta, `第 ${k + 1} 次课（消耗 ${-delta} 分钟）`, sessionDate);
    }
    // 前 2 个再多扣 30，触发余额低预警
    if (i < 2) {
      const extra = -30;
      run(`UPDATE lesson_credits SET balance = balance + ?, updated_at = datetime('now') WHERE student_id = ?`, extra, sid);
      run(`INSERT INTO lesson_transactions (student_id, delta_min, reason, note, created_at) VALUES (?, ?, 'consume', ?, ?)`,
        sid, extra, '额外消耗 30 分钟（班级补课）', new Date(Date.now() - 86400_000).toISOString());
    }
  });

  // ---------- 给 enrolled 的学生加 1 条"快用完课时"跟进 ----------
  enrolledStudents.slice(0, 2).forEach((sid, i) => {
    run(
      `INSERT INTO follow_ups (student_id, type, content, next_action, due_at, owner_admin_id, created_at)
       VALUES (?, 'renewal', ?, ?, ?, ?, ?)`,
      sid,
      `学生课时余额 < 60 分钟，需联系家长续费。`,
      '电话沟通续费方案',
      new Date(Date.now() + (i + 1) * 24 * 3600_000).toISOString(),
      admin1StudentIds.includes(sid) ? admin1 : admin2,
      new Date().toISOString(),
    );
  });

  console.log(`[seed] done. users=3, students=${studentIdCounter}, classes=2`);
  console.log(`[seed] test accounts (password: ${pw}):`);
  console.log(`  admin1@school.local (张敏, 管 ${admin1StudentIds.length} 学生)`);
  console.log(`  admin2@school.local (李超, 管 ${admin2StudentIds.length} 学生)`);
  console.log(`  teacher1@school.local (王芳)`);
}

seed();
