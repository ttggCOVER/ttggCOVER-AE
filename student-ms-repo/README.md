# 学生管理系统 · Austin Education 技术作业

> 教育机构学生生命周期管理系统。覆盖 **咨询 → 安排试听 → 试听反馈 → AI 抽取 → 跟进 → 报名 → 班级出勤扣课时** 全流程。
> 设计文档见 [DESIGN.md](./DESIGN.md)。

## 快速开始

### 环境要求

- **Node.js ≥ 22**（推荐 22.23+）

- npm 10+（自带）

### 安装 + 启动

```bash
# 1. 安装依赖（会同时装 server / client / shared 三个 workspace）
npm install

# 2. 复制环境变量
cp .env.example .env
# 编辑 .env：填入 DEEPSEEK_API_KEY（可选；留空会走降级路径，不影响主流程）

# 3. 初始化数据库 + seed 数据
npm run db:seed
# 或全量重置（清表后重建）
npm run db:reset

# 4. 同时启动后端 + 前端
npm run dev
```

打开浏览器：<http://localhost:5173>

- 后端：`http://localhost:3001`

- 前端：`http://localhost:5173`（vite 代理 `/api` 到后端）

### 测试账号

seed 后内置三个账号，**密码均为** **`password123`**：

| 邮箱                      | 角色         | 数据                           |
| ----------------------- | ---------- | ---------------------------- |
| `admin1@school.local`   | admin 张敏   | 管 35 个学生（咨询一部）               |
| `admin2@school.local`   | admin 李超   | 管 25 个学生（咨询二部）               |
| `teacher1@school.local` | teacher 王芳 | 负责所有试听 + 2 个固定班（周一数学 / 周三英语） |

登录页有快捷按钮一键登录。

## 端到端 Demo 脚本

走一遍完整切片：

```
1. 用 admin1@school.local 登录 → 看到漏斗：咨询中、已排试听、试听完成、已报名、已流失
   （数字按当前登录 admin 归属的学生真实统计，点击任一卡片可进入该状态学生列表）
2. 点「登记咨询」→ 填新学生（李雷 / 李家长 / 13810000099 / 三年级 / 数学跟不上）→ 保存
   （家长电话必须 11 位中国大陆手机号，1 开头，第二位 3-9）
3. 进学生详情，看到时间线第 1 条「咨询登记」
4. 点「安排试听」→ 学生栏自动锁定（学生名+家长+电话+归属）→ 选王芳老师 → 时间选明天 16:00 → 无冲突 → 提交
5. 退出，用 teacher1@school.local（王芳）登录 → 工作台看到今日课程 + 今日试听
6. 点今日试听 → 写反馈（≥10 字）→ 点「AI 抽取结构化结果」
   - 填了 DEEPSEEK_API_KEY：1-3 秒后右侧出现结构化卡片
   - 没填 key：右侧显示降级提示「待人工」（HTTP 200 + _degraded:true）
7. 点「标记试听完成」→ 学生状态变为「试听完成」
8. 退出，用 admin1 登录 → 学生详情页点「确认报名」→ 填首次购课分钟数 → 状态变「已报名」+ 自动建 30 天后续费跟进
9. 已报名学生详情页：可编辑备注（失焦自动保存）、登记课时消耗（默认 45 分钟，可自定义）、查看课时消耗统计（已购/已消耗/消耗率/进度条/交易记录）
10. 退出，用 teacher1 登录 → 点「今日课程」（周一数学强化班）→ 进入考勤页
    - 名单显示每个学生课时余额（<120 红色预警）
    - 每人可选 出席/迟到/缺席，默认全出席
    - 顶部可设本次扣课时分钟数（默认 45，快捷按钮 30/45/60/90/120）
    - 点「确认考勤并扣课时」→ 出席/迟到扣课时，缺席不扣，显示每人扣后余额
11. admin1 工作台：课时预警卡片显示余额 < 120 的学生，过期跟进高亮
```

## 破坏测试（绕过前端用 curl 直接打 API）

