"use client";

interface Props {
  isLoading: boolean;
  error: string | null;
  loadingMessage?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

export default function StageWrapper({
  isLoading,
  error,
  loadingMessage = "正在处理中...",
  onRetry,
  children,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
        <p className="text-gray-500 text-base">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700 mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
          >
            重试
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
