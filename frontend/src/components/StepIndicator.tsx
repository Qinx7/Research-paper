"use client";

const STEPS = [
  { num: 1, name: "需求分析" },
  { num: 2, name: "文献检索" },
  { num: 3, name: "文献分析" },
  { num: 4, name: "研究方向" },
  { num: 5, name: "项目设计" },
  { num: 6, name: "生成成果" },
];

interface Props {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ currentStep, onStepClick }: Props) {
  return (
    <div className="overflow-x-auto py-2">
      <div className="flex min-w-max items-center justify-center gap-0 rounded-[22px] border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-4 py-4">
      {STEPS.map((step, i) => {
        const isCompleted = step.num < currentStep;
        const isActive = step.num === currentStep;

        return (
          <div key={step.num} className="flex items-center">
            <button
              className="group flex min-w-[80px] flex-col items-center gap-1.5 px-1"
              disabled={!isCompleted}
              onClick={() => onStepClick?.(step.num)}
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold transition-all"
                style={{
                  borderColor: isCompleted || isActive ? "#1b2d1b" : "rgba(26,22,18,0.12)",
                  background: isCompleted ? "#1b2d1b" : isActive ? "rgba(27,45,27,0.08)" : "#fffdf8",
                  color: isCompleted ? "#ede8da" : isActive ? "#1b2d1b" : "#9e9282",
                  boxShadow: isActive ? "0 10px 25px rgba(27,45,27,0.12)" : "none",
                  cursor: isCompleted ? "pointer" : "default",
                }}
              >
                {isCompleted ? "✓" : step.num}
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-[#9e9282]" style={{ fontFamily: "monospace" }}>
                {String(step.num).padStart(2, "0")}
              </span>
              <span
                className="whitespace-nowrap text-[12px] font-medium"
                style={{
                  color: isCompleted || isActive ? "#1a1612" : "#9e9282",
                }}
              >
                {step.name}
              </span>
            </button>

            {i < STEPS.length - 1 && (
              <div
                className="mx-2 h-px w-8 sm:w-12"
                style={{
                  background: step.num < currentStep ? "#1b2d1b" : "rgba(26,22,18,0.12)",
                }}
              />
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
