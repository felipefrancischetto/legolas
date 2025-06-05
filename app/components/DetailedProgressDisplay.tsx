'use client';

import { useState, useEffect } from 'react';

interface ProgressStep {
  type: string;
  step: string;
  substep?: string;
  detail?: string;
  progress?: number;
  timestamp: string;
  completed?: boolean;
}

interface DetailedProgressDisplayProps {
  currentStep: string;
  currentSubstep?: string;
  progress: number;
  detail?: string;
  isConnected: boolean;
  type: 'individual' | 'playlist';
}

export default function DetailedProgressDisplay({
  currentStep,
  currentSubstep,
  progress,
  detail,
  isConnected,
  type
}: DetailedProgressDisplayProps) {
  const [steps, setSteps] = useState<ProgressStep[]>([]);

  // Adicionar novo passo quando mudar
  useEffect(() => {
    if (currentStep && currentStep !== 'Conectando...') {
      setSteps(prev => {
        const lastStep = prev[prev.length - 1];
        
        // Não adicionar se for o mesmo passo
        if (lastStep && lastStep.step === currentStep && lastStep.substep === currentSubstep) {
          return prev;
        }

        // Marcar passo anterior como completo
        const updatedPrev = prev.map((step, index) => 
          index === prev.length - 1 
            ? { ...step, completed: true }
            : step
        );

        // Adicionar novo passo
        const newStep: ProgressStep = {
          type: getStepType(currentStep),
          step: currentStep,
          substep: currentSubstep,
          detail,
          progress,
          timestamp: new Date().toISOString(),
          completed: false
        };

        return [...updatedPrev, newStep];
      });
    }
  }, [currentStep, currentSubstep, progress, detail]);

  const getStepType = (step: string): string => {
    if (step.includes('Conectado') || step.includes('Preparando')) return 'init';
    if (step.includes('pasta') || step.includes('Verificando')) return 'setup';
    if (step.includes('informações') || step.includes('Extraindo')) return 'info';
    if (step.includes('Baixando') || step.includes('download')) return 'download';
    if (step.includes('metadados') || step.includes('Beatport')) return 'metadata';
    if (step.includes('Escrevendo') || step.includes('tags')) return 'tagging';
    if (step.includes('Verificação') || step.includes('integridade')) return 'verification';
    if (step.includes('concluído') || step.includes('finalizado')) return 'complete';
    return 'unknown';
  };

  const getStepIcon = (stepType: string, completed: boolean) => {
    const baseClass = `w-4 h-4 ${completed ? 'text-green-400' : 'text-blue-400'}`;
    
    switch (stepType) {
      case 'init':
        return <div className={`${baseClass} bg-blue-500 rounded-full ${!completed ? 'animate-pulse' : ''}`} />;
      case 'setup':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        );
      case 'info':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'download':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        );
      case 'metadata':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        );
      case 'tagging':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'verification':
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'complete':
        return (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      default:
        return <div className={`w-4 h-4 bg-zinc-500 rounded-full ${!completed ? 'animate-pulse' : ''}`} />;
    }
  };

  // Limpar passos quando não há download ativo
  useEffect(() => {
    if (!currentStep || currentStep === 'Conectando...') {
      setSteps([]);
    }
  }, [currentStep]);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v11a2 2 0 002 2h5.586a1 1 0 00.707-.293l5.414-5.414a1 1 0 00.293-.707V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Progresso Detalhado
        </h4>
        
        {/* Indicador de conexão */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-xs text-zinc-400">
            {isConnected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Lista de passos */}
      <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3 p-2 rounded bg-zinc-800/30">
            {/* Ícone do passo */}
            <div className="flex-shrink-0 mt-0.5">
              {getStepIcon(step.type, step.completed || false)}
            </div>
            
            {/* Conteúdo do passo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={`text-sm ${step.completed ? 'text-green-400' : 'text-white'} font-medium`}>
                  {step.step}
                </p>
                <span className="text-xs text-zinc-500">
                  {step.progress}%
                </span>
              </div>
              
              {/* Substep */}
              {step.substep && (
                <p className="text-xs text-zinc-400 mt-1">
                  {step.substep}
                </p>
              )}
              
              {/* Detail */}
              {step.detail && (
                <p className="text-xs text-zinc-500 mt-1 truncate">
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Progresso geral */}
      <div className="mt-3 pt-3 border-t border-zinc-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-400">Progresso Geral</span>
          <span className="text-xs text-zinc-400">{progress}%</span>
        </div>
        <div className="w-full bg-zinc-700 rounded-full h-1.5">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
} 