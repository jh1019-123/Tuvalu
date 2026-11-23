import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  public state: State = { hasError: false, message: '' };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || '예기치 못한 오류가 발생했습니다.' };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App ErrorBoundary caught:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#062835] p-6 text-slate-100">
          <div className="max-w-md rounded-2xl border border-teal-400/30 bg-[#0b3444] p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-amber-300">문제가 발생했습니다</h2>
            <p className="mt-2 text-sm text-slate-300 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-teal-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-teal-400 transition-colors cursor-pointer"
            >
              게임 다시 불러오기
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