```bash
# 先登录拿 token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin1@school.local","password":"password123"}' | jq -r .token)

# 1. R3：admin1 试图修改 admin2 的学生
# 找一个 admin2 的学生 id（用 admin1 的 token 可以查全部）
OTHER_STUDENT=$(curl -s http://localhost:3001/api/students?owner=2 -H "Authorization: Bearer $TOKEN" | jq '.items[0].id')
curl -X PATCH http://localhost:3001/api/students/$OTHER_STUDENT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"被 admin1 篡改"}'
# 预期：403 Forbidden + {"error":"只能修改归属自己（owner_admin_id）的学生","rule":"R3"}

# 2. R1：给一个已有 completed 试听的学生再排一次 completed
# 先找一个 trial_done 状态的学生
STUDENT_ID=$(curl -s 'http://localhost:3001/api/students?status=trial_done' -H "Authorization: Bearer $TOKEN" | jq '.items[0].id')
# 直接 POST 一条新的 trial 并尝试 complete —— 第二次会被 partial unique 拦
NEW_TRIAL=$(curl -s -X POST http://localhost:3001/api/trials \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"student_id\":$STUDENT_ID,\"teacher_id\":3,\"scheduled_at\":\"2030-01-01T10:00:00.000Z\",\"duration_min\":60}" | jq .id)
# 用 teacher token 标记 complete → 应该 R1 拦
TEACHER_TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"teacher1@school.local","password":"password123"}' | jq -r .token)
curl -X POST http://localhost:3001/api/trials/$NEW_TRIAL/complete -H "Authorization: Bearer $TEACHER_TOKEN"
# 预期：409 + {"error":"该学生已存在 completed 试听","rule":"R1"}

# 3. R6：给 churned 学生排试听
CHURNED_ID=$(curl -s 'http://localhost:3001/api/students?status=churned' -H "Authorization: Bearer $TOKEN" | jq '.items[0].id')
curl -X POST http://localhost:3001/api/trials \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"student_id\":$CHURNED_ID,\"teacher_id\":3,\"scheduled_at\":\"2030-01-01T10:00:00.000Z\",\"duration_min\":60}"
# 预期：409 + {"error":"流失学生不能安排试听","rule":"R6"}

# 4. AI 降级：没填 DEEPSEEK_API_KEY 时调抽取
TRIAL_ID=$(curl -s 'http://localhost:3001/api/trials?today=0' -H "Authorization: Bearer $TEACHER_TOKEN" | jq '.items[0].id')
curl -X POST http://localhost:3001/api/ai/trials/$TRIAL_ID/extract-feedback -H "Authorization: Bearer $TEACHER_TOKEN"
# 预期：HTTP 200 + {"extracted":{...,"_degraded":true,"recommendation":"pending"}}
```

## 项目结构

```
student-ms/
├── DESIGN.md              ← 设计文档（Part A）
├── README.md              ← 本文件
├── .env.example
├── package.json           ← workspaces 根
├── shared/
│   └── types.ts           ← 前后端共享类型
├── server/                ← 后端：Node.js 22 + Express + TypeScript + SQLite
│   └── src/
│       ├── index.ts      ← Express app + 路由挂载 + SIGINT 优雅退出
│       ├── env.ts
│       ├── db/
│       │   ├── schema.sql ← 建表 + 索引 + CHECK + partial unique
│       │   ├── index.ts   ← node:sqlite (DatabaseSync) 单例 + tx() 事务包装
│       │   └── seed.ts     ← seed 脚本（60 学生 + 3 用户 + 班级 + 课时流水）
│       ├── middleware/
│       │   ├── auth.ts     ← JWT + requireRole
│       │   └── errorHandler.ts ← 统一错误 JSON（含 ZodError 识别）
│       ├── routes/
│       │   ├── auth.ts students.ts consultations.ts
│       │   ├── trials.ts followUps.ts ai.ts users.ts
│       │   └── classes.ts  ← 今日课程 / 班级名单 / 考勤扣课时
│       └── lib/
│           ├── rules.ts    ← R1-R7 全部业务规则
│           ├── llm.ts      ← DeepSeek 客户端 + zod + 降级
│           └── timezone.ts ← Melbourne 时区工具
└── client/                ← 前端：React 18 + TypeScript + Vite + Tailwind
    └── src/
        ├── App.tsx（按角色路由 dashboard）
        ├── api/client.ts  ← axios + 401 拦截
        ├── context/AuthContext.tsx
        ├── components/{Layout,ui}.tsx
        └── pages/
            ├── Login.tsx AdminDashboard.tsx TeacherDashboard.tsx
            ├── NewConsultation.tsx ScheduleTrial.tsx
            ├── TrialFeedback.tsx FollowUps.tsx
            ├── StudentDetail.tsx FunnelDetail.tsx
            └── ClassAttendance.tsx
```

