"use client";

// 工作台设置弹窗：参考下载设计的个人信息/偏好配置面板。
import { useState, type ReactNode } from "react";
import { CHAT_THEME } from "./chatTheme";

type SectionId = "profile" | "research" | "ai" | "notify" | "privacy";

const navItems: { id: SectionId; label: string; desc: string; icon: ReactNode }[] = [
  { id: "profile", label: "个人信息", desc: "姓名、机构、研究阶段", icon: <UserIcon /> },
  { id: "research", label: "研究偏好", desc: "领域、引用格式、期刊", icon: <BookIcon /> },
  { id: "ai", label: "AI 设置", desc: "回复风格、检索数量", icon: <CpuIcon /> },
  { id: "notify", label: "通知设置", desc: "邮件与站内消息", icon: <BellIcon /> },
  { id: "privacy", label: "隐私与安全", desc: "数据授权、密码", icon: <ShieldIcon /> },
];

export default function WorkbenchSettingsPanel({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<SectionId>("profile");
  const activeItem = navItems.find((item) => item.id === active) || navItems[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(26,22,18,0.42)", backdropFilter: "blur(4px)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="flex max-h-[88vh] w-full max-w-[880px] overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: CHAT_THEME.bg, boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}
      >
        <aside className="flex w-[230px] shrink-0 flex-col" style={{ background: CHAT_THEME.card, borderRight: `1px solid ${CHAT_THEME.border}` }}>
          <div className="flex flex-col items-center px-5 pb-5 pt-6" style={{ borderBottom: `1px solid ${CHAT_THEME.border}` }}>
            <div className="relative mb-3">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold"
                style={{ background: CHAT_THEME.accentSoft, color: CHAT_THEME.accentLight, border: `2px solid ${CHAT_THEME.accentBorder}` }}
              >
                研
              </div>
              <span
                className="absolute -bottom-1 -right-1 grid h-[22px] w-[22px] place-items-center rounded-full"
                style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg, border: `2px solid ${CHAT_THEME.card}` }}
              >
                <CameraIcon />
              </span>
            </div>
            <div className="text-sm font-semibold" style={{ color: CHAT_THEME.text }}>研究员用户</div>
            <div className="mt-1 text-[11.5px]" style={{ color: CHAT_THEME.low }}>researcher@university.edu</div>
            <div
              className="mt-2.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
              style={{ background: CHAT_THEME.primarySoft, border: `1px solid rgba(27,45,27,0.15)`, color: CHAT_THEME.primary }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHAT_THEME.primary }} />
              免费版
            </div>
          </div>

          <nav className="flex-1 px-2 py-3">
            {navItems.map((item) => {
              const selected = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                  style={{
                    background: selected ? CHAT_THEME.bg : "transparent",
                    border: `1px solid ${selected ? CHAT_THEME.border : "transparent"}`,
                  }}
                >
                  <span style={{ color: selected ? CHAT_THEME.accent : CHAT_THEME.low }}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px]" style={{ color: selected ? CHAT_THEME.text : CHAT_THEME.mid, fontWeight: selected ? 500 : 400 }}>
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px]" style={{ color: CHAT_THEME.low }}>
                      {item.desc}
                    </span>
                  </span>
                  {selected && <ChevronIcon />}
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-3" style={{ borderTop: `1px solid ${CHAT_THEME.border}` }}>
            <div className="text-[10.5px]" style={{ color: CHAT_THEME.low, fontFamily: "monospace" }}>Scholar v2.4.1</div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between px-7 py-4" style={{ borderBottom: `1px solid ${CHAT_THEME.border}` }}>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: CHAT_THEME.text, fontFamily: "var(--font-cormorant), serif" }}>
                {activeItem.label}
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: CHAT_THEME.low }}>{activeItem.desc}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full text-lg"
              style={{ background: CHAT_THEME.muted, color: CHAT_THEME.mid }}
              title="关闭"
            >
              ×
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-7 py-6" style={{ scrollbarWidth: "none" }}>
            {active === "profile" && <ProfileSection />}
            {active === "research" && <ResearchSection />}
            {active === "ai" && <AISection />}
            {active === "notify" && <NotifySection />}
            {active === "privacy" && <PrivacySection />}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileSection() {
  return (
    <div>
      <FieldRow>
        <Field label="姓名 / 昵称"><Input defaultValue="研究员用户" /></Field>
        <Field label="邮箱地址"><Input defaultValue="researcher@university.edu" type="email" /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="所属机构"><Input defaultValue="清华大学" /></Field>
        <Field label="院系 / 部门"><Input defaultValue="计算机科学与技术系" /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="职称 / 身份">
          <Select options={["博士生", "硕士生", "博士后", "助理教授", "副教授", "教授", "研究员"]} defaultValue="博士生" />
        </Field>
        <Field label="研究阶段">
          <Select options={["选题阶段", "文献调研", "实验阶段", "写作阶段", "投稿阶段"]} defaultValue="文献调研" />
        </Field>
      </FieldRow>
      <Field label="个人简介" span>
        <textarea
          defaultValue="专注于自然语言处理与知识图谱方向的研究，主要关注检索增强生成技术的优化与应用。"
          rows={3}
          className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[13.5px] leading-7 outline-none"
          style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}`, color: CHAT_THEME.text }}
        />
      </Field>
      <SaveButton />
    </div>
  );
}

function ResearchSection() {
  return (
    <div>
      <FieldRow>
        <Field label="主要研究领域">
          <Select options={["计算机科学", "生物医学", "物理学", "经济学", "社会学", "材料科学"]} defaultValue="计算机科学" />
        </Field>
        <Field label="检索语言偏好">
          <Select options={["中英文均可", "仅中文", "仅英文"]} defaultValue="中英文均可" />
        </Field>
      </FieldRow>
      <Field label="研究子方向" span><Input defaultValue="自然语言处理, 知识图谱, 检索增强生成" /></Field>
      <FieldRow>
        <Field label="引用格式"><Select options={["APA 7th", "MLA 9th", "Chicago 17th", "Vancouver", "GB/T 7714"]} defaultValue="APA 7th" /></Field>
        <Field label="文献时间范围"><Select options={["近 1 年", "近 3 年", "近 5 年", "近 10 年", "不限"]} defaultValue="近 5 年" /></Field>
      </FieldRow>
      <Field label="关注的顶会 / 期刊" span><Input defaultValue="NeurIPS, ACL, EMNLP, ICLR, AAAI, Nature Machine Intelligence" /></Field>
      <SaveButton />
    </div>
  );
}

function AISection() {
  return (
    <div>
      <FieldRow>
        <Field label="AI 回复语言"><Select options={["中文", "英文", "自动匹配提问语言"]} defaultValue="中文" /></Field>
        <Field label="回复详细程度"><Select options={["简洁", "标准", "详细"]} defaultValue="标准" /></Field>
      </FieldRow>
      <Field label="每次检索返回文献数"><Select options={["3 篇", "5 篇", "10 篇", "20 篇"]} defaultValue="5 篇" /></Field>
      <SectionLabel>功能开关</SectionLabel>
      <Toggle defaultChecked label="自动推荐相关文献" desc="根据当前话题智能推荐" />
      <Toggle defaultChecked label="显示论文摘要" desc="文献卡片展开时显示" />
      <Toggle defaultChecked label="启用 AI 写作建议" desc="写作模块实时分析并给出改进意见" />
      <Toggle label="实验性：多跳推理检索" desc="适用于复杂知识密集型问题" />
      <SaveButton />
    </div>
  );
}

function NotifySection() {
  return (
    <div>
      <SectionLabel>邮件通知</SectionLabel>
      <Toggle defaultChecked label="每周文献推送摘要" desc="按关注方向整理近期新论文" />
      <Toggle defaultChecked label="研究方向重大进展提醒" />
      <Toggle label="系统公告与功能更新" />
      <SectionLabel className="mt-4">站内通知</SectionLabel>
      <Toggle defaultChecked label="AI 任务完成提醒" />
      <Toggle defaultChecked label="文献分析完成通知" />
      <SaveButton />
    </div>
  );
}

function PrivacySection() {
  return (
    <div>
      <SectionLabel>数据授权</SectionLabel>
      <Toggle defaultChecked label="允许使用搜索记录优化推荐" desc="帮助 AI 更精准地理解研究偏好" />
      <Toggle defaultChecked label="参与匿名使用统计" desc="用于改善产品体验，不含个人信息" />
      <Toggle label="公开研究方向主页" desc="其他用户可查看研究方向概况" />
      <SectionLabel className="mt-4">修改密码</SectionLabel>
      <FieldRow>
        <Field label="新密码"><Input placeholder="至少 8 位" type="password" /></Field>
        <Field label="确认密码"><Input placeholder="再次输入" type="password" /></Field>
      </FieldRow>
      <SaveButton label="更新密码" />
    </div>
  );
}

function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

function Field({ label, span, children }: { label: string; span?: boolean; children: ReactNode }) {
  return (
    <div className={`mb-4 ${span ? "md:col-span-2" : ""}`}>
      <label className="mb-1.5 block text-[11.5px]" style={{ color: CHAT_THEME.mid }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ defaultValue, placeholder, type = "text" }: { defaultValue?: string; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      defaultValue={defaultValue}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none"
      style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}`, color: CHAT_THEME.text }}
    />
  );
}

