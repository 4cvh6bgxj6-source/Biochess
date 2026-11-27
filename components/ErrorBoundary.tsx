'use client';

import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { normalizeUiLang, type SupportedUiLang } from '@/lib/i18n';

interface ErrorBoundaryState {
  hasError: boolean;
  errorType: 'unexpected' | 'quota' | 'permission' | 'custom';
  customMessage: string;
}

const ERR_STRINGS: Record<
  SupportedUiLang,
  {
    title: string;
    unexpected: string;
    quota: string;
    permission: string;
    reloadBtn: string;
  }
> = {
  it: {
    title: 'Qualcosa è andato storto',
    unexpected: 'Si è verificato un errore imprevisto di connessione.',
    quota: 'Quota giornaliera del database esaurita. Riprova domani.',
    permission: 'Permessi insufficienti o sessione non valida. Ricarica la pagina.',
    reloadBtn: 'Ricarica BioChess',
  },
  en: {
    title: 'Something went wrong',
    unexpected: 'An unexpected connection error occurred.',
    quota: 'Daily database quota reached. Please try again tomorrow.',
    permission: 'Insufficient permissions or invalid session. Please reload.',
    reloadBtn: 'Reload BioChess',
  },
  es: {
    title: 'Algo salió mal',
    unexpected: 'Se produjo un error inesperado de conexión.',
    quota: 'Se alcanzó la cuota diaria de la base de datos. Inténtalo mañana.',
    permission: 'Permisos insuficientes o sesión no válida. Recarga la página.',
    reloadBtn: 'Recargar BioChess',
  },
  fr: {
    title: 'Un problème est survenu',
    unexpected: 'Une erreur de connexion inattendue est survenue.',
    quota: 'Quota quotidien de la base de données atteint. Réessayez demain.',
    permission: 'Permissions insuffisantes ou session invalide. Rechargez la page.',
    reloadBtn: 'Recharger BioChess',
  },
  de: {
    title: 'Etwas ist schiefgelaufen',
    unexpected: 'Ein unerwarteter Verbindungsfehler ist aufgetreten.',
    quota: 'Tageskontingent der Datenbank erreicht. Versuche es morgen erneut.',
    permission: 'Unzureichende Berechtigungen oder ungültige Sitzung. Seite neu laden.',
    reloadBtn: 'BioChess neu laden',
  },
  pt: {
    title: 'Algo deu errado',
    unexpected: 'Ocorreu um erro inesperado de conexão.',
    quota: 'Cota diária do banco de dados atingida. Tente novamente amanhã.',
    permission: 'Permissões insuficientes ou sessão inválida. Recarregue a página.',
    reloadBtn: 'Recarregar BioChess',
  },
  ru: {
    title: 'Что-то пошло не так',
    unexpected: 'Произошла непредвиденная ошибка соединения.',
    quota: 'Дневной лимит базы данных исчерпан. Повторите попытку завтра.',
    permission: 'Недостаточно прав или сессия устарела. Перезагрузите страницу.',
    reloadBtn: 'Перезагрузить BioChess',
  },
  zh: {
    title: '出现错误',
    unexpected: '发生了意外的连接错误。',
    quota: '今日数据库配额已用完，请明天再试。',
    permission: '权限不足或会话无效，请刷新页面。',
    reloadBtn: '重新加载 BioChess',
  },
  ja: {
    title: 'エラーが発生しました',
    unexpected: '予期しない接続エラーが発生しました。',
    quota: '本日のデータベース上限に達しました。明日もう一度お試しください。',
    permission: '権限が不足しているか、セッションが無効です。再読み込みしてください。',
    reloadBtn: 'BioChess を再読み込み',
  },
  ko: {
    title: '문제가 발생했습니다',
    unexpected: '예기치 않은 연결 오류가 발생했습니다.',
    quota: '일일 데이터베이스 할당량에 도달했습니다. 내일 다시 시도하세요.',
    permission: '권한이 부족하거나 세션이 유효하지 않습니다. 페이지를 새로 고치세요.',
    reloadBtn: 'BioChess 새로고침',
  },
  ar: {
    title: 'حدث خطأ ما',
    unexpected: 'حدث خطأ غير متوقع في الاتصال.',
    quota: 'تم استهلاك الحصة اليومية لقاعدة البيانات. حاول غداً.',
    permission: 'صلاحيات غير كافية أو جلسة غير صالحة. أعد تحميل الصفحة.',
    reloadBtn: 'إعادة تحميل BioChess',
  },
};

function resolveBoundaryLang(): SupportedUiLang {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem('biochess_lang');
      if (saved) return normalizeUiLang(saved);
    } catch {
      // ignore storage errors
    }
    const nav = window.navigator?.language?.split('-')[0];
    if (nav) return normalizeUiLang(nav);
  }
  return 'en';
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorType: 'unexpected', customMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('quota')) {
          return { hasError: true, errorType: 'quota', customMessage: '' };
        }
        if (parsed.error.toLowerCase().includes('permission')) {
          return { hasError: true, errorType: 'permission', customMessage: '' };
        }
      }
    } catch {
      if (error.message && error.message.length < 180) {
        return { hasError: true, errorType: 'custom', customMessage: error.message };
      }
    }
    return { hasError: true, errorType: 'unexpected', customMessage: '' };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('BioChess ErrorBoundary caught error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      const copy = ERR_STRINGS[resolveBoundaryLang()] || ERR_STRINGS.en;
      const msg =
        this.state.errorType === 'quota'
          ? copy.quota
          : this.state.errorType === 'permission'
            ? copy.permission
            : this.state.errorType === 'custom' && this.state.customMessage
              ? this.state.customMessage
              : copy.unexpected;

      return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-[#302E2B] text-[#F3F3F2]">
          <div className="w-full max-w-md bg-[#262421] border border-[#3C3A36] rounded-lg p-6 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center mx-auto mb-4 text-red-300">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-extrabold text-white">{copy.title}</h1>
            <p className="text-sm text-[#BABABA] mt-2">{msg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-5 py-2.5 rounded-md bg-[#81B64C] hover:bg-[#95C85E] text-white text-sm font-bold border-b-4 border-[#5D8A32] inline-flex items-center gap-2 transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              <span>{copy.reloadBtn}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