## 技术栈

| 层   | 技术                                                         | 理由                                                    |
| --- | ---------------------------------------------------------- | ----------------------------------------------------- |
| 前端  | React 18 + TypeScript + Vite 5 + Tailwind 3 + lucide-react | 作业推荐 React+TS；Vite 启动快；Tailwind 轻量                    |
| 后端  | Node.js 22 + Express 4 + TypeScript（tsx 运行 dev）            | 全栈 TS 一致                                              |
| 数据库 | SQLite via Node 22 内置 `node:sqlite`（`DatabaseSync`）        | 单文件、零配置、关系型；无原生编译依赖（避开 better-sqlite3 的 Windows 编译问题） |
| 认证  | JWT + bcrypt                                               | 简单可靠                                                  |
| LLM | DeepSeek（deepseek-chat）+ zod                               | OpenAI 兼容；structured output；失败降级                      |
| 时区  | luxon（Australia/Melbourne）                                 | 作业硬性要求                                                |

## 业务规则一览（详见 DESIGN.md §4）

| #  | 规则                       | 执行层                     |
| -- | ------------------------ | ----------------------- |
| R1 | 同一学生只能有 1 条 completed 试听 | DB partial unique + 业务层 |
| R2 | 排课时间冲突                   | 业务层（区间比较）               |
| R3 | admin 只能改自己归属的学生         | 路由层 + 业务层               |
| R4 | 课时余额不能透支                 | DB CHECK + 业务层事务        |
| R5 | 试听反馈只能由任课老师提交            | 路由层所有权校验                |
| R6 | 流失学生不能排试听                | 业务层                     |
| R7 | 跟进 due\_at 必须晚于现在        | 业务层                     |

## AI 工具使用说明（作业要求必填）

- **工具**：TRAE（基于 GLM 模型）

- **用在哪些环节**：

  1. 需求理解与方案设计（DESIGN.md 的取舍依据、规则分层）
  2. 全部代码生成（前后端）
  3. 调试与错误排查

- **AI 给出但没采纳的建议**：

  - ❌ AI 建议用 Prisma ORM → 我没用。SQLite + `node:sqlite` 直接写 SQL 更简单、对单文件部署更友好，表也不多，ORM 是过度设计。

  - ❌ AI 建议用 better-sqlite3 → 我改用 Node 22 内置的 `node:sqlite`（`DatabaseSync`）。理由：better-sqlite3 需要原生编译，Windows 上没装 Visual Studio Build Tools 会 `gyp ERR! find VS`；`node:sqlite` 零依赖，用 `--experimental-sqlite` 启动即可。

  - ❌ AI 建议"AI 抽取失败返回 500 让前端报错" → 我改成降级返回 200 + `_degraded: true`。理由：作业要求"失败时系统照常工作"，AI 是辅助不是核心，不能让一次 LLM 抖动把整个试听反馈流程搞挂。

  - ❌ AI 建议前端用 Next.js 做 SSR → 我用纯 Vite SPA。理由：本作业是内部管理系统，没有 SEO 需求，SSR 增加复杂度无收益。

  - ❌ AI 建议"试听一次"用应用层全局变量锁 → 我用 SQLite partial unique index。理由：DB 层约束最稳，防业务层 bug、防直接 SQL 改库。

- **保留完整 git 历史**：所有 commit 都保留，未 squash。`git log` 可以看到从骨架 → 后端 → 前端 → 文档的完整开发过程。