function Select({ options, defaultValue }: { options: string[]; defaultValue?: string }) {
  return (
    <select
      defaultValue={defaultValue}
      className="w-full rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none"
      style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}`, color: CHAT_THEME.text }}
    >
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
}

function Toggle({ defaultChecked, label, desc }: { defaultChecked?: boolean; label: string; desc?: string }) {
  const [on, setOn] = useState(defaultChecked ?? false);
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid rgba(26,22,18,0.07)` }}>
      <div>
        <div className="text-[13.5px]" style={{ color: CHAT_THEME.text }}>{label}</div>
        {desc && <div className="mt-0.5 text-[11.5px]" style={{ color: CHAT_THEME.low }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => setOn((value) => !value)}
        className="relative ml-4 h-[22px] w-10 shrink-0 rounded-full transition-all"
        style={{ background: on ? CHAT_THEME.primary : CHAT_THEME.muted }}
      >
        <span
          className="absolute top-1 h-3.5 w-3.5 rounded-full transition-all"
          style={{ background: on ? CHAT_THEME.bg : CHAT_THEME.low, left: on ? "calc(100% - 18px)" : 4 }}
        />
      </button>
    </div>
  );
}

function SaveButton({ label = "保存更改" }: { label?: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1600);
      }}
      className="mt-6 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all"
      style={{
        background: saved ? CHAT_THEME.primarySoft : CHAT_THEME.primary,
        border: saved ? `1px solid rgba(27,45,27,0.15)` : "1px solid transparent",
        color: saved ? CHAT_THEME.primary : CHAT_THEME.bg,
      }}
    >
      {saved ? "已保存" : label}
    </button>
  );
}

function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mb-1 text-xs uppercase tracking-[0.04em] ${className}`} style={{ color: CHAT_THEME.mid }}>
      {children}
    </div>
  );
}

function BaseIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function UserIcon() { return <BaseIcon><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></BaseIcon>; }
function BookIcon() { return <BaseIcon><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></BaseIcon>; }
function CpuIcon() { return <BaseIcon><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" /></BaseIcon>; }
function BellIcon() { return <BaseIcon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></BaseIcon>; }
function ShieldIcon() { return <BaseIcon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></BaseIcon>; }
function CameraIcon() { return <BaseIcon><path d="M8 7h8l1 2h3v9H4V9h3z" /><circle cx="12" cy="13" r="3" /></BaseIcon>; }
function ChevronIcon() { return <BaseIcon><path d="m9 18 6-6-6-6" /></BaseIcon>; }
