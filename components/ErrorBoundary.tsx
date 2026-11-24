'use client';

import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMsg = 'Si è verificato un errore imprevisto di connessione.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('quota')) {
          displayMsg = 'Quota giornaliera del database esaurita. Riprova domani.';
        } else if (parsed.error.toLowerCase().includes('permission')) {
          displayMsg = 'Permessi insufficienti o sessione non valida. Ricarica la pagina.';
        }
      }
    } catch {
      if (error.message && error.message.length < 180) {
        displayMsg = error.message;
      }
    }
    return { hasError: true, message: displayMsg };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('BioChess ErrorBoundary caught error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-[#302E2B] text-[#F3F3F2]">
          <div className="w-full max-w-md bg-[#262421] border border-[#3C3A36] rounded-lg p-6 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center mx-auto mb-4 text-red-300">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-extrabold text-white">Qualcosa è andato storto</h1>
            <p className="text-sm text-[#BABABA] mt-2">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-5 py-2.5 rounded-md bg-[#81B64C] hover:bg-[#95C85E] text-white text-sm font-bold border-b-4 border-[#5D8A32] inline-flex items-center gap-2 transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              <span>Ricarica BioChess</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
